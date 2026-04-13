import React, { useRef, useEffect, useState } from 'react'
import { Repeat, Repeat1, Shuffle, Gauge, Settings, SkipForward, Play, Pause, Check, ChevronUp } from 'lucide-react'
import usePlayerStore from '../store/usePlayerStore'
import { getRecommendations } from '../lib/recommendationEngine'
import { cn } from '../lib/utils'

const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null }

const Player = ({ className, isProjectorMode = false }) => {
    const { currentVideo, playNext, isPlaying, setPlaying, volume, setRelatedVideos,
        playedHistory, affinityMap,
        playbackSpeed, setPlaybackSpeed, repeatMode, setRepeatMode, isShuffled, toggleShuffle, resolution, setResolution,
        replayTrigger, seekTrigger } = usePlayerStore()
    const [activeMenu, setActiveMenu] = useState(null) // 'speed' | 'resolution' | null
    const webviewRef = useRef(null)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isSeeking, setIsSeeking] = useState(false)
    const [isAd, setIsAd] = useState(false)
    const [showSkipButton, setShowSkipButton] = useState(false)
    const [isWebviewReady, setIsWebviewReady] = useState(false)

    // Extract video ID safely
    const getVideoId = (url) => {
        try {
            if (url.includes('youtu.be')) return url.split('/').pop()
            const urlObj = new URL(url)
            return urlObj.searchParams.get('v')
        } catch {
            return null
        }
    }

    const videoId = currentVideo ? getVideoId(currentVideo.url) : null
    const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''

    // CSS to hide ALL YouTube UI (ONLY for main player webview)
    const cssInjection = `
        /* Hide sidebar and related videos */
        #secondary, #related, ytd-watch-next-secondary-results-renderer,
        ytd-watch-flexy[theater] #secondary, ytd-watch-flexy[fullscreen] #secondary {
            display: none !important;
        }
        
        /* Hide all YouTube chrome/controls/overlays */
        .ytp-chrome-top, .ytp-show-cards-title, .ytp-ce-element,
        .ytp-cards-teaser, .ytp-endscreen-content, .ytp-pause-overlay,
        .ytp-scroll-min, .ytp-suggestion-set, .iv-drawer, .annotation,
        .ytp-chrome-bottom, #masthead-container, ytd-masthead, #masthead {
            display: none !important;
        }
        
        /* Hide info cards and end screens */
        .ytp-cards-button, .ytp-cards-button-icon, .ytp-ce-covering-overlay,
        .ytp-ce-element-shadow, .ytp-ce-covering-image, .ytp-ce-expanding-overlay-background {
            display: none !important;
        }
        
        /* Hide title, channel info, description */
        #above-the-fold, #below, #info, #info-contents, #meta, #meta-contents,
        ytd-video-primary-info-renderer, ytd-video-secondary-info-renderer,
        #title, h1.title, .ytd-video-primary-info-renderer {
            display: none !important;
        }
        
        /* Hide comments */
        #comments, ytd-comments, ytd-item-section-renderer {
            display: none !important;
        }
        
        /* Hide engagement buttons */
        #actions, #menu, ytd-menu-renderer, #top-level-buttons {
            display: none !important;
        }
        
        /* Force player to fill viewport entirely but keep transparent backgrounds */
        #player, #player-container, .html5-video-player, #ytd-player, #container, .html5-video-container {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 9999 !important;
            background: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        
        /* Disable Ambient Mode and other backgrounds */
        #cinematics, #cinematics-renderer,  #background, #background-player {
            display: none !important;
        }

        /* Hide blocking overlays */
        .ytp-cued-thumbnail-overlay, .ytp-spinner, .ytp-bezel, .ytp-gradient-bottom, .ytp-gradient-top {
            display: none !important;
        }

        /* The Video Element - specific targeting */
        video, .html5-main-video {
            object-fit: contain !important;
            width: 100% !important;
            height: 100% !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            z-index: 20 !important; /* High but relative to container */
        }

        /* Ensure body is black and scroll-locked */
        body, html {
            overflow: hidden !important;
            background: black !important;
        }
        
        /* Hide autoplay toggle and endscreen overlays */
        .ytp-autonav-overlay, .ytp-upnext, .ytp-suggestion-set, .html5-endscreen,
        .ytp-autonav-endscreen-button-container, .ytp-autonav-toggle-button-container {
            display: none !important;
        }

        /* Hide watermarks and branding */
        .ytp-watermark, .ytp-youtube-button, .branding-img {
            display: none !important;
        }
`

    // Initialize MAIN webview (CSS injection to hide UI)
    useEffect(() => {
        const webview = webviewRef.current
        if (!webview || !videoUrl) return

        setIsWebviewReady(false) // Reset on new video

        const onDomReady = () => {
            webview.insertCSS(cssInjection)
            webview.executeJavaScript(`
            (function() {
                const vid = document.querySelector('video');
                if (vid) vid.volume = ${Math.max(0, Math.min(1, volume))};

                // Force disable YouTube native autoplay
                const toggle = document.querySelector('.ytp-autonav-toggle-button');
                if (toggle && toggle.getAttribute('aria-checked') === 'true') {
                    toggle.click();
                }
            })()
            `).catch(() => { })
            setIsWebviewReady(true)
            console.log('[Player] Main webview ready')
        }

        webview.addEventListener('dom-ready', onDomReady)
        return () => {
            webview.removeEventListener('dom-ready', onDomReady)
            setIsWebviewReady(false)
        }
    }, [videoUrl, volume])

    useEffect(() => {
        if (!webviewRef.current || !isWebviewReady) return
        if (replayTrigger > 0) {
            // Force replay
            webviewRef.current.executeJavaScript(`
                (function(){
                    const v = document.querySelector('video');
                    if (v) { v.currentTime = 0; v.play(); }
                })()
            `).catch(() => { })
        }
    }, [replayTrigger, isWebviewReady])

    useEffect(() => {
        if (!webviewRef.current || !isWebviewReady || !seekTrigger) return

        webviewRef.current.executeJavaScript(`
            (function() {
                try {
                    const v = document.querySelector('video');
                    if (v) { v.currentTime = ${seekTrigger.time}; }
                } catch(e) {}
            })()
        `).catch(() => { })

    }, [seekTrigger, isWebviewReady])

    // Dynamic Player Config Injection (Speed, Resolution)
    useEffect(() => {
        const webview = webviewRef.current
        if (!webview || !isWebviewReady) return

        webview.executeJavaScript(`
            (function(){
                try {
                    const vid = document.querySelector('video');
                    if (vid) vid.playbackRate = ${playbackSpeed};
                    
                    const player = document.getElementById('movie_player');
                    if (player && player.setPlaybackQualityRange && '${resolution}' !== 'auto') {
                        player.setPlaybackQualityRange('${resolution}');
                    }
                } catch(e) {}
            })()
        `).catch(() => { })
    }, [playbackSpeed, resolution, isWebviewReady])

    // Poll MAIN webview for playback state & ads
    useEffect(() => {
        if (!webviewRef.current || !isWebviewReady) return

        const interval = setInterval(async () => {
            try {
                const state = await webviewRef.current.executeJavaScript(`
    (function () {
        const video = document.querySelector('video');
        const isAd = !!(document.querySelector('.ad-interrupting') ||
            document.querySelector('.ytp-ad-player-overlay') ||
            document.querySelector('.video-ads.ytp-ad-module')?.children?.length > 0);
        return {
            time: video?.currentTime || 0,
            duration: video?.duration || 0,
            isAd: isAd
        };
    })()
    `)

                if (state) {
                    setCurrentTime(state.time)
                    setDuration(state.duration)

                    // Ad detection
                    if (state.isAd !== isAd) {
                        setIsAd(state.isAd)
                        if (state.isAd) {
                            setTimeout(() => setShowSkipButton(true), 1000)
                        } else {
                            setShowSkipButton(false)
                        }
                    }

                    // Auto-next at end
                    if (!state.isAd && state.duration > 0 && state.time >= state.duration - 1) {
                        if (videoId) {
                            usePlayerStore.getState().logInteraction(videoId, {
                                watchTime: state.duration,
                                totalDuration: state.duration,
                                completed: true
                            })
                        }
                        playNext()
                    }
                }
            } catch (e) { }
        }, 500)

        return () => clearInterval(interval)
    }, [isAd, videoId, playNext, isWebviewReady])

    // FETCH RECOMMENDATIONS (API-Based Replacement for Ghost Scraper)
    useEffect(() => {
        if (!currentVideo) return

        const fetchRecommendations = async () => {
            console.log('[Player] Fetching API recommendations...')
            try {
                const recs = await getRecommendations(playedHistory, affinityMap)
                if (recs && recs.length > 0) {
                    console.log(`[Player] Loaded ${recs.length} recommendations from API`)
                    // Filter out current video
                    const filtered = recs.filter(r => {
                        const rId = getVideoId(r.url)
                        return rId && rId !== videoId
                    })
                    setRelatedVideos(filtered)
                }
            } catch (error) {
                console.error('[Player] Failed to fetch recommendations:', error)
            }
        }

        fetchRecommendations()
    }, [currentVideo, playedHistory, affinityMap, setRelatedVideos])


    // Volume control
    useEffect(() => {
        const webview = webviewRef.current
        if (!webview || !isWebviewReady) return

        webview.executeJavaScript(`
            (function(){
                const vid = document.querySelector('video');
                if (vid) vid.volume = ${Math.max(0, Math.min(1, volume))};
            })()
        `).catch(() => { })
    }, [volume, isWebviewReady])

    // Broadcast Time Updates (Projector -> Controller)
    useEffect(() => {
        if (isProjectorMode && ipcRenderer) {
            // Throttle slightly if needed, but 500ms polling from above is already coarse.
            // Actually, state.time above updates locally.
            // We just sync whenever they change.
            ipcRenderer.send('sync-time', { currentTime, duration })
        }
    }, [currentTime, duration, isProjectorMode])

    // Playback controls
    const handleTogglePlay = () => {
        const webview = webviewRef.current
        if (!webview || !isWebviewReady) return

        if (isPlaying) {
            webview.executeJavaScript(`document.querySelector('video')?.pause()`).catch(() => { })
            setPlaying(false)
        } else {
            webview.executeJavaScript(`document.querySelector('video')?.play()`).catch(() => { })
            setPlaying(true)
        }
    }

    const handleSeek = (time) => {
        const webview = webviewRef.current
        if (!webview || !isWebviewReady) return

        webview.executeJavaScript(`
            (function(){
                const vid = document.querySelector('video');
                if (vid) vid.currentTime = ${time};
            })()
        `).catch(() => { })
        setCurrentTime(time)
        setIsSeeking(false)
    }

    const skipAd = () => {
        const webview = webviewRef.current
        if (!webview || !isWebviewReady) return

        webview.executeJavaScript(`
            (function(){
                const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern');
                if (skipBtn) skipBtn.click();
            })()
        `).catch(() => { })
    }

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')} `
    }

    if (!currentVideo) {
        return (
            <div className={cn(
                'flex items-center justify-center h-full bg-background',
                className
            )}>
                <p className="text-text-dim">Select a song to play</p>
            </div>
        )
    }

    return (
        <div className={cn('relative h-full bg-black group', className)}>
            {/* Main Player Webview */}
            <webview
                ref={webviewRef}
                src={videoUrl}
                className="w-full h-full bg-black"
                allowpopups="true"
            />

            {/* Ad Skip Button */}
            {isAd && showSkipButton && (
                <div className="absolute top-4 right-4 z-50">
                    <button
                        onClick={skipAd}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
                    >
                        Skip Ad
                    </button>
                </div>
            )}

            {/* Controls Overlay (only if not projector mode) */}
            {!isProjectorMode && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4 space-y-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="flex items-center gap-2 text-xs font-mono text-white">
                        <span>{formatTime(currentTime)}</span>
                        <input
                            type="range"
                            min={0}
                            max={duration || 100}
                            value={currentTime}
                            onChange={(e) => { setIsSeeking(true); setCurrentTime(parseFloat(e.target.value)); }}
                            onMouseUp={() => handleSeek(currentTime)}
                            onTouchEnd={() => handleSeek(currentTime)}
                            className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                        />
                        <span>{formatTime(duration)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-2">
                        {/* Playback Controls */}
                        <div className="flex items-center gap-3">
                            {/* Shuffle */}
                            <button
                                onClick={toggleShuffle}
                                className={cn("p-2 rounded-full transition-colors", isShuffled ? "text-primary bg-primary/10" : "text-white/60 hover:bg-white/10")}
                                title="Shuffle"
                            >
                                <Shuffle size={18} />
                            </button>

                            {/* Play/Pause */}
                            <button
                                onClick={handleTogglePlay}
                                className="p-3 bg-white text-black rounded-full hover:scale-105 transition-transform"
                            >
                                {isPlaying ? (
                                    <Pause size={24} fill="currentColor" />
                                ) : (
                                    <Play size={24} fill="currentColor" className="ml-1" />
                                )}
                            </button>

                            {/* Next */}
                            <button
                                onClick={playNext}
                                className="p-2 text-white hover:text-white/80 transition-colors"
                            >
                                <SkipForward size={24} />
                            </button>

                            {/* Repeat */}
                            <button
                                onClick={() => {
                                    const modes = ['off', 'one', 'all'];
                                    const next = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
                                    setRepeatMode(next);
                                }}
                                className={cn("p-2 rounded-full transition-colors", repeatMode !== 'off' ? "text-primary bg-primary/10" : "text-white/60 hover:bg-white/10")}
                                title={`Repeat: ${repeatMode}`}
                            >
                                {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                            </button>
                        </div>

                        {/* Config Controls */}
                        <div className="flex items-center gap-2 relative">
                            {/* Backdrop for closing menus */}
                            {activeMenu && (
                                <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                            )}

                            {/* Speed */}
                            <div className="relative z-50">
                                <button
                                    onClick={() => setActiveMenu(activeMenu === 'speed' ? null : 'speed')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-mono text-white transition-colors border border-transparent hover:border-white/10"
                                    title="Playback Speed"
                                >
                                    <Gauge size={14} />
                                    <span>{playbackSpeed}x</span>
                                </button>

                                {activeMenu === 'speed' && (
                                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1a1b26] border border-white/10 rounded-lg overflow-hidden min-w-[100px] shadow-xl py-1 transform origin-bottom animate-in fade-in zoom-in-95 duration-100">
                                        {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => { setPlaybackSpeed(s); setActiveMenu(null); }}
                                                className={cn("w-full px-4 py-2 text-left text-xs font-mono hover:bg-white/10 flex items-center justify-between gap-3 decoration-0", playbackSpeed === s ? "text-primary" : "text-white/80")}
                                            >
                                                <span>{s}x</span>
                                                {playbackSpeed === s && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Resolution */}
                            <div className="relative z-50">
                                <button
                                    onClick={() => setActiveMenu(activeMenu === 'resolution' ? null : 'resolution')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-mono text-white transition-colors border border-transparent hover:border-white/10"
                                    title="Quality"
                                >
                                    <Settings size={14} />
                                    <span>{resolution === 'auto' ? 'Auto' : resolution.replace('hd', '')}</span>
                                </button>

                                {activeMenu === 'resolution' && (
                                    <div className="absolute bottom-full mb-2 right-0 bg-[#1a1b26] border border-white/10 rounded-lg overflow-hidden min-w-[120px] shadow-xl py-1 transform origin-bottom animate-in fade-in zoom-in-95 duration-100">
                                        {[
                                            { id: 'auto', label: 'Auto' },
                                            { id: 'hd1080', label: '1080p' },
                                            { id: 'hd720', label: '720p' },
                                            { id: 'large', label: '480p' },
                                            { id: 'medium', label: '360p' }
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                onClick={() => { setResolution(opt.id); setActiveMenu(null); }}
                                                className={cn("w-full px-4 py-2 text-left text-xs font-mono hover:bg-white/10 flex items-center justify-between gap-3 decoration-0", resolution === opt.id ? "text-primary" : "text-white/80")}
                                            >
                                                <span>{opt.label}</span>
                                                {resolution === opt.id && <Check size={12} />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="text-xs text-white/60 font-mono truncate px-2 max-w-[150px]">
                            {currentVideo?.title}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Player
