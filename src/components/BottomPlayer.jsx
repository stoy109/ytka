import React, { useState } from 'react'
import { cn } from '../lib/utils'
import usePlayerStore from '../store/usePlayerStore'
import { Repeat, Repeat1, Shuffle, Gauge, Settings, SkipForward, SkipBack, Play, Pause, Check } from 'lucide-react'

const BottomPlayer = ({
    currentVideo,
    isPlaying,
    progress,
    duration,
    volume = 0.5,
    onTogglePlay,
    onNext,
    onSeek,
    formatTime,
    onVolumeChange,
    className
}) => {
    const { playbackSpeed, setPlaybackSpeed, repeatMode, setRepeatMode, isShuffled, toggleShuffle, resolution, setResolution } = usePlayerStore()
    const [activeMenu, setActiveMenu] = useState(null)

    // Fallback if no video
    if (!currentVideo) {
        return (
            <div className={cn("h-24 bg-black/90 backdrop-blur-md border-t border-white/10 flex items-center justify-center text-text-dim", className)}>
                <p>Select a song to start presenting</p>
            </div>
        )
    }

    return (
        <div className={cn("h-24 bg-black/90 backdrop-blur-xl border-t border-white/10 flex items-center px-4 md:px-6 gap-4 z-50", className)}>

            {/* LEFT: Track Info */}
            <div className="flex items-center gap-3 w-[30%] min-w-[200px]">
                <img
                    src={currentVideo.thumbnail}
                    alt="Art"
                    className="h-16 w-16 object-cover rounded shadow-lg"
                />
                <div className="flex flex-col overflow-hidden">
                    <h4 className="text-white font-bold truncate hover:underline cursor-default">
                        {currentVideo.title}
                    </h4>
                    <span className="text-xs text-text-dim truncate">
                        {currentVideo.channel}
                    </span>
                </div>
            </div>

            {/* CENTER: Controls & Scrub */}
            <div className="flex-1 flex flex-col items-center max-w-[40%] gap-2">
                {/* Buttons */}
                <div className="flex items-center gap-6">
                    <button
                        onClick={toggleShuffle}
                        className={cn("transition-colors", isShuffled ? "text-primary" : "text-text-dim hover:text-white")}
                    >
                        <Shuffle size={18} />
                    </button>

                    <button className="text-text-dim hover:text-white transition-colors">
                        <SkipBack size={20} />
                    </button>

                    <button
                        onClick={onTogglePlay}
                        className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                    >
                        {isPlaying ? (
                            <Pause size={20} fill="currentColor" />
                        ) : (
                            <Play size={20} fill="currentColor" className="ml-0.5" />
                        )}
                    </button>

                    <button
                        onClick={onNext}
                        className="text-text-dim hover:text-white transition-colors"
                    >
                        <SkipForward size={20} />
                    </button>

                    <button
                        onClick={() => {
                            const modes = ['off', 'one', 'all'];
                            const next = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
                            setRepeatMode(next);
                        }}
                        className={cn("transition-colors", repeatMode !== 'off' ? "text-primary" : "text-text-dim hover:text-white")}
                    >
                        {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
                    </button>
                </div>

                {/* Scrubber */}
                <div className="w-full flex items-center gap-2 text-xs font-mono text-text-dim">
                    <span>{formatTime(progress)}</span>
                    <input
                        type="range"
                        min={0}
                        max={duration || 100}
                        value={progress}
                        onChange={onSeek}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-primary"
                    />
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            {/* RIGHT: Extra (Vol, Present Status) */}
            <div className="flex items-center justify-end gap-3 w-[30%] text-primary relative">
                {/* Backdrop for closing menus */}
                {activeMenu && (
                    <div className="fixed inset-0 z-40 cursor-default" onClick={() => setActiveMenu(null)} />
                )}

                {/* Speed */}
                <div className="relative z-50">
                    <button
                        onClick={() => setActiveMenu(activeMenu === 'speed' ? null : 'speed')}
                        className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors", activeMenu === 'speed' ? "bg-white/10 text-white" : "text-text-dim hover:text-white hover:bg-white/5")}
                    >
                        <Gauge size={14} />
                        <span>{playbackSpeed}x</span>
                    </button>

                    {activeMenu === 'speed' && (
                        <div className="absolute bottom-full mb-2 right-0 bg-[#1a1b26] border border-white/10 rounded-lg overflow-hidden min-w-[100px] shadow-xl py-1">
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

                {/* Quality */}
                <div className="relative z-50">
                    <button
                        onClick={() => setActiveMenu(activeMenu === 'resolution' ? null : 'resolution')}
                        className={cn("flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors", activeMenu === 'resolution' ? "bg-white/10 text-white" : "text-text-dim hover:text-white hover:bg-white/5")}
                    >
                        <Settings size={14} />
                        <span>{resolution === 'auto' ? 'Auto' : resolution.replace('hd', '')}</span>
                    </button>

                    {activeMenu === 'resolution' && (
                        <div className="absolute bottom-full mb-2 right-0 bg-[#1a1b26] border border-white/10 rounded-lg overflow-hidden min-w-[120px] shadow-xl py-1">
                            {['auto', 'hd1080', 'hd720', 'large', 'medium'].map(q => (
                                <button
                                    key={q}
                                    onClick={() => { setResolution(q); setActiveMenu(null); }}
                                    className={cn("w-full px-4 py-2 text-left text-xs font-mono hover:bg-white/10 flex items-center justify-between gap-3 decoration-0", resolution === q ? "text-primary" : "text-white/80")}
                                >
                                    <span>{q === 'auto' ? 'Auto' : q.replace('hd', '').replace('large', '480p').replace('medium', '360p')}</span>
                                    {resolution === q && <Check size={12} />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div className="h-4 w-px bg-white/10 mx-1" />

                <span className="text-xs uppercase tracking-wider font-bold border border-primary/50 px-2 py-1 rounded select-none">
                    Presenting
                </span>

                <div className="flex items-center gap-2 group">
                    {volume === 0 ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                    )}

                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        onChange={onVolumeChange}
                        className="w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-primary"
                    />
                </div>
            </div>

        </div>
    )
}

export default BottomPlayer
