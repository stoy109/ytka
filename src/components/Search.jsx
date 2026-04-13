import React, { useState, useEffect, useRef } from 'react'
import usePlayerStore from '../store/usePlayerStore'
import { Search as SearchIcon, Plus, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { RECOMMENDATIONS } from '../lib/constants'
import { getRecommendations, scoreAndRankItems } from '../lib/recommendationEngine'

// Constants moved outside to prevent re-creation
const PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://api.piped.video'
]

const formatDuration = (seconds) => {
    if (!seconds) return '00:00'
    const min = Math.floor(seconds / 60)
    const sec = Math.floor(seconds % 60)
    return `${min}:${sec < 10 ? '0' + sec : sec}`
}

const Search = ({ className, isGrid = false }) => {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(false)
    const [suggestions, setSuggestions] = useState([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [error, setError] = useState(null)
    const [historyRecs, setHistoryRecs] = useState([])
    const searchRef = useRef(null)

    // Pagination State
    // visibleCount: controls how many items we render from our 'results' array (client-side pagination)
    const [visibleCount, setVisibleCount] = useState(20)
    // nextPageToken: Piped API token for fetching next page (server-side pagination)
    const [nextPageToken, setNextPageToken] = useState(null)
    const [isFetchingMore, setIsFetchingMore] = useState(false)

    const addToQueue = usePlayerStore((state) => state.addToQueue)
    const playVideo = usePlayerStore((state) => state.playVideo)
    const playedHistory = usePlayerStore((state) => state.playedHistory)
    const relatedVideos = usePlayerStore((state) => state.relatedVideos)

    // Reset pagination on new query, show loading IMMEDIATELY
    useEffect(() => {
        setVisibleCount(20)
        setNextPageToken(null)
        setResults([])
        if (query.trim()) {
            setLoading(true)
        }
    }, [query])

    // Close suggestions on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Fetch Suggestions
    useEffect(() => {
        if (!query.trim()) {
            setSuggestions([])
            return
        }

        const fetchSuggestions = async () => {
            for (const instance of PIPED_INSTANCES) {
                try {
                    const res = await fetch(`${instance}/opensearch/suggestions?query=${encodeURIComponent(query)}`)
                    if (res.ok) {
                        const data = await res.json()
                        // Piped returns [query, [suggestions...]]
                        if (Array.isArray(data) && data[1]) {
                            setSuggestions(data[1].slice(0, 8)) // Limit to 8
                            return
                        }
                    }
                } catch (e) { }
            }
        }

        const timeoutId = setTimeout(fetchSuggestions, 200) // Fast debounce
        return () => clearTimeout(timeoutId)
    }, [query])

    // Fetch Recs (Engine Logic)
    // append: boolean - if true, we fetch MORE and add to list. if false, we replace list.
    const fetchAdvancedRecs = async (append = false) => {
        // If history empty, don't do personalized recs yet (unless we have a fallback strategy in engine)
        if (playedHistory.length === 0 && !append) return

        if (!query) setLoading(true) // Only main loader if not searching
        if (append) setIsFetchingMore(true)

        try {
            const { playedHistory: history, affinityMap } = usePlayerStore.getState()

            // Collect IDs of currently shown items to deduplicate
            const currentIds = new Set(append ? historyRecs.map(v => v.url) : [])
            // Also ignore played items if that's desired (engine likely does it, but we can pass it explicitly)
            const playedIds = new Set(history.map(v => (v.video ? v.video.url : v.url)))

            // Combined blacklist for engine
            const ignoreSet = new Set([...currentIds, ...playedIds])

            // Use the NEW ENGINE
            const newItems = await getRecommendations(history, affinityMap || {}, ignoreSet)

            if (newItems.length > 0) {
                if (append) {
                    setHistoryRecs(prev => [...prev, ...newItems])
                    setVisibleCount(prev => prev + 10)
                } else {
                    setHistoryRecs(newItems)
                }
            } else {
                console.log("Engine returned 0 items even after retries.")
            }

        } catch (e) {
            console.error("Recommendation Engine failed:", e)
        }

        setLoading(false)
        setIsFetchingMore(false)
    }

    // Initial Rec Fetch
    useEffect(() => {
        if (!query && playedHistory.length > 0 && historyRecs.length === 0) {
            fetchAdvancedRecs(false)
        }
    }, [playedHistory, query])


    // --- SEARCH LOGIC ---
    useEffect(() => {
        const search = async () => {
            console.log("Starting search for:", query)
            if (!query.trim()) {
                setLoading(false)
                return
            }

            setError(null)
            let success = false

            for (const instance of PIPED_INSTANCES) {
                try {
                    console.log(`Trying ${instance}...`)
                    const response = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`)
                    if (!response.ok) {
                        console.warn(`Response not OK from ${instance}: ${response.status}`)
                        continue
                    }

                    const data = await response.json()
                    console.log("Raw items from API:", data.items?.length)

                    // RANKING APPLIED:
                    const rawItems = data.items.slice(0, 50)
                    const { affinityMap } = usePlayerStore.getState()

                    console.log("Ranking items with affinity map:", affinityMap)
                    // scoreAndRankItems returns fully formatted items, so we use them directly.
                    const rankedItems = scoreAndRankItems(rawItems, affinityMap || {}, new Set(), query)
                    console.log("Ranked items:", rankedItems.length)

                    setResults(rankedItems)
                    setNextPageToken(data.nextpage || null) // Capture Token
                    success = true
                    break
                } catch (err) {
                    console.warn(`Failed to search on ${instance}`, err)
                }
            }

            if (!success) setError('All search servers failed. Please try again.')
            setLoading(false)
        }

        const timeoutId = setTimeout(search, 800)
        return () => clearTimeout(timeoutId)
    }, [query])


    // --- FETCH MORE ---
    const fetchMoreSearchResults = async () => {
        if (!nextPageToken || isFetchingMore) return
        setIsFetchingMore(true)

        let success = false
        for (const instance of PIPED_INSTANCES) {
            try {
                // Pass nextpage token
                // NOTE: Piped API nextpage token is often enough, but sometimes providing 'q' helps routing
                const response = await fetch(`${instance}/nextpage?nextpage=${encodeURIComponent(nextPageToken)}&q=${encodeURIComponent(query)}&filter=videos`)
                if (!response.ok) continue
                const data = await response.json()
                // Need basic parser for filtered items if strict
                // Assuming data.items structure similar for now or just filtering raw
                // Piped nextpage often returns partial items, simplistic handling:
                const newItems = data.items.filter(i => i.type === 'stream').map(item => ({
                    url: `https://www.youtube.com/watch?v=${item.url.split('v=')[1]}`,
                    title: item.title,
                    thumbnail: item.thumbnail,
                    duration: formatDuration(item.duration),
                    channel: item.uploaderName
                }))

                if (newItems.length > 0) {
                    setResults(prev => [...prev, ...newItems])
                    setNextPageToken(data.nextpage || null) // Update token for NEXT fetch
                    setVisibleCount(prev => prev + 20)
                    success = true
                    break
                } else if (data.nextpage) {
                    // Start of handling empty pages (filter bubbles)
                    // If no items but token exists, just update token so next click tries next page
                    setNextPageToken(data.nextpage)
                    // If we want to be fancy, we could recurse here, but let's let user click again for now (UI will be active)
                }
            } catch (e) {
                console.warn("Failed to fetch next page", e)
            }
        }
        setIsFetchingMore(false)
    }

    const handleShowMore = () => {
        // Mode 1: Search - Local items pending?
        if (query && results.length > visibleCount) {
            setVisibleCount(prev => prev + 20)
            return
        }

        // Mode 2: Related Videos (Native) - Local items pending?
        if (!query && relatedVideos.length > 0) {
            // If we are nearing the end, maybe we could trigger a scroll in Player?
            // For now, just show what we have.
            if (relatedVideos.length > visibleCount) {
                setVisibleCount(prev => prev + 20)
            }
            return
        }
    }

    const handleManualAdd = () => {
        if (!query) return;
        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            const videoId = query.split('v=')[1]?.split('&')[0] || query.split('/').pop()
            const video = {
                url: query,
                title: `Video ${videoId}`,
                thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                duration: '00:00',
                channel: 'Direct URL'
            }
            addToQueue(video)
            setQuery('')
        }
    }

    // Helper to parse Piped items
    const parsePipedItem = (item, reason = null) => {
        let videoId = ''
        if (item.url) {
            const match = item.url.match(/\/watch\?v=([^&]+)/)
            if (match) videoId = match[1]
        }
        if (!videoId) return null
        return {
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: item.title,
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            duration: item.duration ? formatDuration(item.duration) : '00:00',
            channel: item.uploaderName,
            reason: reason
        }
    }

    // SCROLL HANDLER
    const observerTarget = useRef(null)
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    if (query && nextPageToken) fetchMoreSearchResults()
                    if (!query && historyRecs.length > 0) fetchAdvancedRecs(true)
                }
            },
            { threshold: 1.0 }
        )

        if (observerTarget.current) observer.observe(observerTarget.current)
        return () => observer.disconnect()
    }, [nextPageToken, query, historyRecs])

    // --- RENDER LOGIC ---
    let displayItems = []
    let sectionTitle = 'Recommended For You'
    let hasMore = false

    if (query) {
        displayItems = results.slice(0, visibleCount)
        sectionTitle = 'Search Results'
        // Show More if: Hidden Local Items OR Remote Token
        hasMore = (results.length > visibleCount) || !!nextPageToken
    } else if (relatedVideos.length > 0) {
        displayItems = relatedVideos.slice(0, visibleCount)
        sectionTitle = 'Up Next (From YouTube)'
        // Show More if we have more compiled videos than shown
        hasMore = relatedVideos.length > visibleCount
    } else {
        // Fallback or empty state
        displayItems = RECOMMENDATIONS.slice(0, visibleCount)
        hasMore = RECOMMENDATIONS.length > visibleCount
    }


    return (
        <div className={cn("flex flex-col gap-4 min-h-0", isGrid ? "h-auto" : "h-full", className)}>
            <div className="relative flex-shrink-0" ref={searchRef}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        setShowSuggestions(true)
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            setShowSuggestions(false)
                            e.target.blur()
                        }
                    }}
                    placeholder="Search songs or paste URL..."
                    className="w-full bg-surface border border-primary/30 text-text rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-primary focus:shadow-[0_0_10px_rgba(0,255,245,0.2)] transition-all"
                />

                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 flex items-center justify-center pointer-events-none">
                    {loading && !isFetchingMore ? (
                        <Loader2 className="w-full h-full text-primary animate-spin" />
                    ) : (
                        <SearchIcon className="w-full h-full text-primary" />
                    )}
                </div>

                {/* SUGGESTIONS DROPDOWN */}
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-primary/20 rounded-lg shadow-xl z-50 overflow-hidden">
                        {suggestions.map((suggestion, idx) => (
                            <div
                                key={idx}
                                className="px-4 py-2 hover:bg-white/10 cursor-pointer text-sm text-text transition-colors flex items-center gap-2"
                                onClick={() => {
                                    setQuery(suggestion)
                                    setShowSuggestions(false)
                                }}
                            >
                                <SearchIcon className="w-3 h-3 text-text-dim" />
                                {suggestion}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {error && <p className="text-error text-sm px-2">{error}</p>}

            {/* Results Container */}
            <div className={cn(
                "rounded-lg border border-white/5 bg-surface/30",
                isGrid ? "p-4 overflow-visible" : "flex-1 overflow-y-auto p-2 min-h-0 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent"
            )}>
                {!isGrid && (
                    <h3 className="text-sm font-bold text-text-dim uppercase tracking-wider mb-2 px-2 pb-2 border-b border-white/5 sticky top-0 bg-surface/95 backdrop-blur z-10 block">
                        {sectionTitle}
                    </h3>
                )}
                {isGrid && query && (
                    <h3 className="text-xl font-bold text-white mb-4">{sectionTitle}</h3>
                )}

                <div className={cn(
                    "gap-4",
                    isGrid ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "flex flex-col gap-2"
                )}>
                    {displayItems.length === 0 && !loading && <p className="col-span-full text-center text-text-dim py-4">No recommendations yet.</p>}

                    {displayItems.map((video, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "group cursor-pointer transition-all hover:bg-white/5 rounded-lg overflow-hidden",
                                isGrid ? "flex flex-col bg-white/5 p-3 hover:bg-white/10" : "flex items-center gap-3 p-2"
                            )}
                            onClick={() => playVideo(video)}
                        >
                            {/* Thumbnail */}
                            <div className={cn(
                                "relative bg-black rounded overflow-hidden flex-shrink-0 group-hover:shadow-[0_0_15px_rgba(0,255,245,0.3)] transition-all",
                                isGrid ? "aspect-video w-full mb-3" : "w-24 h-14"
                            )}>
                                <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                                <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] px-1 rounded text-white">{video.duration}</span>

                                {/* Overlay Play Button (Grid only) */}
                                {isGrid && (
                                    <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); playVideo(video); }}
                                            className="p-3 bg-primary rounded-full text-black hover:scale-110 transition-transform shadow-lg shadow-primary/25"
                                            title="Play Now"
                                        >
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        </button>

                                        <button
                                            onClick={(e) => { e.stopPropagation(); addToQueue(video); }}
                                            className="p-3 bg-surface border border-primary text-primary rounded-full hover:bg-primary hover:text-black hover:scale-110 transition-all shadow-lg"
                                            title="Add to Queue"
                                        >
                                            <Plus size={24} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className={cn("font-medium text-text group-hover:text-primary transition-colors truncate", isGrid ? "text-base" : "text-sm")}>{video.title}</p>
                                <div className="flex items-center gap-2 text-xs text-text-dim truncate mt-1">
                                    <span>{video.channel}</span>
                                </div>
                            </div>

                            {/* Actions (List Mode) */}
                            {!isGrid && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); addToQueue(video); }}
                                        className="p-2 bg-surface border border-primary/50 text-primary hover:bg-primary hover:text-black rounded transition-all"
                                        title="Add to Queue"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Show More Button */}
                    {hasMore && (
                        <div className="col-span-full flex justify-center py-4">
                            <button
                                onClick={handleShowMore}
                                disabled={isFetchingMore}
                                className="flex items-center gap-2 px-6 py-2 bg-surface border border-primary/30 text-primary rounded-full hover:bg-primary hover:text-black transition-all text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isFetchingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isFetchingMore ? 'Loading...' : 'Show More'}
                            </button>
                        </div>
                    )}


                    {/* Fallback */}
                    {query && results.length === 0 && !loading && !error && (
                        <div className="col-span-full text-center py-8 text-text-dim">
                            <p>No results found.</p>
                            <button onClick={handleManualAdd} className="mt-2 text-primary hover:underline text-sm">
                                Try adding as direct URL?
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Search
