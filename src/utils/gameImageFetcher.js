const https = require('https')

// Cache for game images to avoid repeated API calls
const imageCache = new Map()

// Search Steam store for game and get App ID
function searchSteamGame(gameName) {
  return new Promise((resolve, reject) => {
    const encodedName = encodeURIComponent(gameName)
    const url = `https://store.steampowered.com/api/storesearch/?term=${encodedName}&l=english&cc=US`

    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.items && json.items.length > 0) {
            // Return the first (best match) result
            const game = json.items[0]
            resolve({
              appId: game.id,
              name: game.name,
              // Use header image (16:9) for better Discord display
              // library_600x900 is 2:3 portrait which gets cropped
              imageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/header.jpg`,
              // Alternative: library hero (may not exist for all games)
              heroUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/library_hero.jpg`,
            })
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

// Get game image with caching
async function getGameImage(gameName) {
  if (!gameName) return null

  // Check cache first
  if (imageCache.has(gameName)) {
    return imageCache.get(gameName)
  }

  // Search Steam
  const result = await searchSteamGame(gameName)

  if (result) {
    // Cache the result
    imageCache.set(gameName, result)
    return result
  }

  return null
}

// Clear cache (optional, for memory management)
function clearImageCache() {
  imageCache.clear()
}

// Get cache size
function getCacheSize() {
  return imageCache.size
}

module.exports = {
  getGameImage,
  searchSteamGame,
  clearImageCache,
  getCacheSize,
}
