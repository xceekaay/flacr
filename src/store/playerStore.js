import { create } from 'zustand'

const STORAGE_KEY_PREFS = 'flacr_player_prefs'
const STORAGE_KEY_QUEUE = 'flacr_player_queue'

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS) || '{}') } catch { return {} }
}
function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs)) } catch {}
}
function loadQueue() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUE) || 'null') } catch { return null }
}

// Called by Library after allSongs loads — resolves persisted IDs back to full song objects
export function restoreQueueFromLibrary(allSongs) {
  const saved = loadQueue()
  if (!saved?.ids?.length || !allSongs?.length) return
  const songMap = new Map(allSongs.map(s => [s.Id, s]))
  const queue = saved.ids.map(id => songMap.get(id)).filter(Boolean)
  if (!queue.length) return
  const currentIndex = Math.min(saved.currentIndex ?? 0, queue.length - 1)
  usePlayerStore.setState({ queue, originalQueue: queue, currentIndex })
}
function saveQueue(queue, currentIndex) {
  // Store only song IDs to minimise data at rest — full objects are rebuilt from library in memory
  try {
    const ids = queue.map(s => s.Id)
    localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify({ ids, currentIndex }))
  } catch {}
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const useProgressStore = create((set) => ({
  progress: 0, duration: 0,
  setProgress: (v) => set({ progress: v }),
  setDuration:  (v) => set({ duration: v }),
}))

const prefs    = loadPrefs()
const usePlayerStore = create((set, get) => ({
  queue:         [],
  originalQueue: [],
  currentIndex:  -1,
  playHistory:   [],  // ordered list of song IDs actually played this session
  isPlaying:     false,
  shuffle:       prefs.shuffle  ?? false,
  repeat:        prefs.repeat   ?? 'none',
  volume:        prefs.volume   ?? 1,
  crossfade:     prefs.crossfade ?? 0,
  sleepTimer:    null,
  restartToken:  0,

  setQueue: (songs, startIndex = 0) => {
    set({ queue: songs, originalQueue: songs, currentIndex: startIndex })
    saveQueue(songs, startIndex)
  },

  playSong: (songs, index) => {
    const { shuffle, queue, currentIndex } = get()
    const clickedSong = songs[index]

    if (queue[currentIndex]?.Id === clickedSong?.Id) {
      set(s => ({ restartToken: s.restartToken + 1, isPlaying: true }))
      return
    }

    if (shuffle) {
      const rest = shuffleArray(songs.filter((_, i) => i !== index))
      const shuffled = [clickedSong, ...rest]
      set({ queue: shuffled, originalQueue: songs, currentIndex: 0, isPlaying: true, playHistory: [clickedSong?.Id].filter(Boolean) })
      saveQueue(shuffled, 0)
    } else {
      set({ queue: songs, originalQueue: songs, currentIndex: index, isPlaying: true, playHistory: [songs[index]?.Id].filter(Boolean) })
      saveQueue(songs, index)
    }
  },

  // Direct index advance — used by crossfade to skip next() logic entirely
  // Used by crossfade completion — advances index (or re-triggers render for same index)
  setCurrentIndex: (index) => {
    const { queue, currentIndex } = get()
    if (index === currentIndex) {
      set(s => ({ _cfTick: (s._cfTick || 0) + 1, isPlaying: true }))
    } else {
      set({ currentIndex: index, isPlaying: true })
    }
    saveQueue(queue, index)
  },
  _cfTick: 0,

  playNext: (song) => {
    const { queue, currentIndex } = get()
    const next = [...queue]
    next.splice(currentIndex + 1, 0, song)
    set({ queue: next })
    saveQueue(next, currentIndex)
  },

  // Play a song immediately without disrupting queue order
  playNow: (song) => {
    const { queue, currentIndex } = get()
    const insertAt = currentIndex + 1
    const next = [...queue]
    next.splice(insertAt, 0, song)
    set({ queue: next, currentIndex: insertAt, isPlaying: true })
    saveQueue(next, insertAt)
  },

  addToQueue: (song) => {
    const { queue, currentIndex, originalQueue } = get()
    const next = [...queue, song]
    const nextOrig = [...originalQueue, song]
    if (queue.length === 0) {
      const newIndex = queue.length
      set({ queue: next, originalQueue: nextOrig, currentIndex: newIndex, isPlaying: true })
      saveQueue(next, newIndex)
    } else {
      set({ queue: next, originalQueue: nextOrig })
      saveQueue(next, currentIndex)
    }
  },

  addManyToQueue: (songs) => {
    if (!songs || !songs.length) return
    const { queue, currentIndex, originalQueue } = get()
    const next = [...queue, ...songs]
    const nextOrig = [...originalQueue, ...songs]
    if (queue.length === 0) {
      const newIndex = queue.length
      set({ queue: next, originalQueue: nextOrig, currentIndex: newIndex, isPlaying: true })
      saveQueue(next, newIndex)
    } else {
      set({ queue: next, originalQueue: nextOrig })
      saveQueue(next, currentIndex)
    }
  },

  removeFromQueue: (index) => {
    const { queue, currentIndex } = get()
    const next = queue.filter((_, i) => i !== index)
    const newIndex = index < currentIndex
      ? currentIndex - 1
      : Math.min(currentIndex, next.length - 1)
    set({ queue: next, currentIndex: newIndex })
    saveQueue(next, newIndex)
  },

  clearQueue: () => {
    const { queue, currentIndex } = get()
    const current = queue[currentIndex]
    if (current) {
      set({ queue: [current], originalQueue: [current], currentIndex: 0 })
      saveQueue([current], 0)
    } else {
      set({ queue: [], originalQueue: [], currentIndex: -1, isPlaying: false })
      saveQueue([], -1)
    }
  },

  moveInQueue: (from, to) => {
    const { queue, currentIndex } = get()
    const next = [...queue]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    let newIndex = currentIndex
    if (from === currentIndex) newIndex = to
    else if (from < currentIndex && to >= currentIndex) newIndex = currentIndex - 1
    else if (from > currentIndex && to <= currentIndex) newIndex = currentIndex + 1
    set({ queue: next, currentIndex: newIndex })
    saveQueue(next, newIndex)
  },

  // Record a song as played (called whenever a new song starts)
  recordPlay: (songId) => {
    if (!songId) return
    set(s => {
      // Avoid duplicating the most-recent entry (e.g. repeat-one restarts)
      if (s.playHistory[s.playHistory.length - 1] === songId) return {}
      return { playHistory: [...s.playHistory, songId] }
    })
  },

  togglePlay:   () => set(s => ({ isPlaying: !s.isPlaying })),
  setIsPlaying: (v) => set({ isPlaying: v }),

  setVolume: (v) => {
    set({ volume: v })
    savePrefs({ ...loadPrefs(), volume: v })
  },

  setCrossfade: (v) => {
    set({ crossfade: v })
    savePrefs({ ...loadPrefs(), crossfade: v })
  },

  setSleepTimer: (minutes) => {
    if (!minutes || minutes === 0 || minutes === '0') { set({ sleepTimer: null }); return }
    if (minutes === 'song') { set({ sleepTimer: 'song' }); return }
    set({ sleepTimer: Date.now() + minutes * 60 * 1000 })
  },

  tickSleepTimer: () => {
    const { sleepTimer } = get()
    if (!sleepTimer || sleepTimer === 'song') return
    if (Date.now() >= sleepTimer) set({ isPlaying: false, sleepTimer: null })
  },

  toggleShuffle: () => {
    const { shuffle, queue, currentIndex, originalQueue } = get()
    const currentSong = queue[currentIndex]
    const newShuffle = !shuffle

    if (newShuffle) {
      const rest = shuffleArray(queue.filter((_, i) => i !== currentIndex))
      const shuffled = currentSong ? [currentSong, ...rest] : shuffleArray(queue)
      const newIndex = currentSong ? 0 : -1
      set({ shuffle: true, queue: shuffled, originalQueue: queue, currentIndex: newIndex })
      saveQueue(shuffled, newIndex)
    } else {
      const newIndex = originalQueue.findIndex(s => s.Id === currentSong?.Id)
      const restoredIndex = newIndex >= 0 ? newIndex : currentIndex
      set({ shuffle: false, queue: originalQueue, currentIndex: restoredIndex })
      saveQueue(originalQueue, restoredIndex)
    }

    savePrefs({ ...loadPrefs(), shuffle: newShuffle })
  },

  cycleRepeat: () => {
    const r = get().repeat === 'none' ? 'all' : get().repeat === 'all' ? 'one' : 'none'
    set({ repeat: r })
    savePrefs({ ...loadPrefs(), repeat: r })
  },

  next: () => {
    const { queue, currentIndex, repeat, shuffle, originalQueue } = get()
    if (!queue.length) return

    if (repeat === 'one') {
      set(s => ({ restartToken: s.restartToken + 1, isPlaying: true }))
      return
    }

    const nextIndex = currentIndex + 1

    if (nextIndex >= queue.length) {
      if (repeat === 'all') {
        if (shuffle) {
          const reshuffled = shuffleArray(originalQueue.length > 0 ? originalQueue : queue)
          set({ queue: reshuffled, currentIndex: 0, isPlaying: true })
          saveQueue(reshuffled, 0)
        } else {
          set({ currentIndex: 0, isPlaying: true })
          saveQueue(queue, 0)
        }
      } else {
        set({ isPlaying: false })
      }
    } else {
      set(s => ({ currentIndex: nextIndex, isPlaying: true,
        playHistory: s.playHistory[s.playHistory.length-1] === queue[s.currentIndex]?.Id
          ? s.playHistory
          : [...s.playHistory, queue[s.currentIndex]?.Id].filter(Boolean) }))
      saveQueue(queue, nextIndex)
    }
  },

  prev: () => {
    const { queue, currentIndex } = get()
    const { progress } = useProgressStore.getState()
    if (!queue.length) return

    if (progress > 3) {
      set(s => ({ restartToken: s.restartToken + 1, isPlaying: true }))
      return
    }

    const idx = Math.max(0, currentIndex - 1)
    set({ currentIndex: idx, isPlaying: true })
    saveQueue(queue, idx)
  },

  prevForce: () => {
    const { queue, currentIndex } = get()
    if (!queue.length) return
    const idx = Math.max(0, currentIndex - 1)
    set({ currentIndex: idx, isPlaying: true })
    saveQueue(queue, idx)
  },
}))

export default usePlayerStore
