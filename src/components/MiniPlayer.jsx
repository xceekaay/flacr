import { useEffect, useState } from 'react'
import usePlayerStore, { useProgressStore } from '../store/playerStore'
import useSettingsStore from '../store/settingsStore'
import { imgUrl, fetchLyrics } from '../utils/api'

const ipc = window.electronAPI

export function MiniPlayer({ session }) {
  const { queue, currentIndex, isPlaying, togglePlay, next, prev, prevForce } = usePlayerStore()
  const { progress, duration } = useProgressStore()
  const song = queue[currentIndex] || null
  const progressPct = duration ? (progress / duration) * 100 : 0
  const hasSong = !!song

  const { animations } = useSettingsStore()
  const [lyricsLines, setLyricsLines] = useState(null)
  const [currentLine, setCurrentLine] = useState('')

  // Media key / tray IPC
  useEffect(() => {
    if (!ipc) return
    ipc.onTrayPlayPause(togglePlay)
    ipc.onTrayNext(next)
    ipc.onTrayPrev(prev)
    ipc.onTrayPrevForce(prevForce)
    return () => {
      ['tray-play-pause','tray-next','tray-prev','tray-prev-force']
        .forEach(ch => ipc.removeAllListeners(ch))
    }
  }, [])

  useEffect(() => {
    setLyricsLines(null)
    setCurrentLine('')
    if (!song) return
    let active = true
    fetchLyrics(session, song.Id).then(data => {
      if (!active) return
      if (!data) { setLyricsLines([]); return }
      const offsetTicks = (data.Metadata?.Offset ?? 0) * 10000
      let lines = null
      if (Array.isArray(data.Lyrics) && data.Lyrics.length > 0) lines = data.Lyrics
      else if (data.Lyrics && Array.isArray(data.Lyrics.Lyrics)) lines = data.Lyrics.Lyrics
      if (!lines || !lines.some(l => l.Start > 0)) { setLyricsLines([]); return }
      setLyricsLines(offsetTicks === 0 ? lines : lines.map(l => ({ ...l, Start: l.Start + offsetTicks })))
    }).catch(() => { if (active) setLyricsLines([]) })
    return () => { active = false }
  }, [song?.Id, session])

  useEffect(() => {
    if (!lyricsLines?.length) { setCurrentLine(''); return }
    const progressTicks = progress * 10_000_000
    let line = ''
    for (let i = lyricsLines.length - 1; i >= 0; i--) {
      if (lyricsLines[i].Start <= progressTicks) { line = lyricsLines[i].Text || ''; break }
    }
    setCurrentLine(line)
  }, [progress, lyricsLines])

  const btnColor     = hasSong ? '#888' : '#333'
  const btnHover     = hasSong ? '#fff' : '#333'
  const primaryBg    = hasSong ? 'var(--accent)' : '#2a2a3a'
  const primaryHover = hasSong ? 'var(--accent-hover)' : '#2a2a3a'

  return (
    <div style={{
      width:'100vw', height:'100vh', background:'#161616',
      display:'flex', flexDirection:'column',
      userSelect:'none', overflow:'hidden',
      WebkitAppRegion:'drag',
    }}>
      {/* Seek underline */}
      <div style={{
        position:'absolute', bottom: currentLine ? 20 : 0, left:0, right:0, height:2,
        background:'rgba(255,255,255,0.06)', transition:'bottom 0.2s',
      }}>
        <div style={{ width:`${progressPct}%`, height:'100%',
          background: hasSong ? 'var(--accent)' : 'transparent' }}/>
      </div>

      {/* Main row */}
      <div style={{
        display:'flex', alignItems:'center', gap:'12px',
        padding:'0 12px', flex:1, WebkitAppRegion:'drag',
      }}>
        {/* Art */}
        <div style={{ flexShrink:0, WebkitAppRegion:'no-drag' }}>
          {(song?.ImageTags?.Primary || song?.AlbumId)
            ? <img src={imgUrl(session, song.ImageTags?.Primary ? song.Id : song.AlbumId, 52)} alt=""
                style={{ width:44, height:44, borderRadius:'6px', objectFit:'cover',
                  opacity: hasSong ? 1 : 0.3 }}/>
            : <div style={{ width:44, height:44, borderRadius:'6px',
                background: hasSong ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color: hasSong ? 'var(--accent)' : '#333', fontSize:'1.1rem' }}>♪</div>
          }
        </div>

        {/* Info */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.82rem', fontWeight:600,
            color: hasSong ? '#fff' : '#444',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {song?.Name || 'Nothing playing'}
          </div>
          <div style={{ fontSize:'0.7rem', color: hasSong ? '#555' : '#333',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {song?.AlbumArtist || '—'}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display:'flex', alignItems:'center', gap:'4px', WebkitAppRegion:'no-drag', flexShrink:0 }}>
          {[
            {
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2"/></svg>,
              fn: hasSong ? prev : undefined,
            },
            {
              icon: isPlaying
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
              fn: hasSong ? togglePlay : undefined,
              primary: true,
            },
            {
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2"/></svg>,
              fn: hasSong ? next : undefined,
            },
          ].map((btn, i) => (
            <button key={i} onClick={btn.fn} disabled={!hasSong} style={{
              width: btn.primary ? 32 : 26, height: btn.primary ? 32 : 26,
              borderRadius:'50%', border:'none',
              cursor: hasSong ? 'pointer' : 'default',
              background: btn.primary ? primaryBg : 'transparent',
              color: btn.primary ? (hasSong ? '#fff' : '#444') : btnColor,
              display:'flex', alignItems:'center', justifyContent:'center',
              transition:'background 0.12s, color 0.12s',
            }}
              onMouseEnter={e=>{ if(hasSong && !btn.primary) e.currentTarget.style.color=btnHover }}
              onMouseLeave={e=>{ if(hasSong && !btn.primary) e.currentTarget.style.color=btnColor }}
            >{btn.icon}</button>
          ))}

          {/* Expand back */}
          <button onClick={()=>ipc?.closeMini()} style={{
            width:26, height:26, borderRadius:'50%', border:'none', cursor:'pointer',
            background:'transparent', color:'#555', display:'flex', alignItems:'center',
            justifyContent:'center', marginLeft:4, transition:'color 0.12s',
          }}
            onMouseEnter={e=>e.currentTarget.style.color='#fff'}
            onMouseLeave={e=>e.currentTarget.style.color='#555'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Lyrics ticker strip */}
      {currentLine ? (
        <div style={{
          height:20, overflow:'hidden', padding:'0 12px',
          display:'flex', alignItems:'center',
          WebkitAppRegion:'no-drag',
        }}>
          {animations ? (
            <div key={currentLine} style={{
              fontSize:'0.68rem', color:'#555',
              whiteSpace:'nowrap', display:'inline-block',
              animation:'lyric-ticker 12s linear infinite',
            }}>
              {currentLine}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{currentLine}
            </div>
          ) : (
            <div style={{
              fontSize:'0.68rem', color:'#555',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
              width:'100%',
            }}>
              {currentLine}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
