const https = require('https')
const { getGameImage: getSteamGameImage } = require('./gameImageFetcher')

// SteamGridDB API configuration
// Get your API key from: https://www.steamgriddb.com/profile/preferences/api
// Set STEAMGRIDDB_API_KEY environment variable to use
const STEAMGRIDDB_API_KEY = process.env.STEAMGRIDDB_API_KEY
const STEAMGRIDDB_API_BASE = 'https://www.steamgriddb.com/api/v2'

// Cache for game images
const sgdbCache = new Map()

// Make request to SteamGridDB API
function sgdbRequest(endpoint) {
  return new Promise((resolve, reject) => {
    if (!STEAMGRIDDB_API_KEY) {
      resolve(null)
      return
    }

    const url = `${STEAMGRIDDB_API_BASE}${endpoint}`
    const options = {
      headers: {
        'Authorization': `Bearer ${STEAMGRIDDB_API_KEY}`,
        'Accept': 'application/json',
      },
      timeout: 10000,
    }

    const req = https.get(url, options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(data)
            resolve(json)
          } else {
            resolve(null)
          }
        } catch (error) {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
  })
}

// Search for game by name on SteamGridDB
async function searchSGDBGame(gameName) {
  const encodedName = encodeURIComponent(gameName)
  const result = await sgdbRequest(`/search/autocomplete/${encodedName}`)
  
  if (result && result.data && result.data.length > 0) {
    return result.data[0]
  }
  return null
}

// Get square (1:1) grids for a game
async function getSGDBSquareImage(gameId) {
  const result = await sgdbRequest(`/grids/game/${gameId}?dimensions=512x512,1024x1024`)
  
  if (result && result.data && result.data.length > 0) {
    return result.data[0].url
  }
  return null
}

// Get game image from SteamGridDB (square format for Discord)
async function getGameImageSquare(gameName) {
  if (!gameName) return null

  // Check cache
  if (sgdbCache.has(gameName)) {
    return sgdbCache.get(gameName)
  }

  // Try SteamGridDB first (if API key is set)
  if (STEAMGRIDDB_API_KEY) {
    try {
      const game = await searchSGDBGame(gameName)
      if (game) {
        const squareImage = await getSGDBSquareImage(game.id)
        if (squareImage) {
          const result = {
            name: game.name,
            imageUrl: squareImage,
            source: 'steamgriddb',
          }
          sgdbCache.set(gameName, result)
          return result
        }
      }
    } catch (error) {
      // Fall through to Steam
    }
  }

  // Fallback to Steam (returns header, not square but better than nothing)
  const steamResult = await getSteamGameImage(gameName)
  if (steamResult) {
    const result = {
      name: steamResult.name,
      imageUrl: steamResult.imageUrl,
      source: 'steam',
    }
    sgdbCache.set(gameName, result)
    return result
  }

  return null
}

// Clear cache
function clearSGDBCache() {
  sgdbCache.clear()
}

// Get cache size
function getSGDBCacheSize() {
  return sgdbCache.size
}

module.exports = {
  getGameImageSquare,
  searchSGDBGame,
  getSGDBSquareImage,
  clearSGDBCache,
  getSGDBCacheSize,
  STEAMGRIDDB_API_KEY,
}
