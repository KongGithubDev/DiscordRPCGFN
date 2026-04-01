const https = require('https')
const fs = require('fs')
const path = require('path')

const GAMES_LIST_URL = 'https://gist.githubusercontent.com/1271/cf4b6a3b562532988fa5b0688102b2cc/raw/ecce646732aba3703c2a3a926c05875061a4ebb4/gameslist.json'
const CACHE_FILE = path.join(__dirname, '..', '..', 'gameslist-cache.json')
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

let gamesCache = null
let gamesLookupMap = null // Fast O(1) lookup
let lastFetch = 0

// Download games list from URL
async function downloadGamesList() {
  return new Promise((resolve, reject) => {
    https.get(GAMES_LIST_URL, (res) => {
      if (res.statusCode !== 200) {
        resolve(null)
        return
      }

      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const games = JSON.parse(data)
          // Save to cache file
          fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), games }))
          gamesCache = games
          lastFetch = Date.now()
          resolve(games)
        } catch (e) {
          resolve(null)
        }
      })
    }).on('error', () => resolve(null))
  })
}

// Load games list (from cache or download)
async function loadGamesList() {
  // Return cached in memory if available
  if (gamesCache) return gamesCache

  // Try to load from cache file
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
      const age = Date.now() - cache.timestamp
      
      if (age < CACHE_DURATION) {
        gamesCache = cache.games
        buildGamesLookupMap(gamesCache)
        lastFetch = cache.timestamp
        return gamesCache
      }
    }
  } catch (e) {
    // Continue to download
  }

  // Download fresh copy
  const games = await downloadGamesList()
  if (games) {
    buildGamesLookupMap(games)
  }
  return games
}

// Build optimized lookup Map for O(1) search
function buildGamesLookupMap(games) {
  gamesLookupMap = new Map()
  
  for (const game of games) {
    // Store by normalized name
    const normalized = normalizeGameName(game.name)
    gamesLookupMap.set(normalized, game)
    
    // Also store by individual words for partial matching
    const words = normalized.split(/(\d+)/).filter(w => w.length > 2)
    for (const word of words) {
      if (!gamesLookupMap.has(word)) {
        gamesLookupMap.set(word, game)
      }
    }
  }
}
function normalizeGameName(name) {
  // Convert Roman numerals to numbers first
  const romanToNum = {
    ' i ': ' 1 ',
    ' ii ': ' 2 ',
    ' iii ': ' 3 ',
    ' iv ': ' 4 ',
    ' v ': ' 5 ',
    ' vi ': ' 6 ',
    ' vii ': ' 7 ',
    ' viii ': ' 8 ',
    ' ix ': ' 9 ',
    ' x ': ' 10 ',
    ' xi ': ' 11 ',
    ' xii ': ' 12 ',
    ' xiii ': ' 13 ',
    ' xiv ': ' 14 ',
    ' xv ': ' 15 ',
  }
  
  let normalized = ' ' + name.toLowerCase() + ' '
  
  // Replace Roman numerals
  for (const [roman, num] of Object.entries(romanToNum)) {
    normalized = normalized.replace(new RegExp(roman, 'g'), num)
  }
  
  return normalized
    .replace(/[®™©]/g, '') // Remove trademark symbols
    .replace(/[^a-z0-9]/g, '') // Remove special chars
    .trim()
}

// Find Discord App ID by game name - O(1) lookup with Map
async function findAppIdByGameName(gameName) {
  await loadGamesList()
  if (!gamesLookupMap) return null

  const normalizedSearch = normalizeGameName(gameName)
  
  // O(1) exact match
  let match = gamesLookupMap.get(normalizedSearch)
  
  // O(1) partial word match
  if (!match) {
    const words = normalizedSearch.split(/(\d+)/).filter(w => w.length > 2)
    for (const word of words) {
      match = gamesLookupMap.get(word)
      if (match) break
    }
  }

  if (match) {
    return {
      appId: match.id,
      name: match.name,
      icon: match.icon,
      coverImage: match.cover_image,
      description: match.description,
    }
  }

  return null
}

// Clear cache
function clearAppIdCache() {
  gamesCache = null
  gamesLookupMap = null
  lastFetch = 0
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE)
    }
  } catch (e) {
    // Ignore
  }
}

module.exports = {
  loadGamesList,
  findAppIdByGameName,
  clearAppIdCache,
  normalizeGameName,
}
