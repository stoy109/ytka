
// Constants
const PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://api.piped.video'
]

// Helper: Select random item from array
const random = (arr) => arr[Math.floor(Math.random() * arr.length)]

/**
 * The Core Recommendation Engine
 * Implements "The Rabbit Hole" logic properly.
 */
export const getRecommendations = async (playedHistory, affinityMap, existingIds = new Set()) => {
    if (!playedHistory || playedHistory.length === 0) return []

    // 1. ANALYZE PROFILE
    // Get top channels from affinity map (Reinforcement Learning Output)
    const sortedChannels = Object.entries(affinityMap)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA) // Descending

    const topChannels = sortedChannels.slice(0, 3).map(([ch]) => ch)
    // hatedChannels are implicitly handled by scoreAndRankItems via negative weights

    const lastPlayed = playedHistory[playedHistory.length - 1]
    const lastVideo = lastPlayed.video || lastPlayed // Handle legacy/new format

    // 2. GENERATE QUERIES (Exploration vs Exploitation)
    const queries = []

    // A. IMMEDIATE RABBIT HOLE (Recency Bias - High Weight)
    if (lastVideo && lastVideo.title) {
        const cleanTitle = lastVideo.title.replace('(Karaoke)', '').replace('Karaoke', '').trim()
        queries.push({
            q: `Karaoke similar to ${cleanTitle}`,
            type: 'Rabbit Hole',
            weight: 1.5
        })

        // If high completion (Good Boy Reward), dig deeper into this specific artist
        if (lastPlayed.completed || (lastPlayed.watchTime / lastPlayed.totalDuration > 0.8)) {
            const artist = cleanTitle.split('-')[0].trim()
            queries.push({
                q: `Karaoke ${artist} best songs`,
                type: `Because you liked ${artist}`,
                weight: 2.0 // Strong exploitation
            })
        }
    }

    // B. PROFILE EXPLOITATION (Affinity Map)
    topChannels.forEach(channel => {
        queries.push({
            q: `Karaoke ${channel} similar`,
            type: `For you (Fan of ${channel})`,
            weight: 1.2
        })
    })

    // C. EXPLORATION (Wildcards)
    // Pick a random OLD video from history to verify nostalgia
    if (playedHistory.length > 5) {
        const randomOld = random(playedHistory.slice(0, playedHistory.length - 5))
        const oldVid = randomOld.video || randomOld
        if (oldVid && oldVid.title) {
            const clean = oldVid.title.replace('(Karaoke)', '').replace('Karaoke', '').trim()
            queries.push({
                q: `Karaoke like ${clean}`,
                type: 'Rediscover',
                weight: 0.8
            })
        }
    }

    // Add a pure randomizer (Trending/Genre based)
    const genres = ['Rock', 'Pop', 'Indie', 'Jazz', 'Metal', '80s', '90s', 'Acoustic']
    queries.push({
        q: `Karaoke ${random(genres)} Hits`,
        type: 'Try something new',
        weight: 0.5
    })


    // 3. FETCH 
    // Execute fetches provided we have quota/time
    const fetchPromises = queries.map(async (qObj) => {
        for (const instance of PIPED_INSTANCES) {
            try {
                const res = await fetch(`${instance}/search?q=${encodeURIComponent(qObj.q)}&filter=videos`)
                if (!res.ok) continue
                const data = await res.json()

                return data.items.slice(0, 10).map(item => ({
                    ...item,
                    sourceValues: qObj
                }))
            } catch { return [] }
        }
        return []
    })

    const rawBatches = await Promise.all(fetchPromises)
    const allItems = rawBatches.flat().filter(Boolean)

    // 4. RANKING (Delegated)
    return scoreAndRankItems(allItems, affinityMap, existingIds)
}

/**
 * Re-ranks a list of items based on Affinity Map (Personalization)
 * Used for both "For You" and "Search Results"
 */
export const scoreAndRankItems = (items, affinityMap, existingIds = new Set(), query = '') => {
    // Assign score to each item
    const scoredItems = items.map(item => {
        // Default weight: 1.0 (or from source)
        let score = (item.sourceValues && item.sourceValues.weight) ? item.sourceValues.weight : 1.0

        const lowerTitle = item.title.toLowerCase()
        const lowerChannel = item.uploaderName ? item.uploaderName.toLowerCase() : ''

        // 1. AFFINITY BOOST (Reinforcement Learning)
        // Previous: 0.1 * score. New: 1.0 * score (100% impact, effectively doubling score for favs)
        if (item.uploaderName && affinityMap[item.uploaderName]) {
            const affinity = affinityMap[item.uploaderName]
            if (affinity > 0) {
                score += (affinity * 0.5) // reduced from theoretical 1.0 to avoid overwhelming totally, but 5x stronger than before
            } else {
                score -= 5 // Penalty remains high
            }
        }

        // 2. QUERY / ARTIST MATCHING (Heuristic)
        // If the user's SEARCH QUERY (implicit in what we are recommending if "For You" context implies query-less, 
        // but if we are ranking explicit search results, we want to boost the literal match)

        // Check if title starts with the Channel Name (Strong signal for "Official Music Video")
        if (item.uploaderName && lowerTitle.includes(lowerChannel)) {
            score += 0.5
        }

        // Boost "Karaoke" or "Instrumental" if that's the vibe (General)
        if (lowerTitle.includes('karaoke') || lowerTitle.includes('instrumental') || lowerTitle.includes('off vocal')) {
            score += 0.3
        }

        // 3. EXPLICIT QUERY AFFINITY
        // If the user searches "Eve", and the channel is "EVE", boost it MASSIVELY.
        if (query && item.uploaderName) {
            const cleanQuery = query.toLowerCase().trim()
            if (lowerChannel.includes(cleanQuery) || lowerChannel === cleanQuery) {
                score += 3.0 // Massive boost for channel match
            }
        }

        return {
            item,
            score,
            reason: (item.sourceValues && item.sourceValues.type) ? item.sourceValues.type : null
        }
    })

    // Sort by score
    scoredItems.sort((a, b) => b.score - a.score)

    // Format & Deduplicate
    const finalItems = []
    const seen = new Set(existingIds) // clone

    for (const entry of scoredItems) {
        let videoId = ''
        if (entry.item.url) {
            const match = entry.item.url.match(/\/watch\?v=([^&]+)/)
            if (match) videoId = match[1]
        }

        const fullUrl = `https://www.youtube.com/watch?v=${videoId}`

        if (videoId && !seen.has(fullUrl)) {
            finalItems.push({
                url: fullUrl,
                title: entry.item.title,
                thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                duration: entry.item.duration ? formatDuration(entry.item.duration) : '00:00',
                channel: entry.item.uploaderName,
                reason: entry.reason
            })
            seen.add(fullUrl)
        }
    }

    return finalItems.slice(0, 50) // Return top ranked items (capped)
}

// Utils
const formatDuration = (seconds) => {
    if (!seconds) return '00:00'
    const min = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return `${min}:${sec < 10 ? '0' + sec : sec}`
}
