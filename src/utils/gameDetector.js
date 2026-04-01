const { windowManager } = require('node-window-manager')
const { getGameImageSquare } = require('./steamGridDB')

// GeForce NOW window title patterns
const GEFORCE_NOW_WINDOW_TITLES = [
  'GeForce NOW',
  'GeForce NOW Cloud Gaming',
  'NVIDIA GeForce NOW',
]

// Extract game name from GeForce NOW window title
// Common patterns:
// - "GeForce NOW - Game Name"
// - "Game Name - GeForce NOW"
// - "GeForce NOW | Game Name"
// - "Game Name on GeForce NOW" (the actual pattern GeForce NOW uses)
function extractGameName(windowTitle) {
  if (!windowTitle || windowTitle.length === 0) return null

  // Check if this is a GeForce NOW window
  const isGeForceNowWindow = GEFORCE_NOW_WINDOW_TITLES.some(
    (title) => windowTitle.includes(title)
  )

  if (!isGeForceNowWindow) {
    // Check if window title contains any common game indicator without GeForce NOW branding
    // This handles cases where GeForce NOW might stream a game in full screen
    return null
  }

  // Pattern: "Game Name on GeForce NOW" - most common pattern
  // Example: "Watch_Dogs® 2 on GeForce NOW"
  const onPattern = /(.+?)\s+on\s+GeForce NOW/i
  const onMatch = windowTitle.match(onPattern)
  if (onMatch && onMatch[1] && onMatch[1].trim().length > 0) {
    return onMatch[1].trim()
  }

  // Try to extract game name from various separator patterns
  const separators = [' - ', ' | ', ' // ']

  for (const separator of separators) {
    const parts = windowTitle.split(separator)
    if (parts.length >= 2) {
      // Find the part that is NOT the GeForce NOW branding
      const gamePart = parts.find(
        (part) =>
          !GEFORCE_NOW_WINDOW_TITLES.some((title) => part.includes(title))
      )
      if (gamePart && gamePart.trim().length > 0) {
        return gamePart.trim()
      }
    }
  }

  // If we couldn't extract a specific game name, return null
  // (don't show "GeForce NOW" as the game name)
  return null
}

// Find GeForce NOW window and extract game name + image
async function detectGame() {
  try {
    const windows = windowManager.getWindows()

    for (const window of windows) {
      const title = window.getTitle()
      const gameName = extractGameName(title)

      if (gameName) {
        // Fetch game image (SteamGridDB square format, fallback to Steam)
        const gameImage = await getGameImageSquare(gameName)

        return {
          gameName,
          windowTitle: title,
          imageUrl: gameImage?.imageUrl || null,
          imageSource: gameImage?.source || null,
        }
      }
    }

    return null
  } catch (error) {
    return null
  }
}

// Get current active window info
function getActiveWindow() {
  try {
    const activeWindow = windowManager.getActiveWindow()
    if (activeWindow) {
      return {
        title: activeWindow.getTitle(),
        id: activeWindow.id,
      }
    }
    return null
  } catch (error) {
    return null
  }
}

module.exports = {
  detectGame,
  getActiveWindow,
  extractGameName,
}
