import { useEffect, useRef, useState, useCallback } from 'react'
import usePlayerStore, { useProgressStore } from '../store/playerStore'
import useSettingsStore from '../store/settingsStore'
import { streamUrl, imgUrl, reportPlaybackStart, reportPlaybackProgress, reportPlaybackStopped, forceUpdateHistoryDate } from '../utils/api'
import { formatSeconds } from '../utils/format'
import { LyricsOverlay } from './LyricsOverlay'

const iconBtn = {
  background: 'transparent', border: 'none', color: '#666', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '6px', borderRadius: '6px', transition: 'color 0.2s ease, transform 0.15s ease',
}

function VolumeIcon({ volume }) {
  const s = '#555'
  if (volume === 0) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  )
  if (volume < 0.5) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  )
}

function getReplayGainVolume(song, userVolume) {
  if (!song) return userVolume
  const gain = song.NormalizationGain ?? song.ReplayGain ?? null
  if (gain == null) return userVolume
  return Math.min(1, userVolume * Math.pow(10, gain / 20))
}

function Player({ session, onOpenNowPlaying, showQueue, onToggleQueue }) {
  const { queue, currentIndex, isPlaying, shuffle, repeat, volume, restartToken,
    togglePlay, setIsPlaying, setVolume, toggleShuffle, cycleRepeat,
    next, prev, sleepTimer, tickSleepTimer, setCurrentIndex } = usePlayerStore()
  const { progress, duration, setProgress, setDuration } = useProgressStore()
  const { normalize, crossfade, gapless, eq } = useSettingsStore()

  const audioA          = useRef(null)
  const audioB          = useRef(null)
  const activeRef       = useRef('A')
  const loadedSongIdRef = useRef(null)

  const cfActiveRef      = useRef(false)
  const cfRafRef         = useRef(null)
  const cfTriggeredRef   = useRef(null)
  const cfStartVolRef    = useRef(1)
  const cfNextVolRef     = useRef(1)    // effective volume for the incoming song
  const cfStartTimeRef   = useRef(0)
  const cfFadeDurRef     = useRef(0)    // actual fade ms — capped to remaining time
  const cfNextIdRef      = useRef(null)
  const cfNextIndexRef   = useRef(-1)
  const cfCompletingRef  = useRef(false)

  const effectiveVolumeRef = useRef(volume)
  const crossfadeRef       = useRef(crossfade)
  const sessionRef         = useRef(session)
  const audioCtxRef        = useRef(null)
  const filtersRef         = useRef([])

  const volumeBarRef     = useRef(null)
  const seekBarRef        = useRef(null)
  const lastReportRef     = useRef(0)
  const startReportedRef  = useRef(false)
  const listenedSecsRef   = useRef(0)   // accumulated listening seconds for the current track
  const lastCtRef         = useRef(0)   // previous currentTime, for delta tracking

  const [localVolume,      setLocalVolume]      = useState(volume)
  const [isDraggingVolume, setIsDraggingVolume] = useState(false)
  const [isDraggingSeek,   setIsDraggingSeek]   = useState(false)
  const [showVolumeLabel,  setShowVolumeLabel]   = useState(false)
  const [showLyrics,       setShowLyrics]        = useState(false)
  const [lyricsExiting,    setLyricsExiting]     = useState(false)
  const showLyricsRef = useRef(false)
  useEffect(() => { showLyricsRef.current = showLyrics }, [showLyrics])
  const closeLyrics = () => { setLyricsExiting(true); setTimeout(() => { setShowLyrics(false); setLyricsExiting(false) }, 280) }
  const closeLyricsRef = useRef(closeLyrics)
  useEffect(() => { closeLyricsRef.current = closeLyrics }, [closeLyrics])

  useEffect(() => { setLocalVolume(volume) }, [volume])

  const song = queue[currentIndex] || null

  const [displaySong, setDisplaySong] = useState(song)
  const [barOpen, setBarOpen]         = useState(!!song)
  useEffect(() => {
    if (song) {
      setDisplaySong(song)
      setBarOpen(true)
    } else {
      setBarOpen(false)
      const t = setTimeout(() => setDisplaySong(null), 320)
      return () => clearTimeout(t)
    }
  }, [song])

  const effectiveVolume = normalize && song
    ? getReplayGainVolume(song, volume)
    : volume

  useEffect(() => { effectiveVolumeRef.current = effectiveVolume }, [effectiveVolume])
  useEffect(() => { crossfadeRef.current = crossfade }, [crossfade])
  useEffect(() => { sessionRef.current = session }, [session])

  useEffect(() => {
    // Guard: createMediaElementSource can only be called once per element.
    if (audioCtxRef.current || !audioA.current || !audioB.current) return

    const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    audioCtxRef.current = ctx

    const filters = EQ_FREQS.map(freq => {
      const f = ctx.createBiquadFilter()
      f.type = 'peaking'
      f.frequency.value = freq
      f.Q.value = 1.41
      f.gain.value = 0
      return f
    })
    for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1])
    filters[filters.length - 1].connect(ctx.destination)
    filtersRef.current = filters

    try {
      const srcA = ctx.createMediaElementSource(audioA.current)
      const srcB = ctx.createMediaElementSource(audioB.current)
      srcA.connect(filters[0])
      srcB.connect(filters[0])
    } catch (e) {
      console.error('AudioContext connection failed:', e)
    }
  }, []) // Refs are set by the time useEffect runs after first render

  // Update EQ gains
  useEffect(() => {
    const filters = filtersRef.current
    if (!filters.length) return
    const ctx = audioCtxRef.current
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
    eq.gains.slice(0, filters.length).forEach((gain, i) => {
      filters[i].gain.value = eq.enabled ? gain : 0
    })
  }, [eq])

  const getActive  = () => activeRef.current === 'A' ? audioA.current : audioB.current
  const getPassive = () => activeRef.current === 'A' ? audioB.current : audioA.current

  const abortCrossfade = () => {
    if (cfRafRef.current) { cancelAnimationFrame(cfRafRef.current); cfRafRef.current = null }
    cfActiveRef.current     = false
    cfTriggeredRef.current  = null
    cfFadeDurRef.current    = 0
    cfNextVolRef.current    = 1
    cfNextIdRef.current     = null
    cfNextIndexRef.current  = -1
    cfCompletingRef.current = false
    const p = getPassive()
    if (p) { p.pause(); p.src = ''; p.dataset.songId = '' }
  }

  // ── Sleep timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sleepTimer) return
    const interval = setInterval(tickSleepTimer, 1000)
    return () => clearInterval(interval)
  }, [sleepTimer])

  // ── Discord Rich Presence ─────────────────────────────────────────────────
  const { discordRPC } = useSettingsStore()

  useEffect(() => {
    window.electronAPI?.setDiscordRpcEnabled?.(discordRPC)
    if (!discordRPC) window.electronAPI?.updatePresence?.({ playing: false })
  }, [discordRPC])

  const updateDiscordSeek = useCallback((seekPos) => {
    if (!useSettingsStore.getState().discordRPC) return
    const ipc = window.electronAPI
    if (!ipc?.updatePresence) return
    const { queue, currentIndex, isPlaying: playing } = usePlayerStore.getState()
    const s = queue[currentIndex] || null
    if (!s || !playing) return
    ipc.updatePresence({
      playing:        true,
      title:          s.Name,
      artist:         s.AlbumArtist || '',
      startTimestamp: Date.now() - Math.round(seekPos * 1000),
    })
  }, [])

  // ── Windows SMTC / volume flyout metadata ────────────────────────────────
  useEffect(() => {
    if (song) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title:  song.Name        || '',
        artist: song.AlbumArtist || '',
        album:  song.Album       || '',
      })
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    } else {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = 'none'
    }
  }, [song, isPlaying])

  useEffect(() => {
    const ipc = window.electronAPI
    if (!ipc?.updatePresence) return
    if (!discordRPC) return
    if (!song || !isPlaying) { ipc.updatePresence({ playing: false }); return }
    ipc.updatePresence({
      playing:        true,
      title:          song.Name,
      artist:         song.AlbumArtist || '',
      startTimestamp: Date.now() - Math.round(useProgressStore.getState().progress * 1000),
    })
  }, [song, isPlaying, discordRPC])

  // ── External seek + volume (from fullscreen player) ──────────────────────
  useEffect(() => {
    const onSeek = (e) => {
      const t = e.detail
      const active = getActive()
      if (active) active.currentTime = t
      setProgress(t)
      updateDiscordSeek(t)
    }
    const onVolume = (e) => {
      setVolume(e.detail)
    }
    window.addEventListener('flacr:seek', onSeek)
    window.addEventListener('flacr:volume', onVolume)
    return () => {
      window.removeEventListener('flacr:seek', onSeek)
      window.removeEventListener('flacr:volume', onVolume)
    }
  }, [])

  // ── Restart token ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (restartToken === 0) return
    // Abort any running crossfade — user is going back, fade is no longer valid
    abortCrossfade()
    const active = getActive()
    if (!active) return
    active.volume = effectiveVolumeRef.current  // restore full volume (was being faded out)
    active.currentTime = 0
    setProgress(0)
    startReportedRef.current = false
    listenedSecsRef.current  = 0
    lastCtRef.current        = 0
    lastReportRef.current    = Date.now()
    if (usePlayerStore.getState().isPlaying) {
      active.play().catch(console.error)
      if (useSettingsStore.getState().discordRPC) {
        const { queue, currentIndex } = usePlayerStore.getState()
        const s = queue[currentIndex]
        if (s) window.electronAPI?.updatePresence?.({ playing: true, title: s.Name, artist: s.AlbumArtist || '', startTimestamp: Date.now() })
      }
    }
  }, [restartToken])

  // ── Load new track ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!song) return
    const active = getActive()
    if (!active) return

    if (loadedSongIdRef.current === song.Id && active.dataset.songId === song.Id) return

    abortCrossfade()

    const passive = getPassive()

    if (passive && passive.dataset.songId === song.Id && passive.readyState >= 2) {
      activeRef.current = activeRef.current === 'A' ? 'B' : 'A'
      loadedSongIdRef.current = song.Id
      const newActive = getActive()
      newActive.volume = effectiveVolume
      setDuration(0); setProgress(0)
      if (isPlaying) newActive.play().catch(console.error)
      const newPassive = getPassive()
      if (newPassive) { newPassive.pause(); newPassive.src = ''; newPassive.dataset.songId = '' }
      // Reset reporting state for the new track (same as the normal load path below)
      startReportedRef.current = false
      listenedSecsRef.current  = 0
      lastCtRef.current        = 0
      lastReportRef.current    = Date.now()
    } else {
      if (passive) { 
        passive.pause(); passive.src = ''; passive.dataset.songId = '' 
        // Report stop for previous song if it was actually playing
        if (loadedSongIdRef.current) {
          const oldSong = queue.find(s => s.Id === loadedSongIdRef.current)
          if (oldSong) reportPlaybackStopped(session, oldSong, Math.round(active.currentTime * 10_000_000))
        }
      }
      active.src = streamUrl(session, song.Id)
      active.dataset.songId = song.Id
      loadedSongIdRef.current = song.Id
      active.volume = effectiveVolume
      setDuration(0); setProgress(0)
      active.load()
      if (isPlaying) active.play().catch(console.error)
      
      // Reset reporting state for the new track
      startReportedRef.current = false
      listenedSecsRef.current  = 0
      lastCtRef.current        = 0
      lastReportRef.current    = Date.now()
    }
  }, [currentIndex, queue])

  // ── Play / pause ──────────────────────────────────────────────────────────
  // IMPORTANT: never abort crossfade here — crossfade manages its own audio.
  // Only abort if user explicitly paused (isPlaying went false) AND no crossfade.
  useEffect(() => {
    const active = getActive()
    if (!active) return
    if (isPlaying) {
      // If crossfade is running, active element is being faded out — don't re-play it
      if (!cfActiveRef.current) {
        active.play().catch(console.error)
      }
    } else {
      // User paused — stop everything including any running crossfade
      active.pause()
      if (cfActiveRef.current) {
        // Also stop the passive element that was being faded in
        const passive = getPassive()
        if (passive) passive.pause()
        abortCrossfade()
      }
    }
  }, [isPlaying])

  // ── Volume ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const active = getActive()
    if (active && !cfActiveRef.current) active.volume = effectiveVolume
  }, [effectiveVolume])

  // ── Gapless preload ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!gapless || crossfade > 0) return
    const state = usePlayerStore.getState()
    const nextS = state.queue[state.currentIndex + 1]
    if (!nextS || !duration || progress < duration - 10) return
    const passive = getPassive()
    if (!passive || passive.dataset.songId === nextS.Id) return
    passive.src = streamUrl(session, nextS.Id)
    passive.dataset.songId = nextS.Id
    passive.volume = 0
    passive.load()
  }, [progress, duration, gapless, crossfade])

  // ── Crossfade rAF tick ────────────────────────────────────────────────────
  const runCrossfadeTick = useCallback(() => {
    if (!cfActiveRef.current) return

    if (!usePlayerStore.getState().isPlaying) {
      abortCrossfade()
      return
    }

    const active  = getActive()
    const passive = getPassive()
    const elapsed = performance.now() - cfStartTimeRef.current
    const fadeDur = cfFadeDurRef.current
    const ratio   = Math.min(elapsed / fadeDur, 1)
    const ev      = effectiveVolumeRef.current   // outgoing song's volume
    const nv      = cfNextVolRef.current          // incoming song's target volume

    // Equal-power curve — eliminates the perceptual volume bump at the crossover point
    const angle = ratio * (Math.PI / 2)
    if (active)  active.volume  = cfStartVolRef.current * Math.cos(angle)
    if (passive) passive.volume = nv * Math.sin(angle)

    if (ratio < 1) {
      cfRafRef.current = requestAnimationFrame(runCrossfadeTick)
    } else {
      // Fade complete — snap incoming song to exact target volume (avoid sin(π/2) float drift)
      const nextId    = cfNextIdRef.current
      const nextIndex = cfNextIndexRef.current

      cfCompletingRef.current = true

      if (active) { active.pause(); active.src = ''; active.dataset.songId = '' }
      activeRef.current = activeRef.current === 'A' ? 'B' : 'A'

      const newActive = getActive()
      // Snap to exact user-intended volume — no float drift, no ReplayGain surprise
      if (newActive) newActive.volume = nv

      loadedSongIdRef.current = nextId
      // Reset listening tracker so the new song can earn its own history entry
      startReportedRef.current = false
      listenedSecsRef.current  = 0
      lastCtRef.current        = 0

      if (newActive) {
        if (newActive.duration) setDuration(newActive.duration)
        setProgress(newActive.currentTime || 0)
      }

      cfRafRef.current       = null
      cfActiveRef.current    = false
      cfTriggeredRef.current = null
      cfNextIdRef.current    = null
      cfNextIndexRef.current = -1
      // Keep effectiveVolumeRef current so the [effectiveVolume] effect doesn't snap over us
      effectiveVolumeRef.current = nv

      usePlayerStore.getState().setCurrentIndex(nextIndex)

      if (useSettingsStore.getState().discordRPC) {
        const { queue } = usePlayerStore.getState()
        const s = queue[nextIndex]
        if (s) window.electronAPI?.updatePresence?.({ playing: true, title: s.Name, artist: s.AlbumArtist || '', startTimestamp: Date.now() })
      }

      // "After current song" sleep timer — crossfade fade-out = end of current song
      const { sleepTimer: st } = usePlayerStore.getState()
      if (st === 'song') {
        usePlayerStore.getState().setSleepTimer(null)
        usePlayerStore.getState().setIsPlaying(false)
        if (newActive) newActive.pause()
      }

      setTimeout(() => { cfCompletingRef.current = false }, 200)
    }
  }, [])

  // ── Trigger crossfade — called every tick from handleTimeUpdate ───────────
  const maybeTriggerCrossfade = useCallback((currentTime, dur) => {
    const cf = crossfadeRef.current
    if (cf <= 0 || !dur) return

    const state = usePlayerStore.getState()
    if (!state.isPlaying) return
    if (state.sleepTimer === 'song') return

    const { queue: q, currentIndex: ci, repeat: rep } = state
    const curSong = q[ci]

    // Determine next song based on repeat mode FIRST
    let nextIdx, nextS
    if (rep === 'one') {
      nextIdx = ci
      nextS   = q[ci]
    } else {
      nextIdx = ci + 1
      nextS   = q[nextIdx]
      if (!nextS) {
        if (rep === 'all') { nextIdx = 0; nextS = q[0] }
        else return
      }
    }
    if (!nextS) return

    const timeLeft = dur - currentTime
    if (timeLeft > cf || timeLeft <= 0) return
    if (cfActiveRef.current) return
    if (cfTriggeredRef.current === curSong?.Id) return

    // Commit immediately — blocks handleEnded and the isPlaying effect
    cfActiveRef.current    = true
    cfTriggeredRef.current = curSong?.Id
    cfNextIdRef.current    = nextS.Id
    cfNextIndexRef.current = nextIdx
    // Use actual remaining time as fade duration — handles seek-to-near-end case
    cfFadeDurRef.current   = Math.max(timeLeft * 1000, 50)

    const passive = getPassive()
    if (!passive) { abortCrossfade(); return }

    const activeEl = getActive()
    cfStartVolRef.current = activeEl ? activeEl.volume : effectiveVolumeRef.current

    // Calculate the target volume for the incoming song (respects its ReplayGain if normalize is on)
    const userVol = usePlayerStore.getState().volume
    const nextEffVol = normalize && nextS
      ? getReplayGainVolume(nextS, userVol)
      : userVol
    cfNextVolRef.current = nextEffVol

    if (passive.dataset.songId !== nextS.Id) {
      passive.src = streamUrl(sessionRef.current, nextS.Id)
      passive.dataset.songId = nextS.Id
      passive.volume = 0
      passive.load()
    }

    const beginFade = () => {
      if (!cfActiveRef.current) return
      if (!usePlayerStore.getState().isPlaying) { abortCrossfade(); return }

      cfStartTimeRef.current = performance.now()
      passive.volume = 0
      if (passive.paused) passive.play().catch(console.error)
      cfRafRef.current = requestAnimationFrame(runCrossfadeTick)
    }

    if (passive.readyState >= 3) {
      beginFade()
    } else {
      const onCanPlay = () => {
        passive.removeEventListener('canplay', onCanPlay)
        // Recalculate remaining time now that we've waited for buffering
        const active = getActive()
        if (active && active.duration) {
          const remaining = active.duration - active.currentTime
          // If barely any time left, just do a very quick fade
          cfFadeDurRef.current = Math.max(remaining * 1000, 50)
        }
        beginFade()
      }
      passive.addEventListener('canplay', onCanPlay)
    }
  }, [runCrossfadeTick])

  // ── Keyboard volume ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName.toLowerCase() === 'input') return
      if (e.code === 'ArrowUp')   { e.preventDefault(); setVolume(Math.min(1, Math.round((volume + 0.05) * 100) / 100)) }
      if (e.code === 'ArrowDown') { e.preventDefault(); setVolume(Math.max(0, Math.round((volume - 0.05) * 100) / 100)) }
      if (e.code === 'KeyL') { if (showLyricsRef.current) closeLyricsRef.current(); else setShowLyrics(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [volume])

  // ── Volume drag ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDraggingVolume) return
    const onMove = (e) => {
      if (!volumeBarRef.current) return
      const { left, width } = volumeBarRef.current.getBoundingClientRect()
      const v = Math.round(Math.max(0, Math.min(1, (e.clientX - left) / width)) * 100) / 100
      setLocalVolume(v)
      const active = getActive()
      if (active) active.volume = normalize && song ? getReplayGainVolume(song, v) : v
    }
    const onUp = () => { setIsDraggingVolume(false); setVolume(localVolume); setTimeout(() => setShowVolumeLabel(false), 80) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isDraggingVolume, localVolume, song, normalize])

  // ── Seek drag ─────────────────────────────────────────────────────────────
  const seekDragRef    = useRef(false)
  const seekRafRef     = useRef(null)
  const seekVisualRef  = useRef(null) // the fill div

  useEffect(() => {
    if (!isDraggingSeek) return
    seekDragRef.current = true

    const compute = (e) => {
      if (!seekBarRef.current) return 0
      const { left, width } = seekBarRef.current.getBoundingClientRect()
      return Math.max(0, Math.min(1, (e.clientX - left) / width)) * duration
    }

    const onMove = (e) => {
      // Throttle to one update per animation frame
      if (seekRafRef.current) return
      seekRafRef.current = requestAnimationFrame(() => {
        seekRafRef.current = null
        if (!seekDragRef.current) return
        const t = compute(e)
        // Update visual fill directly — no React re-render
        if (seekVisualRef.current) {
          seekVisualRef.current.style.width = `${duration ? (t / duration) * 100 : 0}%`
        }
        // Keep audio in sync
        const active = getActive()
        if (active) active.currentTime = t
        seekDragRef._lastT = t
      })
    }

    const onUp = (e) => {
      seekDragRef.current = false
      cancelAnimationFrame(seekRafRef.current)
      seekRafRef.current = null
      const t = compute(e)
      setProgress(t)
      const active = getActive()
      if (active) active.currentTime = t
      setIsDraggingSeek(false)
      updateDiscordSeek(t)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cancelAnimationFrame(seekRafRef.current)
      seekRafRef.current = null
    }
  }, [isDraggingSeek, duration])

  const handleSeekClick = (e) => {
    if (!seekBarRef.current) return
    const { left, width } = seekBarRef.current.getBoundingClientRect()
    const t = Math.max(0, Math.min(1, (e.clientX - left) / width)) * duration
    const active = getActive()
    if (active) active.currentTime = t
    setProgress(t)
    updateDiscordSeek(t)
  }

  const handleTimeUpdate = useCallback((e) => {
    if (e.target !== getActive()) return
    const ct  = e.target.currentTime
    const dur = e.target.duration
    if (!isDraggingSeek) setProgress(ct)

    const now = Date.now()
    if (now - lastReportRef.current > 10000) {
      lastReportRef.current = now
      const q = usePlayerStore.getState().queue
      const ci = usePlayerStore.getState().currentIndex
      const s = q[ci]
      if (s) reportPlaybackProgress(sessionRef.current, s, Math.round(ct * 10_000_000), !usePlayerStore.getState().isPlaying)
    }

    // Accumulate actual listening seconds. Deltas > 1.5 s are treated as seeks and ignored
    // so scrubbing doesn't artificially inflate the count.
    const delta = ct - lastCtRef.current
    if (delta > 0 && delta < 1.5) listenedSecsRef.current += delta
    lastCtRef.current = ct

    // 15-second listened threshold for "Recently Played" history
    if (!startReportedRef.current && listenedSecsRef.current >= 15) {
      const q = usePlayerStore.getState().queue
      const ci = usePlayerStore.getState().currentIndex
      const s = q[ci]
      if (s) {
        startReportedRef.current = true
        // FORCE SERVER UPDATE: Report a stop then immediately start again.
        // This 'checkpoints' the play in the server's history so it appears in Recently Played immediately.
        const pos = Math.round(ct * 10_000_000)
        // Try standard session checkpoint
        reportPlaybackStopped(sessionRef.current, s, pos).then(() => {
          reportPlaybackStart(sessionRef.current, s)
        })
        // FALLBACK: Forcefully update the LastPlayedDate via UserData API
        forceUpdateHistoryDate(sessionRef.current, s.Id).then(() => {
          window.dispatchEvent(new CustomEvent('flacr:history-updated'))
        })
      }
    }

    if (crossfadeRef.current > 0) maybeTriggerCrossfade(ct, dur)
  }, [isDraggingSeek, maybeTriggerCrossfade, setProgress])

  const handleLoadedMetadata = useCallback((e) => {
    if (e.target !== getActive()) return
    setDuration(e.target.duration)
  }, [])

  const handleEnded = useCallback((e) => {
    if (e.target !== getActive()) return
    if (cfActiveRef.current) return
    if (cfCompletingRef.current) return
    if (cfTriggeredRef.current !== null) return
    const { sleepTimer, setSleepTimer, queue, currentIndex, repeat } = usePlayerStore.getState()
    if (sleepTimer === 'song') {
      setSleepTimer(null)
      usePlayerStore.getState().setIsPlaying(false)
      return
    }
    const atEnd = currentIndex >= queue.length - 1
    if (atEnd && repeat === 'none') {
      const el = getActive()
      if (el) el.currentTime = 0
      setProgress(0)
      usePlayerStore.getState().setIsPlaying(false)
      return
    }
    const el = getActive()
    const pos = el ? Math.round(el.currentTime * 10_000_000) : 0
    const curSong = queue[currentIndex]
    if (curSong) {
      reportPlaybackStopped(sessionRef.current, curSong, pos)
      // Signal history update
      window.dispatchEvent(new CustomEvent('flacr:history-updated'))
    }

    next()
  }, [next, setProgress])

  // ── onPause handler — never call setIsPlaying(false) during crossfade ─────
  const handlePause = useCallback((e) => {
    // During crossfade the active element gets paused at completion — ignore it
    if (cfActiveRef.current) return
    if (cfCompletingRef.current) return
    if (e.target !== getActive()) return
    setIsPlaying(false)
  }, [setIsPlaying])

  // ── onPlay handler ────────────────────────────────────────────────────────
  const handlePlay = useCallback((e) => {
    if (e.target !== getActive()) return
    audioCtxRef.current?.resume().catch(() => {})
    setIsPlaying(true)
  }, [setIsPlaying])

  const progressPct  = duration ? (progress / duration) * 100 : 0
  const volumePct    = Math.round(localVolume * 100)
  const repeatColor  = repeat !== 'none' ? 'var(--accent)' : '#555'
  const shuffleColor = shuffle ? 'var(--accent)' : '#555'
  const showKnob     = showVolumeLabel || isDraggingVolume

  const audioProps = (ref) => ({
    ref,
    onTimeUpdate:     handleTimeUpdate,
    onLoadedMetadata: handleLoadedMetadata,
    onEnded:          handleEnded,
    onPlay:           handlePlay,
    onPause:          handlePause,
  })

  // Ensure audio elements are always in the DOM so AudioContext can wire them up once on mount.
  return (
    <>
      <audio {...audioProps(audioA)} />
      <audio {...audioProps(audioB)} />

      <div style={{
        height: barOpen ? '96px' : '0',
        flexShrink: 0, overflow: 'hidden',
        transition: 'height 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}>
      {displaySong && (
        <div style={{
          height: '96px', flexShrink: 0,
          background: 'rgba(8,8,8,1)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
          padding: '0 20px', gap: '16px',
          userSelect: 'none', position:'relative', zIndex:1,
        }}>

          {/* Track info — click to open Full Screen Player */}
          <div
            onClick={onOpenNowPlaying}
            style={{ display:'flex', alignItems:'center', gap:'12px', minWidth:0, maxWidth:'260px',
              cursor: onOpenNowPlaying ? 'pointer' : 'default',
              borderRadius:'10px', padding:'4px 6px', margin:'-4px -6px',
              transition:'background 0.15s ease',
            }}
            onMouseEnter={e=>{ if(onOpenNowPlaying) e.currentTarget.style.background='rgba(255,255,255,0.04)' }}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            title="Full Screen Player (F)"
          >
            <div style={{ position:'relative', flexShrink:0 }}>
              {(displaySong.ImageTags?.Primary || displaySong.AlbumId)
                ? <img src={imgUrl(session, displaySong.ImageTags?.Primary ? displaySong.Id : displaySong.AlbumId, 60)} alt=""
                    style={{ width:46, height:46, borderRadius:'10px', objectFit:'cover', display:'block',
                      boxShadow: isPlaying ? '0 0 10px var(--accent-glow)' : '0 2px 8px rgba(0,0,0,0.4)',
                      transition:'box-shadow 0.5s ease',
                    }}/>
                : <div style={{ width:46, height:46, borderRadius:'10px', background:'var(--accent-dim)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem' }}>♪</div>
              }
            </div>
            <div style={{ minWidth:0, flex:1 }}>
              {(displaySong.Name && displaySong.Name.length > 22)
                ? <div className="ticker-wrap" style={{ fontSize:'0.97rem', fontWeight:600, color:'#f0f0f0' }}>
                    <span className="ticker-inner">{displaySong.Name}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{displaySong.Name}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                  </div>
                : <div style={{ fontSize:'0.97rem', fontWeight:600, color:'#f0f0f0', letterSpacing:'-0.1px',
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displaySong.Name}</div>
              }
              {(displaySong.AlbumArtist||'').length > 28
                ? <div className="ticker-wrap" style={{ fontSize:'0.81rem', color:'#666', marginTop:'2px' }}>
                    <span className="ticker-inner">{displaySong.AlbumArtist}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{displaySong.AlbumArtist}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                  </div>
                : <div style={{ fontSize:'0.81rem', color:'#666', marginTop:'2px',
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displaySong.AlbumArtist || '—'}</div>
              }
            </div>
          </div>

          {/* Controls + seek */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'7px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>

              {/* Mic / Lyrics */}
              <button onClick={() => setShowLyrics(p => !p)} title="Lyrics"
                style={{...iconBtn, color: showLyrics?'var(--accent)':'#666', marginRight:'138px'}}
                onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
                onMouseLeave={e=>{ e.currentTarget.style.color=showLyrics?'var(--accent)':'#666'; e.currentTarget.style.transform='scale(1)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" strokeWidth="1.8"/>
                  <circle cx="7" cy="18" r="3" fill="currentColor" stroke="none"/>
                  <circle cx="19" cy="16" r="3" fill="currentColor" stroke="none"/>
                  <line x1="1" y1="8" x2="5" y2="8" strokeWidth="1.6"/>
                  <line x1="1" y1="12" x2="5" y2="12" strokeWidth="1.6"/>
                  <line x1="1" y1="16" x2="2" y2="16" strokeWidth="1.6"/>
                </svg>
              </button>

              <button onClick={toggleShuffle} style={{...iconBtn, color:shuffleColor}}
                onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
                onMouseLeave={e=>{ e.currentTarget.style.color=shuffleColor; e.currentTarget.style.transform='scale(1)' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                  <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                  <line x1="4" y1="4" x2="9" y2="9"/>
                </svg>
              </button>

              <button onClick={prev} style={iconBtn} disabled={!song}
                onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
                onMouseLeave={e=>{ e.currentTarget.style.color='#666'; e.currentTarget.style.transform='scale(1)' }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="19 20 9 12 19 4 19 20"/>
                  <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </button>

              <button onClick={togglePlay} disabled={!song} style={{
                width:'44px', height:'44px', borderRadius:'50%',
                background: song ? 'var(--accent)' : 'rgba(255,255,255,0.08)', border:'none',
                cursor: song ? 'pointer' : 'default',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'var(--accent-fg)', flexShrink:0, margin:'0 4px',
                transition:'background 0.2s ease, transform 0.15s ease, box-shadow 0.4s ease',
                boxShadow: isPlaying && song ? '0 0 10px var(--accent-glow), 0 4px 14px rgba(0,0,0,0.5)' : '0 4px 14px rgba(0,0,0,0.4)',
              }}
                onMouseEnter={e=>{ if(song){ e.currentTarget.style.background='var(--accent-hover)'; e.currentTarget.style.transform='scale(1.08)' } }}
                onMouseLeave={e=>{ if(song){ e.currentTarget.style.background='var(--accent)'; e.currentTarget.style.transform='scale(1)' } }}
                onMouseDown={e=>{ if(song) e.currentTarget.style.transform='scale(0.93)' }}
                onMouseUp={e=>{ if(song) e.currentTarget.style.transform='scale(1)' }}
              >
                {isPlaying
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft:2 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                }
              </button>

              <button onClick={next} style={iconBtn} disabled={!song}
                onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
                onMouseLeave={e=>{ e.currentTarget.style.color='#666'; e.currentTarget.style.transform='scale(1)' }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 4 15 12 5 20 5 4"/>
                  <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </button>

              <button onClick={cycleRepeat} style={{...iconBtn, color:repeatColor, position:'relative'}}
                onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
                onMouseLeave={e=>{ e.currentTarget.style.color=repeatColor; e.currentTarget.style.transform='scale(1)' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
                {repeat === 'one' && (
                  <span style={{ position:'absolute', top:-3, right:-3, fontSize:'0.58rem',
                    background:'var(--accent)', color:'var(--accent-fg)', borderRadius:'50%', width:13, height:13,
                    display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>1</span>
                )}
              </button>

              {/* Queue */}
              {onToggleQueue && (
                <button onClick={onToggleQueue} title="Queue (Q)"
                  style={{...iconBtn, color: showQueue?'var(--accent)':'#666', marginLeft:'138px'}}
                  onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
                  onMouseLeave={e=>{ e.currentTarget.style.color=showQueue?'var(--accent)':'#666'; e.currentTarget.style.transform='scale(1)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="15" y2="18"/>
                    <polygon points="17 15 23 18 17 21" fill="currentColor" stroke="none"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Seek bar */}
            <div style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', maxWidth:'540px' }}>
              <span style={{ fontSize:'0.97rem', color:'#555', width:'32px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{formatSeconds(progress)}</span>
              <div ref={seekBarRef}
                onMouseDown={e=>{ if(song){ setIsDraggingSeek(true); handleSeekClick(e) }}}
                onClick={e=>{ if(song) handleSeekClick(e) }}
                onMouseEnter={e=>{ const t = e.currentTarget.querySelector('.seek-thumb'); if(t) t.style.opacity='1' }}
                onMouseLeave={e=>{ if(!isDraggingSeek) { const t = e.currentTarget.querySelector('.seek-thumb'); if(t) t.style.opacity='0' }}}
                style={{ flex:1, height:'3px', background:'rgba(255,255,255,0.08)', borderRadius:'99px',
                  cursor: song ? 'pointer' : 'default', position:'relative' }}
              >
                <div ref={seekVisualRef} style={{ width:`${progressPct}%`, height:'100%', background:'var(--accent)', borderRadius:'99px',
                  transition: isDraggingSeek ? 'none' : 'width 0.1s linear', position:'relative' }}>
                  <div className="seek-thumb" style={{ position:'absolute', right:-5, top:'50%', transform:'translateY(-50%)',
                    width:11, height:11, borderRadius:'50%', background:'#fff',
                    boxShadow:'0 0 6px rgba(0,0,0,0.5)',
                    opacity: isDraggingSeek ? 1 : 0, transition:'opacity 0.12s' }}/>
                </div>
              </div>
              <span style={{ fontSize:'0.97rem', color:'#555', width:'32px', fontVariantNumeric:'tabular-nums' }}>{formatSeconds(duration)}</span>
            </div>
          </div>

          {/* Volume */}
          <div style={{ display:'flex', alignItems:'center', gap:'8px', justifyContent:'flex-end' }}>
            <VolumeIcon volume={localVolume}/>
            <div style={{ width:'120px', flexShrink:0, position:'relative' }}>
              <div ref={volumeBarRef}
                onMouseDown={e=>{
                  setIsDraggingVolume(true); setShowVolumeLabel(true)
                  const { left, width } = volumeBarRef.current.getBoundingClientRect()
                  const v = Math.round(Math.max(0, Math.min(1, (e.clientX - left) / width)) * 100) / 100
                  setLocalVolume(v)
                  const active = getActive()
                  if (active) active.volume = normalize && song ? getReplayGainVolume(song, v) : v
                }}
                onMouseEnter={()=>setShowVolumeLabel(true)}
                onMouseLeave={()=>{ if(!isDraggingVolume) setShowVolumeLabel(false) }}
                style={{ height:'3px', background:'rgba(255,255,255,0.08)', borderRadius:'99px', cursor:'pointer', position:'relative' }}
              >
                <div style={{ width:`${volumePct}%`, height:'100%', background:'var(--accent)', borderRadius:'99px', position:'relative' }}>
                  <div style={{ position:'absolute', right:-5, top:'50%', transform:'translateY(-50%)',
                    width:11, height:11, borderRadius:'50%', background:'#fff',
                    boxShadow:'0 0 6px rgba(0,0,0,0.5)',
                    opacity: showKnob ? 1 : 0, transition:'opacity 0.12s' }}>
                    {showKnob && (
                      <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)',
                        background:'rgba(0,0,0,0.9)', color:'#fff', fontSize:'0.97rem', fontWeight:600,
                        padding:'2px 6px', borderRadius:'6px', whiteSpace:'nowrap', pointerEvents:'none' }}>
                        {volumePct}%
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {(showLyrics || lyricsExiting) && song && (
        <LyricsOverlay
          session={session}
          song={song}
          forceExit={lyricsExiting}
          onClose={closeLyrics}
        />
      )}
    </>
  )
}

export default Player
