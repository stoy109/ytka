import React, { useEffect, useState } from 'react'
import Player from './components/Player'
import Search from './components/Search'
import Queue from './components/Queue'
import BottomPlayer from './components/BottomPlayer'
import usePlayerStore from './store/usePlayerStore'
import { cn } from './lib/utils'
import { Disc, Mic2, Github } from 'lucide-react'

// Electron IPC
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null }

function App() {
  const [mounted, setMounted] = useState(false)
  const [isProjector, setIsProjector] = useState(false)

  // Check if WE are the projector window
  const isProjectorWindow = window.location.hash.includes('projector')

  const { currentVideo, isPlaying, volume, queue, playbackSpeed, repeatMode, isShuffled, resolution, replayTrigger } = usePlayerStore(state => state)
  const setStoreState = usePlayerStore(state => state.setStoreState)
  const setPlaying = usePlayerStore(state => state.setPlaying)
  const playNext = usePlayerStore(state => state.playNext)

  // Remote Control State
  const [remoteProgress, setRemoteProgress] = useState(0)
  const [remoteDuration, setRemoteDuration] = useState(0)

  // SYNC LOGIC
  useEffect(() => {
    setMounted(true)

    if (ipcRenderer) {
      // Listen for status updates
      ipcRenderer.on('projector-status', (event, status) => {
        setIsProjector(status)
      })

      if (isProjectorWindow) {
        // WE ARE THE PROJECTOR: Listen for Master State
        const handleSyncState = (e, state) => {
          // console.log("Projector received state:", state)
          setStoreState(state)
        }
        ipcRenderer.on('sync-state', handleSyncState)

        // Listen for Remote Commands (Seek, etc.)
        const handleRemoteCommand = (e, cmd) => {
          if (cmd.type === 'seek') {
            usePlayerStore.setState({ seekTrigger: { time: cmd.time, ts: Date.now() } })
          }
        }
        ipcRenderer.on('remote-command', handleRemoteCommand)

        return () => {
          ipcRenderer.removeListener('sync-state', handleSyncState)
          ipcRenderer.removeListener('remote-command', handleRemoteCommand)
        }
      } else if (isProjector) {
        // WE ARE THE CONTROLLER: Broadcast State
        ipcRenderer.send('sync-state', {
          currentVideo, isPlaying, queue, volume,
          playbackSpeed, repeatMode, isShuffled, resolution, replayTrigger
        })

        // Listen for Time Updates from Projector
        const handleSyncTime = (e, data) => {
          setRemoteProgress(data.currentTime)
          setRemoteDuration(data.duration)
        }
        ipcRenderer.on('sync-time', handleSyncTime)
        return () => ipcRenderer.removeListener('sync-time', handleSyncTime)
      }
    }
  }, [isProjector, isProjectorWindow, currentVideo, isPlaying, queue, playbackSpeed, repeatMode, isShuffled, resolution, replayTrigger, setStoreState, volume])

  const toggleProjector = () => {
    if (ipcRenderer) {
      ipcRenderer.send('toggle-projector')
    }
  }

  const handleRemoteSeek = (e) => {
    const time = parseFloat(e.target.value)
    setRemoteProgress(time)
    // Send command to seek
    if (ipcRenderer) ipcRenderer.send('remote-command', { type: 'seek', time })
  }

  // Helper to format time
  const formatTime = (seconds) => {
    if (!seconds) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs < 10 ? '0' + secs : secs}`
  }

  if (!mounted) return null

  // PROJECTOR MODE RENDER (Clean View)
  if (isProjectorWindow) {
    return (
      <div className="w-screen h-screen bg-black overflow-hidden relative group">
        <Player className="w-full h-full" isProjectorMode={true} />
      </div>
    )
  }

  return (
    <div className="h-screen bg-background text-text selection:bg-primary/30 p-4 md:p-8 flex flex-col gap-6 relative overflow-hidden">
      {/* Dedicated Drag Region - Avoid covering scrollbar (right side gap) */}
      <div className="fixed top-0 left-0 w-[calc(100%-20px)] h-8 z-50 pointer-events-none" style={{ WebkitAppRegion: 'drag' }} />
      {/* Header */}
      <header className="flex items-center justify-between pb-6 border-b border-white/5 select-none relative z-[51]" style={{ WebkitAppRegion: 'drag' }}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-lg shadow-[0_0_15px_rgba(0,255,245,0.4)]">
            <Mic2 className="text-background w-6 h-6" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            YT<span className="text-primary">KA</span>
          </h1>
        </div>

        <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' }}>
          {ipcRenderer && (
            <button
              onClick={toggleProjector}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${isProjector ? 'bg-primary text-black border-primary' : 'bg-transparent text-primary border-primary/50 hover:border-primary'}`}
            >
              <Disc className={`w-4 h-4 ${isProjector ? 'animate-spin-slow' : ''}`} />
              <span className="text-sm font-bold">{isProjector ? 'PROJECTING' : 'PRESENT'}</span>
            </button>
          )}

          <a href="#" className="text-text-dim hover:text-primary transition-colors">
            <Github className="w-6 h-6" />
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative z-0">
        {/* 
            LAYOUT LOGIC:
            - Normal Mode: Grid with Player (Left) and Queue (Right)
            - Present Mode (Spotify Style): List/Queue takes full width, Player moves to Bottom Bar
          */}

        <div className={cn(
          "h-full p-4 md:p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent",
          // Normal Mode: 3 Columns
          // Present Mode: 12 Columns
          !isProjector
            ? "grid grid-cols-1 lg:grid-cols-3 gap-6"
            : "grid grid-cols-1 lg:grid-cols-12 gap-6 pb-32" // Added pb-32 for bottom player space
        )}>

          {/* VIDEO SECTION (Only in Normal Mode) */}
          {!isProjector && (
            <section className="lg:col-span-2 flex flex-col gap-4">
              <div className="aspect-video w-full bg-black rounded-lg overflow-hidden shadow-2xl shadow-primary/10">
                <Player className="w-full h-full" />
              </div>
            </section>
          )}

          {/* SEARCH SECTION (Takes prominent space in Present Mode) */}
          <section className={cn(
            "flex flex-col gap-4",
            !isProjector
              ? "lg:col-span-1 lg:row-span-2 sticky top-0 h-[calc(100vh-6rem)]"
              : "lg:col-span-8 xl:col-span-9"
          )}>
            <div className="flex flex-col gap-4 h-full">
              <h2 className="text-xl font-bold text-white">Find Songs</h2>
              <Search className="w-full h-full" isGrid={isProjector} />
            </div>
          </section>

          {/* QUEUE SECTION (Sidebar in Present Mode, Below Player in Normal) */}
          <aside className={cn(
            "bg-surface border border-white/5 rounded-xl p-4 flex flex-col min-h-[400px]",
            !isProjector ? "lg:col-span-2" : "lg:col-span-4 xl:col-span-3 h-full"
          )}>
            <h2 className="text-xl font-bold text-white mb-4">Up Next</h2>
            <Queue className="h-full" />
          </aside>

        </div>
      </main>

      {/* BOTTOM PLAYER BAR (Only in Present Mode) */}
      {isProjector && (
        <BottomPlayer
          currentVideo={currentVideo}
          isPlaying={isPlaying}
          progress={remoteProgress}
          duration={remoteDuration}
          volume={volume}
          onTogglePlay={() => setPlaying(!isPlaying)}
          onNext={playNext}
          onSeek={handleRemoteSeek}
          onVolumeChange={(e) => {
            const newVol = parseFloat(e.target.value)
            setStoreState({ volume: newVol }) // Update local store
            if (ipcRenderer) ipcRenderer.send('remote-command', { type: 'volume', volume: newVol }) // Send direct command or rely on sync
          }}
          formatTime={formatTime}
          className="fixed bottom-0 left-0 w-full"
        />
      )}

      {/* Footer (Only in Normal Mode, or hidden in Present) */}
      {!isProjector && (
        <footer className="flex-none p-4 text-center text-text-dim text-sm border-t border-white/5 bg-background">
          <p>Built with React + Vite + Tailwind</p>
        </footer>
      )}
    </div>
  )
}

export default App
