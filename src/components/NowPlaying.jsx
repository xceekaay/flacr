import { useRef, useState, useEffect } from 'react'
import usePlayerStore, { useProgressStore } from '../store/playerStore'
import { imgUrl, fetchLyrics } from '../utils/api'
import { formatSeconds } from '../utils/format'
import { ItemImage } from './ui'
import { QueuePanel } from './QueuePanel'

export function QueueIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="15" y2="18"/>
      <polygon points="17 15 23 18 17 21" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function rafSmoothScroll(el, target, duration = 600) {
  const start = el.scrollTop
  const diff  = target - start
  if (Math.abs(diff) < 1) return
  const t0 = performance.now()
  const ease = (t) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2
  const step = (now) => {
    const p = Math.min((now - t0) / duration, 1)
    el.scrollTop = start + diff * ease(p)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export function NowPlayingOverlay({ session, onClose, forceExit = false }) {
  const { queue, currentIndex, isPlaying, shuffle, repeat, volume,
    togglePlay, toggleShuffle, cycleRepeat, next, prev, setVolume, playSong } = usePlayerStore()
  const { progress, duration, setProgress } = useProgressStore()
  const song = queue[currentIndex] || null
  const prevSongIdRef = useRef(null)
  const [artKey, setArtKey] = useState(0)
  const [displayedArtSrc, setDisplayedArtSrc] = useState(null)
  const [displayedBgSrc, setDisplayedBgSrc] = useState(null)
  useEffect(() => {
    if (!song?.Id) return
    if (song.Id !== prevSongIdRef.current) {
      prevSongIdRef.current = song.Id
      setArtKey(k => k + 1)
    }
    const imageId = song.ImageTags?.Primary ? song.Id : (song.AlbumId || null)
    if (!imageId) { setDisplayedArtSrc(null); setDisplayedBgSrc(null); return }
    const artSrc = imgUrl(session, imageId, 400)
    const bgSrc  = imgUrl(session, imageId, 600)
    if (artSrc === displayedArtSrc) return
    const img = new window.Image()
    img.onload = () => { setDisplayedArtSrc(artSrc); setDisplayedBgSrc(bgSrc) }
    img.src = artSrc
  }, [song?.Id, song?.ImageTags?.Primary, song?.AlbumId])


  const seekBarRef         = useRef(null)
  const volumeBarRef       = useRef(null)
  const volumeContainerRef = useRef(null)
  const showQueueRef       = useRef(false)
  const isDraggingRef   = useRef(false)
  const latestVolumeRef = useRef(volume)  // tracks current drag value without stale closure

  const [isDraggingSeek,   setIsDraggingSeek]   = useState(false)
  const [isDraggingVolume, setIsDraggingVolume] = useState(false)
  const [isHoveringSeek,   setIsHoveringSeek]   = useState(false)
  const [showVolumePopup,  setShowVolumePopup]  = useState(false)
  const [volumePopExiting, setVolumePopExiting] = useState(false)
  const hideVolumePopup = () => {
    setVolumePopExiting(true)
    setTimeout(() => { setShowVolumePopup(false); setVolumePopExiting(false) }, 160)
  }
  const [showQueue,        setShowQueue]        = useState(false)
  const [queueVisible,     setQueueVisible]     = useState(false)
  const [queueWidth, setQueueWidth] = useState(() => {
    try { const w = parseInt(localStorage.getItem('flacr:npQueueWidth'), 10); return w >= 220 && w <= 500 ? w : 300 } catch { return 300 }
  })
  const queueDragRef = useRef(null)
  const closeQueueRef = useRef(null)
  const closeQueueFn = (...args) => closeQueueRef.current?.(...args)
  const toggleQueueRef = useRef(null)
  const toggleQueueFn = (...args) => toggleQueueRef.current?.(...args)
  const [isExiting, setIsExiting] = useState(false)

  const [showLyrics,    setShowLyrics]    = useState(false)
  const [lyricsExiting, setLyricsExiting] = useState(false)
  const [lyricsData,    setLyricsData]    = useState(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [lyricsError,   setLyricsError]   = useState(null)
  const [lyricsFollowing,    setLyricsFollowing]    = useState(true)
  const lyricsFollowingRef    = useRef(true)
  const lyricsActiveLineRef   = useRef(null)
  const lyricsSectionRef      = useRef(null)
  const lyricsProgrammaticRef = useRef(false)
  const lyricsActiveIndexRef  = useRef(-1)
  const handleLyricsBtnRef    = useRef(null)
  const outerScrollRef        = useRef(null)

  // Respond to external close (from Library's closeNowPlaying)
  useEffect(() => { if (forceExit) setIsExiting(true) }, [forceExit])

  // Reset lyrics data when song changes — keep panel open if already open
  useEffect(() => {
    setLyricsData(null)
    setLyricsLoading(false); setLyricsError(null)
    setLyricsFollowing(true); lyricsFollowingRef.current = true
    lyricsActiveIndexRef.current = -1
  }, [song?.Id])

  // Fetch lyrics when section opens
  useEffect(() => {
    if (!showLyrics || !song) return
    let active = true
    setLyricsLoading(true); setLyricsError(null); setLyricsData(null)
    fetchLyrics(session, song.Id).then(data => {
      if (!active) return
      setLyricsLoading(false)
      if (!data || (!data.Lyrics && !data.Text)) { setLyricsError('No lyrics found for this track.'); return }
      const offsetTicks = (data.Metadata?.Offset ?? 0) * 10000
      const applyOffset = (lines) => offsetTicks === 0 ? lines : lines.map(l => ({ ...l, Start: l.Start + offsetTicks }))
      const normalise = (lines) => {
        const adj = applyOffset(lines)
        return adj.some(l => l.Start > 0) ? adj : adj.map(l => l.Text).join('\n')
      }
      if (Array.isArray(data.Lyrics) && data.Lyrics.length > 0) setLyricsData(normalise(data.Lyrics))
      else if (data.Lyrics && Array.isArray(data.Lyrics.Lyrics)) setLyricsData(normalise(data.Lyrics.Lyrics))
      else if (typeof data.Lyrics === 'string') setLyricsData(data.Lyrics)
      else if (typeof data.Text === 'string') setLyricsData(data.Text)
      else setLyricsError('No lyrics found for this track.')
    }).catch(() => { if (!active) return; setLyricsLoading(false); setLyricsError('Failed to load lyrics.') })
    return () => { active = false }
  }, [showLyrics, song?.Id])

  // Compute active lyric index here (before the useEffect that depends on it)
  const ticksToSec = (t) => (t || 0) / 10_000_000
  const isLyricsSync = Array.isArray(lyricsData)
  let lyricsActiveIndex = -1
  if (isLyricsSync) {
    for (let i = 0; i < lyricsData.length; i++) {
      if (progress >= ticksToSec(lyricsData[i].Start)) lyricsActiveIndex = i
      else break
    }
  }

  // Scroll only when active line crosses the bottom threshold — no constant re-centering
  useEffect(() => {
    if (!lyricsFollowingRef.current || !lyricsActiveLineRef.current || !outerScrollRef.current) return
    if (lyricsActiveIndex === lyricsActiveIndexRef.current) return
    lyricsActiveIndexRef.current = lyricsActiveIndex

    const el        = lyricsActiveLineRef.current
    const container = outerScrollRef.current
    const cRect     = container.getBoundingClientRect()
    const eRect     = el.getBoundingClientRect()

    // Only scroll when the active line is in the bottom 45% of the visible area
    if (cRect.bottom - eRect.bottom < cRect.height * 0.45) {
      lyricsProgrammaticRef.current = true
      const target = Math.max(0, container.scrollTop + (eRect.top - cRect.top) - cRect.height * 0.1)
      rafSmoothScroll(container, target, 600)
      setTimeout(() => { lyricsProgrammaticRef.current = false }, 900)
    }
  }, [lyricsActiveIndex, lyricsData])

  const [localVolume,      setLocalVolume]      = useState(volume)
  const [prevVolume,       setPrevVolume]       = useState(volume > 0 ? volume : 0.7)
  const isMuted = localVolume === 0

  // Only sync localVolume from store when NOT dragging
  useEffect(() => {
    if (!isDraggingRef.current) setLocalVolume(volume)
  }, [volume])

  // Q / L / Escape shortcuts — capture phase beats Library's bubbling handler
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName.toLowerCase() === 'input') return
      if (e.key === 'q' || e.key === 'Q') {
        e.stopPropagation()
        toggleQueueFn()
      }
      if (e.key === 'l' || e.key === 'L') {
        e.stopPropagation()
        handleLyricsBtnRef.current?.()
      }
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (showQueueRef.current) closeQueueFn()
        else { setIsExiting(true); setTimeout(onClose, 300) }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  if (!song) return null

  const closeLyrics = () => {
    setLyricsExiting(true)
    rafSmoothScroll(outerScrollRef.current, 0, 400)
    setTimeout(() => { setShowLyrics(false); setLyricsExiting(false) }, 320)
  }

  const handleLyricsBtn = () => {
    if (showLyrics) {
      closeLyrics()
    } else {
      setShowLyrics(true)
      setLyricsFollowing(true); lyricsFollowingRef.current = true
      lyricsActiveIndexRef.current = -1
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const section   = lyricsSectionRef.current
        const container = outerScrollRef.current
        if (!section || !container) return
        const target = container.scrollTop + section.getBoundingClientRect().top - container.getBoundingClientRect().top
        rafSmoothScroll(container, target, 600)
      }))
    }
  }
  handleLyricsBtnRef.current = handleLyricsBtn

  const progressPct = duration ? (progress / duration) * 100 : 0
  const volumePct   = Math.round(localVolume * 100)
  const repeatColor  = repeat !== 'none' ? 'var(--accent)' : 'rgba(255,255,255,0.35)'
  const shuffleColor = shuffle ? 'var(--accent)' : 'rgba(255,255,255,0.35)'
  const showSeekThumb = isDraggingSeek || isHoveringSeek

  const toggleMute = () => {
    if (isMuted) {
      const v = prevVolume > 0 ? prevVolume : 0.7
      setLocalVolume(v); setVolume(v)
      window.dispatchEvent(new CustomEvent('flacr:volume', { detail: v }))
    } else {
      setPrevVolume(localVolume > 0 ? localVolume : 0.7)
      setLocalVolume(0); setVolume(0)
      window.dispatchEvent(new CustomEvent('flacr:volume', { detail: 0 }))
    }
  }

  const seekTo = (e) => {
    if (!seekBarRef.current || !duration) return
    const { left, width } = seekBarRef.current.getBoundingClientRect()
    const t = Math.max(0, Math.min(1, (e.clientX - left) / width)) * duration
    setProgress(t)
    window.dispatchEvent(new CustomEvent('flacr:seek', { detail: t }))
  }
  const handleSeekDown = (e) => {
    setIsDraggingSeek(true); seekTo(e)
    const onMove = (ev) => seekTo(ev)
    const onUp = () => { setIsDraggingSeek(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  // Vertical slider: top of track = 100%, bottom = 0%
  const applyVolume = (e) => {
    if (!volumeBarRef.current) return
    const { top, height } = volumeBarRef.current.getBoundingClientRect()
    const ratio = 1 - Math.max(0, Math.min(1, (e.clientY - top) / height))
    const v = Math.round(ratio * 100) / 100
    latestVolumeRef.current = v   // always fresh — no stale closure
    setLocalVolume(v)
    window.dispatchEvent(new CustomEvent('flacr:volume', { detail: v }))
  }
  const handleVolumeDown = (e) => {
    e.preventDefault()
    isDraggingRef.current = true
    setIsDraggingVolume(true)
    applyVolume(e)
    const onMove = (ev) => { ev.preventDefault(); applyVolume(ev) }
    const onUp = (ev) => {
      isDraggingRef.current = false
      setIsDraggingVolume(false)
      setVolume(latestVolumeRef.current)
      // Hide popup only if mouse released outside the volume area
      // (check the actual element under cursor, not just the wrapper rect)
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const insideVolume = volumeContainerRef.current?.contains(el)
      if (!insideVolume) hideVolumePopup()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const iconBtn = {
    background:'transparent', border:'none', cursor:'pointer',
    color:'rgba(255,255,255,0.45)', display:'flex', alignItems:'center',
    justifyContent:'center', padding:'8px', borderRadius:'8px', transition:'color 0.15s',
  }

  const VolumeIcon = () => {
    const col = isMuted ? '#ef4444' : 'rgba(255,255,255,0.45)'
    if (isMuted || localVolume === 0) return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
    )
    if (localVolume < 0.5) return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    )
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    )
  }

  const closeQueue = () => {
    setQueueVisible(false)
    setTimeout(() => { showQueueRef.current = false; setShowQueue(false) }, 240)
  }
  closeQueueRef.current = closeQueue
  const toggleQueue = () => {
    if (showQueueRef.current) closeQueue()
    else { 
      showQueueRef.current = true; 
      setShowQueue(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setQueueVisible(true)))
    }
  }
  toggleQueueRef.current = toggleQueue
  const startDragQueue = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = queueWidth
    const onMove = (ev) => setQueueWidth(Math.max(220, Math.min(500, startW - (ev.clientX - startX))))
    const onUp   = (ev) => {
      const final = Math.max(220, Math.min(500, startW - (ev.clientX - startX)))
      try { localStorage.setItem('flacr:npQueueWidth', final) } catch {}
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:500,
      background:'linear-gradient(145deg, #080810 0%, #080808 60%, #06060e 100%)',
      display:'flex', overflow:'hidden',
      animation: isExiting ? 'slideOutOverlay 0.3s cubic-bezier(0.4,0,1,1) forwards' : 'slideInOverlay 0.32s cubic-bezier(0,0,0.2,1) both',
    }}>
      {/* Blurred album art background */}
      {displayedBgSrc && (
        <div style={{
          position:'absolute', inset:0, zIndex:0,
          backgroundImage:`url(${displayedBgSrc})`,
          backgroundSize:'cover', backgroundPosition:'center',
          filter:'blur(100px) saturate(0.5)', opacity:0.3,
        }}/>
      )}

      {/* Main content */}
      <div ref={outerScrollRef} style={{ flex:1, position:'relative', zIndex:1, display:'flex', flexDirection:'column',
        minWidth:0, overflowY:'auto' }}
        onWheel={() => { if (!lyricsProgrammaticRef.current && lyricsFollowingRef.current) { setLyricsFollowing(false); lyricsFollowingRef.current = false } }}
      >
        <div style={{ minHeight:'100%', display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', padding:'32px 0' }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
          gap:'28px', maxWidth:500, width:'90%' }}>

          {/* Album art — stable src until preloaded, animates on song change */}
          {displayedArtSrc
            ? <img key={artKey} src={displayedArtSrc} alt=""
                style={{ width:280, height:280, borderRadius:'20px', objectFit:'cover',
                  boxShadow:'0 40px 100px rgba(0,0,0,0.9), 0 0 60px var(--accent-glow)',
                  animation:'artChange 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}/>
            : <div key={artKey} style={{ width:260, height:260, borderRadius:'16px',
                background:'var(--accent-dim)', display:'flex',
                alignItems:'center', justifyContent:'center', fontSize:'5rem',
                animation:'artChange 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}>♪</div>
          }

          {/* Song info */}
          <div key={`info-${artKey}`} style={{ textAlign:'center', width:'100%',
            animation:'fadeUp 0.3s ease both' }}>
            <div style={{ fontSize:'1.55rem', fontWeight:800, color:'#fff', marginBottom:'5px',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{song.Name}</div>
            <div style={{ fontSize:'1.06rem', color:'rgba(255,255,255,0.5)' }}>{song.AlbumArtist||'—'}</div>
            {song.Album && <div style={{ fontSize:'0.97rem', color:'rgba(255,255,255,0.3)', marginTop:'3px' }}>{song.Album}</div>}
          </div>

          {/* Seek bar */}
          <div style={{ width:'100%' }}>
            <div ref={seekBarRef}
              onMouseDown={handleSeekDown}
              onMouseEnter={()=>setIsHoveringSeek(true)}
              onMouseLeave={()=>setIsHoveringSeek(false)}
              style={{ height:4, background:'rgba(255,255,255,0.1)', borderRadius:'99px',
                position:'relative', cursor:'pointer' }}
            >
              <div style={{ width:`${progressPct}%`, height:'100%', background:'var(--accent)',
                borderRadius:'99px', position:'relative' }}>
                <div style={{
                  position:'absolute', right:-7, top:'50%', transform:'translateY(-50%)',
                  width:14, height:14, borderRadius:'50%', background:'#fff',
                  boxShadow:'0 0 6px rgba(0,0,0,0.4)',
                  opacity: showSeekThumb ? 1 : 0, transition:'opacity 0.15s',
                }}/>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:'6px',
              fontSize:'0.81rem', color:'rgba(255,255,255,0.3)' }}>
              <span>{formatSeconds(progress)}</span>
              <span>{formatSeconds(duration)}</span>
            </div>
          </div>

          {/* Controls row */}
          <div style={{ display:'flex', alignItems:'center', gap:'2px', width:'100%' }}>

            {/* Volume — wrapper covers button + popup so no gap */}
            <div
              ref={volumeContainerRef}
              style={{ position:'relative' }}
              onMouseEnter={()=>setShowVolumePopup(true)}
              onMouseLeave={(e)=>{
                if (volumeContainerRef.current?.contains(e.relatedTarget)) return
                if(!isDraggingVolume) hideVolumePopup()
              }}
            >
              <button onClick={toggleMute}
                style={{...iconBtn, color: isMuted ? '#ef4444' : 'rgba(255,255,255,0.45)'}}
                onMouseEnter={e=>e.currentTarget.style.color= isMuted ? '#f87171' : '#fff'}
                onMouseLeave={e=>e.currentTarget.style.color= isMuted ? '#ef4444' : 'rgba(255,255,255,0.45)'}
              >
                <VolumeIcon/>
              </button>

              {/* Popup sits flush against button — animated */}
              {(showVolumePopup || isDraggingVolume || volumePopExiting) && (
                <div style={{
                  position:'absolute', bottom:'100%', left:'50%', transform:'translateX(-50%)',
                  paddingBottom:4,
                  animation: volumePopExiting
                    ? 'volumePopOut 0.16s ease forwards'
                    : 'volumePopIn 0.18s cubic-bezier(0.34,1.56,0.64,1) both',
                }}>
                  <div style={{
                    background:'rgba(18,18,18,1)', borderRadius:'12px',
                    padding:'10px 10px 8px',
                    border:'1px solid rgba(255,255,255,0.09)',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:'8px',
                    boxShadow:'0 12px 40px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.04)', width:36,
                  }}>
                    <span style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.4)', lineHeight:1 }}>{volumePct}%</span>
                    {/* Vertical slider track */}
                    <div
                      ref={volumeBarRef}
                      onMouseDown={handleVolumeDown}
                      style={{ width:4, height:80, background:'rgba(255,255,255,0.15)',
                        borderRadius:'99px', cursor:'pointer', position:'relative',
                        userSelect:'none' }}
                    >
                      {/* Fill from bottom */}
                      <div style={{
                        position:'absolute', bottom:0, left:0, right:0,
                        height:`${volumePct}%`,
                        background:'var(--accent)',
                        borderRadius:'99px',
                      }}>
                        <div style={{
                          position:'absolute', top:-5, left:'50%', transform:'translateX(-50%)',
                          width:10, height:10, borderRadius:'50%', background:'#fff',
                          boxShadow:'0 0 4px rgba(0,0,0,0.5)',
                          pointerEvents:'none',
                        }}/>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex:1 }}/>

            {/* Shuffle */}
            <button style={{...iconBtn, color:shuffleColor}} onClick={toggleShuffle}
              onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
              onMouseLeave={e=>{ e.currentTarget.style.color=shuffleColor; e.currentTarget.style.transform='scale(1)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                <line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
            </button>

            {/* Prev */}
            <button style={iconBtn} onClick={prev}
              onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
              onMouseLeave={e=>{ e.currentTarget.style.color='rgba(255,255,255,0.45)'; e.currentTarget.style.transform='scale(1)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="19 20 9 12 19 4 19 20"/>
                <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>

            {/* Play/Pause */}
            <button onClick={togglePlay} style={{
              width:60, height:60, borderRadius:'50%', background:'var(--accent)',
              border:'none', cursor:'pointer', display:'flex', alignItems:'center',
              justifyContent:'center', color:'#fff',
              transition:'background 0.15s, transform 0.1s',
              boxShadow:'0 0 28px var(--accent-glow), 0 0 0 0 transparent', margin:'0 4px',
            }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--accent-hover)'}
              onMouseLeave={e=>e.currentTarget.style.background='var(--accent)'}
              onMouseDown={e=>e.currentTarget.style.transform='scale(0.94)'}
              onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
            >
              {isPlaying
                ? <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              }
            </button>

            {/* Next */}
            <button style={iconBtn} onClick={next}
              onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
              onMouseLeave={e=>{ e.currentTarget.style.color='rgba(255,255,255,0.45)'; e.currentTarget.style.transform='scale(1)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 4 15 12 5 20 5 4"/>
                <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>

            {/* Repeat */}
            <button style={{...iconBtn, color:repeatColor, position:'relative'}} onClick={cycleRepeat}
              onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
              onMouseLeave={e=>{ e.currentTarget.style.color=repeatColor; e.currentTarget.style.transform='scale(1)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              {repeat === 'one' && (
                <span style={{ position:'absolute', top:-2, right:-2, fontSize:'0.5rem',
                  background:'var(--accent)', color:'#fff', borderRadius:'50%', width:13, height:13,
                  display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>1</span>
              )}
            </button>

            <div style={{ flex:1 }}/>

            {/* Queue */}
            <button onClick={toggleQueue} style={{
              ...iconBtn,
              color: queueVisible ? 'var(--accent)' : 'rgba(255,255,255,0.45)'
            }}
              onMouseEnter={e=>{ e.currentTarget.style.color='#fff'; e.currentTarget.style.transform='scale(1.12)' }}
              onMouseLeave={e=>{ e.currentTarget.style.color=queueVisible?'var(--accent)':'rgba(255,255,255,0.45)'; e.currentTarget.style.transform='scale(1)' }}
            >
              <QueueIcon size={20}/>
            </button>
          </div>

          {/* Lyrics button */}
          <button onClick={handleLyricsBtn} style={{
            display:'flex', alignItems:'center', gap:'6px',
            background:'none', border:'none', cursor:'pointer',
            color: showLyrics ? 'var(--accent)' : 'rgba(255,255,255,0.3)',
            fontSize:'0.82rem', fontWeight:600, letterSpacing:'0.5px',
            padding:'4px 10px', borderRadius:'8px',
            transition:'color 0.2s',
          }}
            onMouseEnter={e=>e.currentTarget.style.color='#fff'}
            onMouseLeave={e=>e.currentTarget.style.color=showLyrics?'var(--accent)':'rgba(255,255,255,0.3)'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" strokeWidth="1.8"/>
              <circle cx="6" cy="18" r="3" fill="currentColor" stroke="none"/>
              <circle cx="18" cy="16" r="3" fill="currentColor" stroke="none"/>
            </svg>
            Lyrics
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ transition:'transform 0.25s', transform: showLyrics ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
        </div>

        {/* Lyrics section — scrolled into view below player */}
        {(showLyrics || lyricsExiting) && (
          <div ref={lyricsSectionRef} style={{
            minHeight:'100vh', padding:'60px 10% 40vh',
            display:'flex', flexDirection:'column', alignItems:'center',
            borderTop:'1px solid rgba(255,255,255,0.06)',
            animation: lyricsExiting ? 'fadeDown 0.3s ease forwards' : 'fadeUp 0.3s ease both',
          }}>
            <div style={{ fontSize:'0.72rem', fontWeight:700, color:'rgba(255,255,255,0.25)',
              textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:'40px' }}>Lyrics</div>

            {lyricsLoading && <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'1.1rem' }}>Loading lyrics…</div>}
            {lyricsError   && <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'1.1rem' }}>{lyricsError}</div>}

            {!lyricsLoading && !lyricsError && isLyricsSync && lyricsData.map((line, i) => {
              const isActive = i === lyricsActiveIndex
              const isPassed = i < lyricsActiveIndex
              return (
                <div key={i}
                  ref={isActive ? lyricsActiveLineRef : null}
                  onClick={() => window.dispatchEvent(new CustomEvent('flacr:seek', { detail: ticksToSec(line.Start) }))}
                  style={{
                    fontSize:'1.9rem', fontWeight: 600,
                    color: isActive ? 'var(--accent)' : '#fff',
                    opacity: isActive ? 1 : isPassed ? 0.22 : 0.65,
                    transform: isActive ? 'scale(1.06)' : 'scale(1)',
                    textShadow: isActive ? '0 0 24px var(--accent-glow)' : '0 0 0px transparent',
                    textAlign:'center', margin:'14px 0', maxWidth:'720px',
                    lineHeight:1.4, cursor:'pointer',
                    transition:'color 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.34,1.2,0.64,1), text-shadow 0.4s ease',
                  }}
                >{line.Text}</div>
              )
            })}

            {!lyricsLoading && !lyricsError && !isLyricsSync && typeof lyricsData === 'string' && (
              <div style={{ fontSize:'1.35rem', lineHeight:1.9, color:'rgba(255,255,255,0.75)',
                textAlign:'center', maxWidth:'680px', whiteSpace:'pre-wrap' }}>{lyricsData}</div>
            )}

            {!lyricsFollowing && isLyricsSync && (
              <button onClick={() => { setLyricsFollowing(true); lyricsFollowingRef.current = true }} style={{
                position:'sticky', bottom:'40px', alignSelf:'center', marginTop:'24px',
                background:'var(--accent)', border:'none', color:'var(--accent-fg)',
                padding:'10px 22px', borderRadius:'99px', fontSize:'0.92rem', fontWeight:600,
                cursor:'pointer', boxShadow:'0 4px 16px rgba(0,0,0,0.5)',
                transition:'transform 0.15s', animation:'fadeIn 0.2s ease',
              }}
                onMouseEnter={e=>e.currentTarget.style.transform='scale(1.05)'}
                onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
              >Follow Lyrics</button>
            )}
          </div>
        )}
      </div>

      {/* Queue panel — animated, resizable */}
      {showQueue && (
        <div style={{
          display: 'flex', flexShrink: 0, overflow: 'hidden', zIndex: 2,
          width: queueVisible ? queueWidth + 4 : 0,
          transition: `width 0.24s cubic-bezier(0,0,0.2,1)`,
        }}>
          <div style={{
            display: 'flex', flex: 1, minWidth: queueWidth + 4,
            transform: queueVisible ? 'translateX(0)' : 'translateX(100%)',
            transition: `transform 0.24s cubic-bezier(0,0,0.2,1)`,
          }}>
            {/* Drag handle */}
            <div onMouseDown={startDragQueue} style={{
              width:4, cursor:'col-resize', flexShrink:0, alignSelf:'stretch',
              background:'transparent', transition:'background 0.15s',
            }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--accent-glow)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            />
            <QueuePanel session={session} onClose={closeQueue} width={queueWidth}/>
          </div>
        </div>
      )}

    </div>
  )
}
