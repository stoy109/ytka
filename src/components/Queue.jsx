import React from 'react'
import usePlayerStore from '../store/usePlayerStore'
import { Trash2, Music } from 'lucide-react'
import { cn } from '../lib/utils'

const Queue = ({ className }) => {
    const { queue, removeFromQueue, playNext } = usePlayerStore()

    if (queue.length === 0) {
        return (
            <div className={cn("p-4 text-center text-text-dim border border-surface rounded-lg bg-surface/50", className)}>
                <p>Queue is empty</p>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col gap-2 p-2 bg-surface/30 rounded-lg overflow-auto", className)}>
            <h3 className="text-primary font-bold px-2 sticky top-0 bg-background/90 backdrop-blur z-10 py-2 border-b border-white/5">
                Queue ({queue.length})
            </h3>
            {queue.map((video, index) => (
                <div
                    key={index}
                    className="flex items-center gap-3 p-2 rounded hover:bg-white/5 group transition-colors"
                >
                    <div className="relative w-16 h-9 flex-shrink-0 bg-black rounded overflow-hidden">
                        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-text">{video.title}</p>
                        <p className="text-xs text-text-dim truncate">{video.channel}</p>
                    </div>
                    <button
                        onClick={() => removeFromQueue(index)}
                        className="p-1.5 text-text-dim hover:text-error opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-white/10"
                        title="Remove"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            ))}
            {queue.length > 0 && (
                <button
                    onClick={playNext}
                    className="mt-2 w-full py-2 bg-white/5 hover:bg-white/10 text-xs text-text-dim rounded transition-colors"
                >
                    Skip Current
                </button>
            )}
        </div>
    )
}

export default Queue
