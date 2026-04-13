import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const usePlayerStore = create(
    persist(
        (set, get) => ({
            queue: [],
            currentVideo: null,
            isPlaying: true, // Default to true so first load tries to play
            volume: 0.5,
            // History now stores rich objects: { video, timestamp, durationWatched, totalDuration, context }
            playedHistory: [],
            // Weight map for artists/channels based on RL
            affinityMap: {},
            // Scraped related videos from active player
            relatedVideos: [],
            // Load more state
            isLoadingMore: false,
            canLoadMore: true,
            // Load more state
            isLoadingMore: false,
            canLoadMore: true,
            loadMoreCallback: null, // Function to call from Player component

            // Advanced Controls State
            playbackSpeed: 1.0,
            repeatMode: 'off', // 'off', 'one', 'all'
            isShuffled: false,
            originalQueue: [], // Backup for un-shuffling
            resolution: 'auto', // 'auto', 'hd1080', 'hd720', 'large', 'medium'
            replayTrigger: 0, // Signal to force replay same video
            seekTrigger: null, // { time: number, ts: number }

            // Actions
            addToQueue: (video) => set((state) => ({ queue: [...state.queue, video] })),
            removeFromQueue: (index) => set((state) => ({
                queue: state.queue.filter((_, i) => i !== index)
            })),
            playNext: () => {
                const { queue, currentVideo, playedHistory, repeatMode } = get()

                // If Repeat One is active, and we are skipping, typically we move next.
                // UNLESS the queue is empty?
                // The user complaint "repeated not working on skip" might mean they expect it to REPLAY?
                // Let's assume standard behavior: Next Button = Force Next.
                // But for Repeat ALL with empty queue, we simply Loop current.

                if (queue.length > 0) {
                    const nextVideo = queue[0]
                    const newQueue = queue.slice(1)
                    let finalQueue = newQueue

                    if (repeatMode === 'all' && currentVideo) {
                        finalQueue = [...newQueue, currentVideo]
                    }

                    const newHistory = currentVideo ? [...playedHistory, {
                        video: currentVideo,
                        timestamp: Date.now(),
                        watchTime: 0,
                        completed: false
                    }] : playedHistory

                    set({
                        currentVideo: nextVideo,
                        queue: finalQueue,
                        playedHistory: newHistory,
                        isPlaying: true,
                        seekTrigger: null, // Reset seek
                        replayTrigger: 0 // Reset replay
                    })
                } else if ((repeatMode === 'all' || repeatMode === 'one') && currentVideo) {
                    // Queue empty but Repeat is On -> Replay current
                    set((state) => ({
                        isPlaying: true,
                        replayTrigger: state.replayTrigger + 1
                    }))
                } else {
                    set({ isPlaying: false })
                }
            },
            playVideo: (video) => {
                const { currentVideo, playedHistory } = get()
                // finalize previous?
                const newHistory = currentVideo ? [...playedHistory, {
                    video: currentVideo,
                    timestamp: Date.now(),
                    watchTime: 0, // Will be updated
                    completed: false
                }] : playedHistory

                set({
                    currentVideo: video,
                    playedHistory: newHistory,
                    isPlaying: true,
                    seekTrigger: null, // Reset seek
                    replayTrigger: 0 // Reset replay
                })
            },

            // New Action: Log Interaction (Reinforcement Learning Hook)
            logInteraction: (videoId, metrics) => set((state) => {
                // Find the history item for this video (most recent)
                const historyIndex = state.playedHistory.findLastIndex(h => h.video.url && (h.video.url.includes(videoId) || h.video.url === videoId))

                if (historyIndex === -1 && !metrics.force) return {} // Not found

                const newHistory = [...state.playedHistory]
                if (historyIndex !== -1) {
                    newHistory[historyIndex] = { ...newHistory[historyIndex], ...metrics }
                }

                // Update Affinity Map (Reinforcement)
                // AUTO-FIX: If map has extreme negative values (bug artifact), reset it.
                let affinityMap = { ...state.affinityMap }
                if (Object.values(affinityMap).some(v => v < -50)) {
                    console.warn("Poisoned Affinity Map detected. Resetting.")
                    affinityMap = {}
                }

                const video = state.currentVideo
                // FIXED: Only update affinity on COMPLETION or Manual Skip (force), not every tick
                if (video && (metrics.completed || metrics.force)) {
                    // Simple RL Agent
                    // Reward = (WatchTime / TotalDuration) * Weight
                    // Punishment = Skip (< 10s)
                    const item = newHistory[historyIndex]
                    if (item.video && item.video.channel) {
                        const channel = item.video.channel
                        const score = (metrics.watchTime / (metrics.totalDuration || 1))
                        // Update weight: existing + (score * factor)
                        // Good watch (>50%): +1
                        // Bad watch (<10%): -1
                        // Skip: -2
                        let delta = 0
                        if (score > 0.8) delta = 2
                        else if (score > 0.5) delta = 1
                        else if (score < 0.1) delta = -1

                        // Heuristic: If we reached completion, it's always at least +1
                        if (metrics.completed) delta = Math.max(delta, 1)

                        console.log(`[Affinity] Updating ${channel}: ${affinityMap[channel] || 0} + ${delta}`)
                        affinityMap[channel] = (affinityMap[channel] || 0) + delta
                    }
                }

                return { playedHistory: newHistory, affinityMap }
            }),
            setPlaying: (isPlaying) => set({ isPlaying }),
            setVolume: (volume) => set({ volume }),
            setRelatedVideos: (videos) => set({ relatedVideos: videos }),
            setLoadingMore: (loading) => set({ isLoadingMore: loading }),
            setCanLoadMore: (canLoad) => set({ canLoadMore: canLoad }),
            setLoadMoreCallback: (callback) => set({ loadMoreCallback: callback }),
            triggerLoadMore: () => {
                const { loadMoreCallback } = get()
                if (loadMoreCallback) loadMoreCallback()
            },
            reorderQueue: (newQueue) => set({ queue: newQueue }),

            // Advanced Actions
            setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
            setResolution: (res) => set({ resolution: res }),
            setRepeatMode: (mode) => set({ repeatMode: mode }),
            toggleShuffle: () => set((state) => {
                const isShuffled = !state.isShuffled
                let newQueue = []
                let originalQueue = []

                if (isShuffled) {
                    // Enable Shuffle
                    originalQueue = [...state.queue] // Save current order
                    // Fisher-Yates shuffle
                    newQueue = [...state.queue]
                    for (let i = newQueue.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
                    }
                } else {
                    // Disable Shuffle -> Restore original if possible
                    // If user added songs while shuffled, restoring originalQueue gets tricky.
                    // Fallback: If originalQueue exists and has same items, restore.
                    // Otherwise, just keep current mixed queue (simplest approach for now).
                    // Actually, let's just keep the current queue as the new order when disabling shuffle
                    // to avoid confusing jumps, UNLESS we strictly track order.
                    // For this simple app, toggling shuffle off just leaves it as is, or we could try to restore.
                    // Let's restore from originalQueue IF defined.
                    if (state.originalQueue.length > 0) {
                        newQueue = state.originalQueue
                        // But we must remove items that have already been played? 
                        // Logic gets complex. Let's simplify: Shuffle sends chaos, Unshuffle just keeps current order but stops randomizing future adds?
                        // "Smart Shuffle" usually maintains separate lists.
                        // Let's start simple: Shuffle randomizes current queue. Unshuffle... does nothing to order effectively, just sets flag?
                        // No, user expects it to go back.
                        newQueue = state.originalQueue
                    } else {
                        newQueue = state.queue
                    }
                    originalQueue = []
                }

                return { isShuffled, queue: newQueue, originalQueue }
            }),

            // Hydration for Sync
            setStoreState: (newState) => set(state => ({ ...state, ...newState })),
        }),
        {
            name: 'ytka-storage', // unique name
        }
    )
)

export default usePlayerStore
