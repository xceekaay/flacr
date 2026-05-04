import { useEffect, useRef, useState } from 'react'
import { fetchLyrics } from '../utils/api'
import { useProgressStore } from '../store/playerStore'

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

export function LyricsOverlay({ session, song, onClose, forceExit = false }) {
  const [isExiting, setIsExiting] = useState(false)
  useEffect(() => { if (forceExit) setIsExiting(true) }, [forceExit])
  const [lyrics, setLyrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(onClose, 280)
  }
  const { progress } = useProgressStore()

  const [isFollowing, setIsFollowing] = useState(true)
  const isFollowingRef      = useRef(true)
  const isMouseDownRef      = useRef(false)
  const activeIndexRef      = useRef(-1)
  const isProgrammaticRef   = useRef(false)

  useEffect(() => {
    isFollowingRef.current = isFollowing
  }, [isFollowing])

  useEffect(() => {
    const onDown = () => { isMouseDownRef.current = true }
    const onUp = () => { isMouseDownRef.current = false }
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // For scrolling
  const containerRef = useRef(null)
  const activeLineRef = useRef(null)

  useEffect(() => {
    if (!song) return
    let active = true
    setLoading(true)
    setError(null)
    setLyrics(null)

    fetchLyrics(session, song.Id).then(data => {
      if (!active) return
      setLoading(false)
      if (!data || (!data.Lyrics && !data.Text)) {
        setError('No lyrics found for this track.')
        return
      }
      
      // Jellyfin can return an array of Lyric models or a single text block
      // Metadata.Offset (ms) is the LRC [offset:] tag — Jellyfin does NOT pre-apply
      // it to the Start timestamps, so we shift each line's Start here.
      const offsetTicks = (data.Metadata?.Offset ?? 0) * 10000

      const applyOffset = (lines) =>
        offsetTicks === 0 ? lines : lines.map(l => ({ ...l, Start: l.Start + offsetTicks }))

      const normaliseLyrics = (lines) => {
        const adjusted = applyOffset(lines)
        // If no line has a non-zero Start the data has no timing — treat as plain text
        if (!adjusted.some(l => l.Start > 0)) return adjusted.map(l => l.Text).join('\n')
        return adjusted
      }

      if (Array.isArray(data.Lyrics) && data.Lyrics.length > 0) {
        setLyrics(normaliseLyrics(data.Lyrics))
      } else if (data.Lyrics && Array.isArray(data.Lyrics.Lyrics)) {
        setLyrics(normaliseLyrics(data.Lyrics.Lyrics))
      } else if (typeof data.Lyrics === 'string') {
        setLyrics(data.Lyrics)
      } else if (typeof data.Text === 'string') {
        setLyrics(data.Text)
      } else {
        setError('No lyrics found for this track.')
      }
    }).catch(() => {
      if (!active) return
      setLoading(false)
      setError('Failed to load lyrics.')
    })

    return () => { active = false }
  }, [session, song])

  const ticksToSeconds = (ticks) => (!ticks ? 0 : ticks / 10_000_000)
  const isSync = Array.isArray(lyrics)
  let activeIndex = -1
  if (isSync) {
    for (let i = 0; i < lyrics.length; i++) {
      if (progress >= ticksToSeconds(lyrics[i].Start)) activeIndex = i
      else break
    }
  }

  useEffect(() => {
    if (!isFollowingRef.current || !activeLineRef.current || !containerRef.current) return
    if (activeIndex === activeIndexRef.current) return
    activeIndexRef.current = activeIndex

    const el        = activeLineRef.current
    const container = containerRef.current
    const cRect     = container.getBoundingClientRect()
    const eRect     = el.getBoundingClientRect()

    if (cRect.bottom - eRect.bottom < cRect.height * 0.45) {
      isProgrammaticRef.current = true
      const target = Math.max(0, container.scrollTop + (eRect.top - cRect.top) - cRect.height * 0.1)
      rafSmoothScroll(container, target, 600)
      setTimeout(() => { isProgrammaticRef.current = false }, 900)
    }
  }, [activeIndex, lyrics])

  const handleUserScroll = () => {
    if (isFollowingRef.current && !isProgrammaticRef.current) setIsFollowing(false)
  }

  const handleScrollEvent = () => {
    if (isMouseDownRef.current && isFollowingRef.current && !isProgrammaticRef.current) setIsFollowing(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(8,8,8,0.95)',
      backdropFilter: 'blur(10px)',
      display: 'flex', flexDirection: 'column',
      animation: isExiting ? 'slideOutOverlay 0.3s cubic-bezier(0.4,0,1,1) forwards' : 'slideInOverlay 0.28s cubic-bezier(0,0,0.2,1) both',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'flex-end', padding: '24px'
      }}>
        <button onClick={handleClose} style={{
          border: 'none', color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
          transition: 'background 0.2s'
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div 
        ref={containerRef} 
        onWheel={handleUserScroll}
        onTouchMove={handleUserScroll}
        onScroll={handleScrollEvent}
        style={{
          flex: 1, overflowY: 'auto', padding: '0 10%', 
          paddingBottom: (!loading && !error) ? '40vh' : '0',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: (loading || error) ? 'center' : 'flex-start'
        }}
      >
        {loading && (
          <div style={{ fontSize: '1.2rem', color: '#888' }}>
            Loading lyrics...
          </div>
        )}
        
        {error && (
          <div style={{ fontSize: '1.2rem', color: '#888' }}>
            {error}
          </div>
        )}

        {!loading && !error && isSync && lyrics.map((line, i) => {
          const isActive = i === activeIndex
          const isPassed = i < activeIndex
          
          let color = '#fff'
          let opacity = 1
          let transform = 'scale(1)'
          let textShadow = '0 0 0px transparent'

          if (isActive) {
            color = 'var(--accent)'
            opacity = 1
            transform = 'scale(1.08)'
            textShadow = '0 0 20px var(--accent-glow)'
          } else if (isPassed) {
            color = '#ffffff'
            opacity = 0.25
            transform = 'scale(0.95)'
          } else {
            color = '#ffffff'
            opacity = 0.7
          }

          return (
            <div 
              key={i}
              ref={isActive ? activeLineRef : null}
              style={{
                fontSize: '2rem',
                fontWeight: 600,
                color,
                opacity,
                transform,
                textShadow,
                textAlign: 'center',
                margin: '16px 0',
                transition: 'color 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.34,1.2,0.64,1), text-shadow 0.4s ease',
                cursor: 'pointer',
                lineHeight: 1.4,
                maxWidth: '800px',
              }}
              onClick={() => {
                // Future enhancement: click to seek
                const s = ticksToSeconds(line.Start)
                window.dispatchEvent(new CustomEvent('flacr:seek', { detail: s }))
              }}
            >
              {line.Text}
            </div>
          )
        })}

        {!loading && !error && !isSync && typeof lyrics === 'string' && (
          <div style={{
            fontSize: '1.4rem',
            lineHeight: 1.8,
            color: '#ddd',
            textAlign: 'center',
            maxWidth: '800px',
            whiteSpace: 'pre-wrap',
            margin: 'auto',
          }}>
            {lyrics}
          </div>
        )}
      </div>

      {!isFollowing && isSync && (
        <div style={{
          position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 410, animation: 'fadeIn 0.2s ease'
        }}>
          <button onClick={() => setIsFollowing(true)} style={{
            background: 'var(--accent)', border: 'none', color: 'var(--accent-fg)', cursor: 'pointer',
            padding: '12px 24px', borderRadius: '99px', fontSize: '1rem', fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', transition: 'background 0.2s, transform 0.1s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1.05)'}
          >
            Follow Lyrics
          </button>
        </div>
      )}
    </div>
  )
}
