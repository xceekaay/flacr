import { useState, useRef, useEffect, useCallback } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { imgUrl, fetchSimilar } from '../utils/api'
import { plural } from '../utils/format'
import { BackButton, ItemImage, LoadingMessage, useBackTransition } from './ui'
import { VirtualSongList } from './VirtualSongList'
import usePlayerStore from '../store/playerStore'
import useMenuStore from '../store/menuStore'
import { MenuShell, MenuItem } from './ContextMenu'

// Shared icon set — keep in sync with ContextMenu.jsx
const Icons = {
  open:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>,
  play:    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M5 3l14 9-14 9V3z"/></svg>,
  shuffle: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>,
  queue:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/><polygon points="17 15 23 18 17 21" fill="currentColor" stroke="none"/></svg>,
}

function ShuffleButton({ onClick, label = 'Shuffle' }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:'7px',
      background:'rgba(var(--accent-rgb,168,85,247),0.12)', border:'1px solid var(--accent-border)',
      borderRadius:'8px', color:'var(--accent)', padding:'7px 14px',
      fontSize:'0.97rem', fontWeight:600, cursor:'pointer',
      transition:'background 0.15s, color 0.15s',
    }}
      onMouseEnter={e=>{ e.currentTarget.style.background='var(--accent-glow)'; e.currentTarget.style.color='#fff' }}
      onMouseLeave={e=>{ e.currentTarget.style.background='var(--accent-dim)'; e.currentTarget.style.color='var(--accent)' }}
    >
      {Icons.shuffle}
      {label}
    </button>
  )
}

function SimilarAlbumsRow({ session, albumId, onSelectAlbum, onHasSimilar }) {
  const [similar, setSimilar] = useState([])
  useEffect(() => {
    let active = true
    fetchSimilar(session, albumId, 12).then(items => {
      if (!active) return
      const filtered = items.filter(i => i.Type === 'MusicAlbum')
      setSimilar(filtered)
      onHasSimilar?.(filtered.length > 0)
    })
    return () => { active = false }
  }, [albumId])
  if (similar.length === 0) return null
  return (
    <div style={{ display:'flex', gap:'16px', overflowX:'auto', paddingBottom:'8px' }}>
        {similar.map(album => (
          <div key={album.Id} onClick={() => onSelectAlbum(album)}
            style={{ cursor:'pointer', flexShrink:0, width:'100px' }}
          >
            {album.ImageTags?.Primary
              ? <img src={imgUrl(session, album.Id, 100)} alt=""
                  style={{ width:'100px', height:'100px', borderRadius:'12px', objectFit:'cover' }}/>
              : <div style={{ width:'100px', height:'100px', borderRadius:'12px',
                  background:'var(--accent-dim)', display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:'1.8rem' }}>💿</div>
            }
            <div style={{ fontSize:'0.78rem', color:'#ccc', marginTop:'8px',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {album.Name}
            </div>
            <div style={{ fontSize:'0.73rem', color:'#555', marginTop:'2px',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {album.AlbumArtist || ''}
            </div>
          </div>
        ))}
    </div>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition:'transform 0.18s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink:0 }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

// ── Album context menu ─────────────────────────────────────────────────────────
export function AlbumContextMenu({ x, y, album, session, onClose, onOpen, fetchSongs, showToast }) {
  const menuRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState({ left: x, top: y })
  const [exiting, setExiting] = useState(false)
  const exitTimerRef = useRef(null)
  const mountedRef   = useRef(true)
  useEffect(() => () => { mountedRef.current = false; clearTimeout(exitTimerRef.current) }, [])
  const { playSong, addManyToQueue } = usePlayerStore()

  const close = () => { if (!mountedRef.current) return; setExiting(true); exitTimerRef.current = setTimeout(() => { if (mountedRef.current) onClose() }, 140) }


  // Dismiss on outside-click (capture), Escape, tab-switch, window blur
  useEffect(() => {
    const onMouseDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) close() }
    const onKey       = (e) => { if (e.key === 'Escape') close() }
    const onVis       = ()  => { if (document.hidden) close() }
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown',   onKey,       true)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown',   onKey,       true)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', close)
    }
  }, [close])

  const getSongs = async () => {
    setLoading(true)
    try { return await fetchSongs(album.Id) }
    catch(e) { console.error(e); return [] }
    finally { setLoading(false) }
  }

  const handlePlay = async () => {
    onClose()
    const songs = await getSongs()
    if (!songs.length) return
    const store = usePlayerStore.getState()
    if (store.shuffle) store.toggleShuffle()
    playSong(songs, 0)
  }

  const handleShuffle = async () => {
    onClose()
    const songs = await getSongs()
    if (!songs.length) return
    const store = usePlayerStore.getState()
    if (!store.shuffle) store.toggleShuffle()
    playSong(songs, Math.floor(Math.random() * songs.length))
  }

  const handleAddToQueue = async (e) => {
    e?.stopPropagation()
    onClose()
    const songs = await getSongs()
    addManyToQueue(songs)
    if (songs.length) showToast?.({ message: `Added ${songs.length} song${songs.length !== 1 ? 's' : ''} to queue`, type: 'success' })
  }

  const item = (label, onClick, icon) => <MenuItem key={label} label={label} onClick={onClick} icon={icon}/>

  return (
    <MenuShell x={x} y={y} minWidth={200}>
      {loading
        ? <div style={{ padding:'8px 14px', fontSize:'0.89rem', color:'#888' }}>Loading…</div>
        : <>
            {onOpen && item('Open', () => { onOpen(); closeMenu() }, Icons.open)}
            {item('Play', handlePlay, Icons.play)}
            {item('Shuffle Play', handleShuffle, Icons.shuffle)}
            {item('Add to Queue', handleAddToQueue, Icons.queue)}
          </>
      }
    </MenuShell>
  )
}

function AlbumCard({ session, album, onClick, fetchSongs, showToast }) {
  const [hovered, setHovered] = useState(false)
  const { openMenu } = useMenuStore()

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    openMenu({ type:'album', x: e.clientX, y: e.clientY, albumId: album.Id, album, session, onOpen: onClick, fetchSongs, showToast })
  }

  return (
    <div
      style={{ cursor:'pointer', transition:'transform 0.2s ease',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)' }}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ transition:'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'scale(1.02)' : 'scale(1)',
        boxShadow: hovered ? '0 14px 36px rgba(0,0,0,0.5)' : 'none',
        borderRadius:'12px',
      }}>
        {album.ImageTags?.Primary
          ? <img src={imgUrl(session, album.Id, 135)} alt=""
              style={{ width:'100%', aspectRatio:'1', borderRadius:'12px', objectFit:'cover', display:'block' }}/>
          : <div style={{ width:'100%', aspectRatio:'1', borderRadius:'12px',
              background:'var(--accent-dim)', display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:'2rem' }}>♪</div>
        }
      </div>
      <div style={{ marginTop:'10px', fontSize:'0.93rem', fontWeight:600,
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{album.Name}</div>
      <div style={{ fontSize:'0.93rem', color:'#666', marginTop:'2px',
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{album.AlbumArtist||'—'}</div>


    </div>
  )
}

export function AlbumGrid({ session, albums, onSelectAlbum, fetchSongs, showToast }) {
  const [animationParent] = useAutoAnimate({ duration: 250, easing: 'ease-in-out' })

  return (
    <div ref={animationParent} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(135px, 1fr))', gap:'20px' }}>
      {albums.map(album => (
        <AlbumCard key={album.Id} session={session} album={album}
          onClick={()=>onSelectAlbum(album)}
          fetchSongs={fetchSongs}
          showToast={showToast}
        />
      ))}
    </div>
  )
}

export function AlbumDetail({ session, album, songs, loading, favoriteIds, onToggleFavorite, onBack, backLabel, playlists, onAddToPlaylist, onNewPlaylist, onSelectAlbum }) {
  const { playSong } = usePlayerStore()
  const { handleBack, exitStyle } = useBackTransition(onBack)
  const [hasSimilar, setHasSimilar] = useState(false)
  const [similarOpen, setSimilarOpen] = useState(() => {
    try { return localStorage.getItem('flacr:similarOpen:album') !== 'false' } catch { return true }
  })

  const handleShuffleAlbum = () => {
    if (!songs.length) return
    const startIndex = Math.floor(Math.random() * songs.length)
    const store = usePlayerStore.getState()
    if (!store.shuffle) store.toggleShuffle()
    playSong(songs, startIndex)
  }

  const toggleSimilar = () => {
    const next = !similarOpen
    setSimilarOpen(next)
    try { localStorage.setItem('flacr:similarOpen:album', String(next)) } catch {}
  }

  return (
    <div key={album.Id} style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, animation:'fadeUp 0.3s ease both', ...exitStyle }}>
      <BackButton onClick={handleBack} label={backLabel || 'All Albums'}/>
      <div style={{ display:'flex', gap:'24px', marginBottom:'28px', alignItems:'flex-end', flexShrink:0 }}>
        <ItemImage session={session} item={album} size={140} style={{ borderRadius:'12px' }}/>
        <div>
          <div style={{ fontSize:'0.81rem', color:'#555', textTransform:'uppercase',
            letterSpacing:'1px', marginBottom:'6px' }}>Album</div>
          <div style={{ fontSize:'1.85rem', fontWeight:800, marginBottom:'4px' }}>{album.Name}</div>
          <div style={{ fontSize:'0.96rem', color:'#888' }}>{album.AlbumArtist||'—'}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginTop:'12px' }}>
            <div style={{ fontSize:'0.93rem', color:'#555' }}>{plural(songs.length, 'song')}</div>
            {songs.length > 0 && !loading && (
              <ShuffleButton onClick={handleShuffleAlbum} label="Shuffle Album"/>
            )}
          </div>
        </div>
      </div>
      <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
        {loading
          ? <LoadingMessage/>
          : <VirtualSongList
              songs={songs} session={session}
              favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite}
              playlists={playlists} onAddToPlaylist={onAddToPlaylist} onNewPlaylist={onNewPlaylist}
            />
        }
      </div>
      {onSelectAlbum && !loading && (
        <div style={{ flexShrink:0, ...(!hasSimilar && { display:'none' }) }}>
          <button onClick={toggleSimilar} style={{
            display:'flex', alignItems:'center', gap:'6px', width:'100%',
            background:'none', border:'none', borderTop:'1px solid rgba(255,255,255,0.05)',
            cursor:'pointer', color:'#888', fontSize:'0.75rem', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'0.8px', padding:'12px 0 10px',
          }}>
            <span>Similar Albums</span>
            <ChevronIcon open={similarOpen}/>
          </button>
          <div style={{ display:'grid', gridTemplateRows: similarOpen ? '1fr' : '0fr', transition:'grid-template-rows 0.25s ease' }}>
            <div style={{ overflow:'hidden' }}>
              <SimilarAlbumsRow
                session={session} albumId={album.Id} onSelectAlbum={onSelectAlbum}
                onHasSimilar={setHasSimilar}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
