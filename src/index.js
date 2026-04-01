require('dotenv').config()
const { Client } = require('@xhayper/discord-rpc')
const { applicationId, activity, connection, gameDetection } = require('../config')
const { pluralise } = require('./utils/string')
const { detectGame } = require('./utils/gameDetector')
const { findAppIdByGameName } = require('./utils/discordGamesList')
const ConfigSchema = require('./schemas/ConfigSchema')
const logger = require('./utils/logger')

const MAX_RETRIES = connection.maxRetries
const RETRY_INTERVAL = connection.retryInterval * 1000

let client
let retryCount = 0
let currentGame = null
let currentImageUrl = null
let gameCheckInterval = null
let effectiveAppId = applicationId // Will be updated at startup if game detected
let hasOfficialAppId = false // Track if using official Discord App ID

const updateActivity = (sanitisedActivity) => {
  client.user?.setActivity(sanitisedActivity)
  logger.success(`Successfully updated ${client.user?.username}'s Rich Presence.`)
}

const buildActivityWithGame = (gameName, imageUrl = null, useOfficialId = false) => {
  const baseActivity = sanitiseActivity()
  return {
    ...baseActivity,
    details: useOfficialId ? undefined : gameName, // Don't show game name if using official App ID
    state: undefined,
    largeImageKey: imageUrl || activity.assets.largeImageKey,
    largeImageText: gameName,
  }
}

const checkAndUpdateGame = async () => {
  if (!gameDetection.enabled) return

  const detected = await detectGame()
  const newGame = detected?.gameName || null

  if (newGame !== currentGame) {
    currentGame = newGame

    if (currentGame) {
      // Game detected - connect if not already
      if (!client) {
        // Find App ID first
        const startTime = Date.now()
        const gameInfo = await findAppIdByGameName(currentGame)
        const lookupTime = Date.now() - startTime

        if (gameInfo) {
          effectiveAppId = gameInfo.appId
          hasOfficialAppId = true
          logger.info(`Found Discord App ID in ${lookupTime}ms: ${gameInfo.name} (${gameInfo.appId})`)
        } else {
          effectiveAppId = applicationId
          hasOfficialAppId = false
          logger.info(`No Discord App ID found for ${currentGame}, using default`)
        }
        connectToDiscord()
      } else {
        logger.info(`Detected game change: ${currentGame}`)
        currentImageUrl = detected?.imageUrl || null
        const activityWithGame = buildActivityWithGame(currentGame, currentImageUrl, hasOfficialAppId)
        updateActivity(activityWithGame)
      }
    } else {
      // No game - disconnect from Discord
      currentImageUrl = null
      disconnectFromDiscord()
    }
  }
}

const startGameDetection = () => {
  if (!gameDetection.enabled) {
    logger.info('Game detection is disabled')
    return
  }

  const intervalMs = (gameDetection.checkInterval || 5) * 1000
  logger.info(`Starting game detection (checking every ${gameDetection.checkInterval || 5}s)`)

  // Check periodically
  gameCheckInterval = setInterval(() => {
    checkAndUpdateGame().catch(() => {})
  }, intervalMs)
}

const stopGameDetection = () => {
  if (gameCheckInterval) {
    clearInterval(gameCheckInterval)
    gameCheckInterval = null
  }
}

const connectToDiscord = () => {
  if (client) return // Already connected

  client = new Client({ transport: { type: 'ipc' }, clientId: effectiveAppId })
  logger.info(`Attempting to establish a connection with Discord (App ID: ${effectiveAppId}).`)
  establishConnection()
}

const disconnectFromDiscord = () => {
  if (!client) return // Not connected

  logger.info('Disconnecting from Discord (no game running)')
  client.user?.clearActivity()
  client.destroy()
  client = null
}

const sanitiseActivity = (withGame = null) => {
  const buttons = []
  const buttonObj = Object.values(activity.buttons)
  buttonObj.forEach((button) => {
    if (button.label && button.url) {
      buttons.push(button)
    }
  })

  const sanitisedActivity = {
    details: withGame || activity.details,
    detailsUrl: activity.detailsUrl,
    state: withGame ? undefined : activity.state,
    stateUrl: activity.stateUrl,
    partySize: activity.party.partySize,
    partyMax: activity.party.partyMax,
    startTimestamp: activity.timestamps.startTimestamp,
    endTimestamp: activity.timestamps.endTimestamp,
    largeImageKey: activity.assets.largeImageKey,
    largeImageText: withGame || activity.assets.largeImageText,
    largeImageUrl: activity.assets.largeImageUrl,
    smallImageKey: activity.assets.smallImageKey,
    smallImageText: activity.assets.smallImageText,
    smallImageUrl: activity.assets.smallImageUrl,
    buttons: buttons.length ? buttons : undefined,
    instance: false,
    type: activity.type,
    statusDisplayType: activity.statusDisplayType ?? 0,
  }
  return sanitisedActivity
}

const updateRichPresence = (withGame = null) => {
  const activityObj = sanitiseActivity(withGame)
  logger.info(`Attempting to update ${client.user?.username}'s Rich Presence.`)
  updateActivity(activityObj)
}

const retryConnection = () => {
  if (client) {
    client.user?.clearActivity()
    client.destroy()
    client = null
    client = new Client({
      transport: { type: 'ipc' },
      clientId: effectiveAppId,
    })
  }
  if (retryCount < MAX_RETRIES) {
    logger.info(
      `Attempting to establish a connection with Discord. Retrying in ${
        RETRY_INTERVAL / 1000
      } ${pluralise(RETRY_INTERVAL / 1000, 'second')} - ${MAX_RETRIES - retryCount} ${pluralise(
        MAX_RETRIES - retryCount,
        'attempt'
      )} remaining.`
    )
    setTimeout(() => establishConnection((retryCount += 1)), RETRY_INTERVAL)
  } else {
    logger.error(
      `Failed to establish a connection with Discord after ${MAX_RETRIES} ${pluralise(
        MAX_RETRIES - retryCount,
        'attempt'
      )}. Maximum retries reached - will retry when game changes.`
    )
    // Clear client so next game detection will try again
    client = null
  }
}

const establishConnection = () => {
  try {
    client.login()
    client.on('ready', () => {
      logger.success(
        `Successfully established a connection with Discord. Username: ${client.user?.username}.`
      )
      retryCount = 0
      const activityWithGame = buildActivityWithGame(currentGame, currentImageUrl, hasOfficialAppId)
      updateActivity(activityWithGame)
    })
    client.transport.once('close', () => {
      logger.warning('Connection with Discord closed.')
      client = null
    })
  } catch (error) {
    retryConnection()
  }
}

// Fast startup: detect game and find App ID before connecting
const initialiseWithGameDetection = async () => {
  logger.info('Checking for running games...')

  const detected = await detectGame()

  if (detected?.gameName) {
    currentGame = detected.gameName
    currentImageUrl = detected.imageUrl
    logger.info(`Game detected at startup: ${currentGame}`)

    // Fast O(1) lookup for Discord App ID
    const startTime = Date.now()
    const gameInfo = await findAppIdByGameName(currentGame)
    const lookupTime = Date.now() - startTime

    if (gameInfo) {
      effectiveAppId = gameInfo.appId
      hasOfficialAppId = true
      logger.info(`Found Discord App ID in ${lookupTime}ms: ${gameInfo.name} (${gameInfo.appId})`)
      logger.info('Using game\'s official Discord App ID for connection')
    } else {
      effectiveAppId = applicationId
      hasOfficialAppId = false
      logger.info(`No Discord App ID found for ${currentGame} (lookup took ${lookupTime}ms)`)
      logger.info('Using custom App ID with game artwork from SteamGridDB')
    }

    // Connect to Discord since game is running
    connectToDiscord()
  } else {
    logger.info('No game detected at startup, waiting for game to start...')
    startGameDetection()
  }
}

const validateConfig = () => {
  const validationResult = ConfigSchema.validate(
    {
      applicationId,
      activity,
      connection,
      gameDetection,
    },
    { abortEarly: false, stripUnknown: true }
  )
  if (validationResult.error) {
    logger.error('Failed to validate the "config.js" file.')
    validationResult.error.details.map(({ message }) => {
      logger.info(message)
    })
    return (process.exitCode = 1)
  } else {
    logger.success('Successfully validated the "config.js" file.')
    initialiseWithGameDetection()
  }
}

process.on('unhandledRejection', (error) => {
  if (error.message === 'Could not connect') {
    if (retryCount < MAX_RETRIES) {
      logger.warning('Failed to establish a connection with Discord.')
    }
    retryConnection()
  }
})

process.on('SIGINT', () => {
  logger.info('Shutting down...')
  stopGameDetection()
  process.exit(0)
})

process.on('exit', () => {
  stopGameDetection()
})

validateConfig()
