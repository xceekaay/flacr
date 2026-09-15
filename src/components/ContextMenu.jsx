import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import usePlayerStore from '../store/playerStore'
import useMenuStore from '../store/menuStore'
import { fetchPlaylistSongs } from '../utils/api'

export const Icons = {
  open:        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>,
  play:        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M5 3l14 9-14 9V3z"/></svg>,
  playNext:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>,
  shuffle:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  queue:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/><polygon points="17 15 23 18 17 21" fill="currentColor" stroke="none"/></svg>,
  plus:        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  remove:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  playlist:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  heartFill:   <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  heartEmpty:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
}

// ── Shared menu panel shell ──────────────────────────────────────────────────
export function MenuShell({ x, y, children, minWidth = 200 }) {
  const ref = useRef(null)
  const [pos, setPos]       = useState({ left: x, top: y })
  const [exiting, setExiting] = useState(false)

  // Clamp to viewport after first render
  useEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({
      left: Math.min(x, window.innerWidth  - width  - 8),
      top:  Math.min(y, window.innerHeight - height - 8),
    })
  }, [x, y])

  // ALL dismiss logic in one effect, zero external deps, everything via refs/getState
  useEffect(() => {
    let closed = false
    let exitTimer = null
    let idleTimer = null
    const openedAt = Date.now()

    const doClose = (immediate = false) => {
      if (closed) return
      closed = true
      clearTimeout(idleTimer)
      idleTimer = null
      if (immediate) {
        useMenuStore.getState().closeMenu()
      } else {
        setExiting(true)
        exitTimer = setTimeout(() => {
          useMenuStore.getState().closeMenu()
        }, 140)
      }
    }

    // Any click/mousedown outside the menu
    const onAnyDown = (e) => {
      if (Date.now() - openedAt < 120) return  // ignore the triggering right-click
      if (ref.current && !ref.current.contains(e.target)) {
        // Right-click opening a new menu — close immediately so the new menu isn't killed by our exit timer
        const isRightClick = e.type === 'contextmenu' || e.button === 2
        doClose(isRightClick)
      }
    }

    // Escape key
    const onKey = (e) => { if (e.key === 'Escape') doClose() }

    // Tab switch or window loses focus — close instantly
    const onVis  = () => { if (document.hidden) { closed = true; useMenuStore.getState().closeMenu() } }
    const onBlur = () => { closed = true; useMenuStore.getState().closeMenu() }

    // Mouse outside idle — close after 900ms of cursor being away
    const onMove = (e) => {
      if (closed || !ref.current) return
      const r = ref.current.getBoundingClientRect()
      const inside = e.clientX >= r.left - 12 && e.clientX <= r.right  + 12 &&
                     e.clientY >= r.top  - 12 && e.clientY <= r.bottom + 12
      if (inside) {
        clearTimeout(idleTimer)
        idleTimer = null
      } else if (!idleTimer) {
        idleTimer = setTimeout(doClose, 900)
      }
    }

    const onScroll = () => doClose()

    document.addEventListener('contextmenu',       onAnyDown, true)
    document.addEventListener('mousedown',        onAnyDown, true)
    document.addEventListener('click',            onAnyDown, true)
    document.addEventListener('keydown',          onKey,     true)
    document.addEventListener('visibilitychange', onVis)
    document.addEventListener('mousemove',        onMove)
    window.addEventListener('blur', onBlur)
    window.addEventListener('scroll',             onScroll,  true)

    return () => {
      closed = true
      clearTimeout(exitTimer)
      clearTimeout(idleTimer)
      document.removeEventListener('contextmenu',       onAnyDown, true)
      document.removeEventListener('mousedown',        onAnyDown, true)
      document.removeEventListener('click',            onAnyDown, true)
      document.removeEventListener('keydown',          onKey,     true)
      document.removeEventListener('visibilitychange', onVis)
      document.removeEventListener('mousemove',        onMove)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('scroll',             onScroll,  true)
    }
  }, [])  // empty deps — runs once, uses closure vars and getState()

  return createPortal(
    <div ref={ref}
      onContextMenu={e => e.preventDefault()}
      style={{
        position:'fixed', top:pos.top, left:pos.left, zIndex:9000,
        minWidth, maxWidth: 240,
        background: 'rgba(20,20,20,1)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '14px', padding: '5px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.04)',
        animation: `${exiting ? 'menuOut' : 'menuIn'} 0.16s cubic-bezier(0.4,0,0.2,1) both`,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {children}
    </div>,
    document.body
  )
}


export function MenuItem({ label, onClick, color, icon, disabled }) {
  const { closeMenu } = useMenuStore()
  return (
    <div
      onClick={disabled ? undefined : () => { onClick(); closeMenu() }}
      style={{
        padding:'7px 12px', fontSize:'0.89rem',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? '#3a3a3a' : (color || '#c8c8c8'),
        borderRadius:'8px', transition:'background 0.12s ease',
        display:'flex', alignItems:'center', gap:'9px',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.background='rgba(255,255,255,0.08)' }}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}
    >
      {icon && <span style={{ opacity:0.65, flexShrink:0, display:'flex', alignItems:'center' }}>{icon}</span>}
      {label}
    </div>
  )
}

export function MenuDivider() {
  return <div style={{ height:'1px', background:'rgba(255,255,255,0.06)', margin:'4px 6px' }}/>
}

export function MenuLabel({ children }) {
  return <div style={{ padding:'5px 12px 3px', fontSize:'0.7rem', color:'#4a4a4a', textTransform:'uppercase', letterSpacing:'0.6px', fontWeight:600 }}>{children}</div>
}

// ── Song context menu ────────────────────────────────────────────────────────
const PLAYLIST_THRESHOLD = 3

export function ContextMenu({ x, y, song, playlists, session, favoriteIds, onToggleFavorite, onAddToPlaylist, onNewPlaylist, onRemoveFromPlaylist, showToast, emptyPlaylistLabel }) {
  const { playNext, addToQueue, playNow } = usePlayerStore()
  const { closeMenu } = useMenuStore()
  const [availablePlaylists, setAvailablePlaylists] = useState(playlists)
  const [checkingMembership, setCheckingMembership] = useState(playlists.length > 0)
  const isFav = favoriteIds?.has(song.Id)

  useEffect(() => {
    if (!session || !playlists.length) { setCheckingMembership(false); return }
    let cancelled = false
    Promise.all(
      playlists.map(pl =>
        fetchPlaylistSongs(session, pl.Id)
          .then(songs => ({ pl, has: songs.some(s => s.Id === song.Id) }))
          .catch(() => ({ pl, has: false }))
      )
    ).then(results => {
      if (cancelled) return
      setAvailablePlaylists(results.filter(r => !r.has).map(r => r.pl))
      setCheckingMembership(false)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <MenuShell x={x} y={y} minWidth={210}>
      <MenuItem label="Play"         onClick={() => playNow(song)}                                                              icon={Icons.play}     />
      <MenuItem label="Play Next"    onClick={() => playNext(song)}                                                             icon={Icons.playNext} />
      <MenuItem label="Add to Queue" onClick={() => { addToQueue(song); showToast?.({ message:`${song.Name} added to queue`, type:'success' }) }} icon={Icons.queue} />
      {onToggleFavorite && (
        <MenuItem
          label={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
          onClick={() => onToggleFavorite(song)}
          color={isFav ? '#f87171' : undefined}
          icon={isFav ? Icons.heartFill : Icons.heartEmpty}
        />
      )}
      <MenuDivider/>
      <MenuLabel>Add to Playlist</MenuLabel>
      {checkingMembership
        ? <div style={{ padding:'4px 14px 6px', fontSize:'0.89rem', color:'#444' }}>Loading…</div>
        : availablePlaylists.length > 0
          ? <div style={availablePlaylists.length > PLAYLIST_THRESHOLD ? { maxHeight:'116px', overflowY:'auto', overflowX:'hidden' } : {}}>
              {availablePlaylists.map(pl =>
                <MenuItem key={pl.Id} label={pl.Name} onClick={() => onAddToPlaylist(pl.Id, song)} color="#aaa" icon={Icons.playlist}/>
              )}
            </div>
          : <div style={{ padding:'4px 14px 6px', fontSize:'0.89rem', color:'#444' }}>{emptyPlaylistLabel || 'No playlists yet'}</div>
      }
      <MenuItem label="New Playlist" onClick={() => onNewPlaylist(song)} color="var(--accent)" icon={Icons.plus}/>
      {onRemoveFromPlaylist && <>
        <MenuDivider/>
        <MenuItem label="Remove from Playlist" onClick={onRemoveFromPlaylist} color="#f87171" icon={Icons.remove}/>
      </>}
    </MenuShell>
  )
}
