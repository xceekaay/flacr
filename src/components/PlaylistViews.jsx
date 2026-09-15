import { useState, useRef, useEffect, useCallback } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { createPortal } from 'react-dom'
import useMenuStore from '../store/menuStore'
import { MenuShell, MenuItem, MenuDivider, MenuLabel, Icons as MenuIcons } from './ContextMenu'
import { plural } from '../utils/format'
import { BackButton, LoadingMessage, useBackTransition } from './ui'
import { VirtualSongList } from './VirtualSongList'
import { imgUrl, fetchPlaylistSongs, renamePlaylist, uploadPlaylistImage } from '../utils/api'
import usePlayerStore from '../store/playerStore'

function ConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position:'fixed', inset:0, zIndex:10000,
        background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:'rgba(18,18,18,1)',
          border:'1px solid rgba(255,255,255,0.09)',
          borderRadius:'18px', padding:'28px 32px', width:360,
          boxShadow:'0 32px 80px rgba(0,0,0,0.85), 0 0 0 0.5px rgba(255,255,255,0.05)',
        }}
      >
        <div style={{ fontSize:'1.2rem', fontWeight:700, marginBottom:'10px' }}>{title}</div>
        <div style={{ fontSize:'0.93rem', color:'#777', marginBottom:'24px', lineHeight:1.5 }}>{message}</div>
        <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{
            padding:'8px 20px', background:'transparent',
            border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px',
            color:'#888', cursor:'pointer', fontSize:'0.93rem',
            transition:'border-color 0.15s, color 0.15s',
          }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor='rgba(255,255,255,0.3)'; e.currentTarget.style.color='#ccc' }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; e.currentTarget.style.color='#888' }}
          >Cancel</button>
          <button onClick={onConfirm} style={{
            padding:'8px 20px', background:'rgba(239,68,68,0.15)',
            border:'1px solid rgba(239,68,68,0.4)', borderRadius:'8px',
            color:'#f87171', cursor:'pointer', fontSize:'0.93rem', fontWeight:600,
            transition:'background 0.15s, border-color 0.15s',
          }}
            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(239,68,68,0.28)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.6)' }}
            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.4)' }}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}


// ── Shared context menu item ───────────────────────────────────────────────────
// Using imported MenuItem and MenuDivider
const Divider = () => <MenuDivider/>


// ContextMenuShell delegates entirely to the shared MenuShell which handles all dismiss logic
function ContextMenuShell({ x, y, onClose, children }) {
  return <MenuShell x={x} y={y} minWidth={190}>{children}</MenuShell>
}

// ── Context menu for right-click on empty playlist space ──────────────────────
function EmptySpaceContextMenu({ x, y, onClose, onNewPlaylist }) {
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <MenuItem label="New Playlist" onClick={()=>{ onNewPlaylist(); onClose() }}
        icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
      />
    </ContextMenuShell>
  )
}

// ── Context menu for right-click on playlist card ─────────────────────────────
function PlaylistContextMenu({ x, y, playlist, session, onClose, onRenamed, onCoverChanged, onOpen, onDelete, showToast }) {
  const fileInputRef = useRef(null)
  const [renaming,  setRenaming]  = useState(false)
  const [nameVal,   setNameVal]   = useState(playlist.Name)
  const [uploading, setUploading] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const { playSong, addManyToQueue, toggleShuffle, shuffle } = usePlayerStore()

  const getSongs = async () => {
    setLoading(true)
    try { return await fetchPlaylistSongs(session, playlist.Id) }
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

  const handleAddToQueue = async () => {
    onClose()
    const songs = await getSongs()
    addManyToQueue(songs)
    if (songs.length) showToast?.({ message: `Added ${songs.length} song${songs.length !== 1 ? 's' : ''} to queue`, type: 'success' })
  }

  const handleDelete = () => {
    onClose()
    onDelete?.()
  }

  const handleSaveName = async () => {
    const t = nameVal.trim()
    if (!t || t === playlist.Name) { onClose(); return }
    try {
      await renamePlaylist(session, playlist.Id, t)
      onRenamed(t)
      showToast?.({ message: `Playlist renamed to "${t}"`, type: 'success' })
    } catch(e) {
      console.error('Rename failed:', e)
      showToast?.({ message: 'Failed to rename playlist', type: 'warning' })
    }
    onClose()
  }

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadPlaylistImage(session, playlist.Id, file)
      onCoverChanged(imgUrl(session, playlist.Id, 300) + '&t=' + Date.now())
      showToast?.({ message: 'Cover updated', type: 'success' })
    } catch(e) {
      console.error('Image upload failed:', e)
      showToast?.({ message: 'Failed to update cover', type: 'warning' })
    }
    setUploading(false)
    onClose()
    e.target.value = ''
  }

  const isEmpty = (playlist.ChildCount ?? 0) === 0

  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      {loading
        ? <div style={{ padding:'8px 14px', fontSize:'0.89rem', color:'#888' }}>Loading…</div>
        : <>
          <MenuItem label="Open" onClick={()=>{ onOpen(); onClose() }}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>}
          />
          <MenuItem label="Play" onClick={isEmpty ? null : handlePlay} disabled={isEmpty}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M5 3l14 9-14 9V3z"/></svg>}
          />
          <MenuItem label="Shuffle Play" onClick={isEmpty ? null : handleShuffle} disabled={isEmpty}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>}
          />
          <MenuItem label="Add to Queue" onClick={isEmpty ? null : handleAddToQueue} disabled={isEmpty}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/><polygon points="17 15 23 18 17 21" fill="currentColor" stroke="none"/></svg>}
          />
          <Divider/>
          {renaming
            ? <div style={{ padding:'6px 8px', display:'flex', flexDirection:'column', gap:6 }}>
                <input autoFocus value={nameVal} onChange={e=>setNameVal(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter') handleSaveName(); if(e.key==='Escape') onClose() }}
                  style={{ padding:'6px 10px', background:'rgba(255,255,255,0.08)',
                    border:'1px solid rgba(168,85,247,0.5)', borderRadius:'7px',
                    color:'#fff', fontSize:'0.89rem', outline:'none' }}
                />
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={handleSaveName} style={{
                    flex:1, padding:'5px', background:'var(--accent)', border:'none',
                    borderRadius:'6px', color:'#fff', fontSize:'0.93rem', cursor:'pointer', fontWeight:600,
                  }}>Save</button>
                  <button onClick={onClose} style={{
                    flex:1, padding:'5px', background:'transparent',
                    border:'1px solid rgba(255,255,255,0.15)', borderRadius:'6px',
                    color:'#888', fontSize:'0.93rem', cursor:'pointer',
                  }}>Cancel</button>
                </div>
              </div>
            : <MenuItem label="Rename" onClick={()=>setRenaming(true)}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
              />
          }
          {uploading
            ? <div style={{ padding:'8px 14px', fontSize:'0.89rem', color:'#888' }}>Uploading…</div>
            : <MenuItem label="Change Cover" onClick={()=>fileInputRef.current?.click()}
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
              />
          }
          <input ref={fileInputRef} type="file" accept="image/*"
            onChange={handleImagePick} style={{ display:'none' }}/>
          <Divider/>
          <MenuItem label="Delete Playlist" onClick={handleDelete} color="#f87171"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>}
          />
        </>
      }
    </ContextMenuShell>
  )
}

function PlaylistCard({ coverSrc, displayName, childCount, onClick, onContextMenu }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      data-playlist-card
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ cursor:'pointer', transition:'transform 0.2s ease', transform: hovered ? 'translateY(-4px)' : 'translateY(0)' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        transition:'transform 0.2s ease, box-shadow 0.2s ease', borderRadius:'12px',
        transform: hovered ? 'scale(1.02)' : 'scale(1)',
        boxShadow: hovered ? '0 14px 36px rgba(0,0,0,0.5)' : 'none',
      }}>
        {coverSrc
          ? <img src={coverSrc} alt="" style={{ width:'100%', aspectRatio:'1', borderRadius:'12px', objectFit:'cover', display:'block' }}/>
          : <div style={{ width:'100%', aspectRatio:'1', borderRadius:'12px',
              background:'var(--accent-dim)', border:'1px solid var(--accent-dim)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.5rem' }}>♫</div>
        }
      </div>
      <div style={{ marginTop:'10px', fontSize:'0.93rem', fontWeight:600,
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayName}</div>
      <div style={{ fontSize:'0.81rem', color:'#666', marginTop:'2px' }}>
        {childCount != null ? plural(childCount, 'song') : 'Empty'}
      </div>
    </div>
  )
}

// ── Playlist Grid ─────────────────────────────────────────────────────────────
export function PlaylistGrid({ session, playlists, onSelectPlaylist, onNewPlaylist, onPlaylistUpdated, onDeletePlaylist, showToast }) {
  const [animationParent] = useAutoAnimate({ duration: 250, easing: 'ease-in-out' })
  // covers: { [playlistId]: url | null | 'loading' }
  const [covers,  setCovers]  = useState({})
  // customCovers: overrides from context-menu upload { [playlistId]: url }
  const [customCovers, setCustomCovers] = useState({})
  const { menu: globalMenu, openMenu: openGlobalMenu, closeMenu: closeGlobalMenu } = useMenuStore()
  const [renamed, setRenamed] = useState({})    // { [id]: newName }
  const [confirmPlaylist, setConfirmPlaylist] = useState(null) // playlist pending delete

  // Cover priority: playlist's own uploaded image > first song's art
  useEffect(() => {
    if (!session || !playlists.length) return
    playlists.forEach(async (pl) => {
      if (covers[pl.Id] !== undefined) return
      if (pl.ImageTags?.Primary) {
        setCovers(c => ({ ...c, [pl.Id]: imgUrl(session, pl.Id, 300) + '&t=' + pl.ImageTags.Primary }))
        return
      }
      setCovers(c => ({ ...c, [pl.Id]: 'loading' }))
      try {
        const songs = await fetchPlaylistSongs(session, pl.Id)
        const first = songs.find(s => s.ImageTags?.Primary)
        setCovers(c => ({ ...c, [pl.Id]: first ? imgUrl(session, first.Id, 300) : null }))
      } catch {
        setCovers(c => ({ ...c, [pl.Id]: null }))
      }
    })
  }, [playlists, session])

  const prevPlaylistsRef = useRef([])
  useEffect(() => {
    const prev = prevPlaylistsRef.current
    const changed = playlists.filter(pl => {
      const old = prev.find(p => p.Id === pl.Id)
      return old && old.ImageTags?.Primary !== pl.ImageTags?.Primary
    })
    if (changed.length > 0) {
      setCovers(c => {
        const next = { ...c }
        changed.forEach(pl => delete next[pl.Id])
        return next
      })
    }
    prevPlaylistsRef.current = playlists
  }, [playlists])

  const handleContextMenu = (e, pl) => {
    e.preventDefault()
    e.stopPropagation()
    openMenu({ x: e.clientX, y: e.clientY, playlist: pl })
  }

  const handleContainerContextMenu = (e) => {
    // Fire if the click landed on the container itself or any non-card empty area
    const clickedCard = e.target.closest('[data-playlist-card]')
    if (!clickedCard) {
      e.preventDefault()
      openMenu({ x: e.clientX, y: e.clientY, empty: true })
    }
  }

  const closeMenu = closeGlobalMenu
  const openMenu  = openGlobalMenu

  return (
    <div
      data-playlist-grid
      onContextMenu={handleContainerContextMenu}
      style={{ minHeight: '100%' }}
    >
      <button onClick={onNewPlaylist} style={{
        display:'inline-flex', alignItems:'center', gap:'8px',
        background:'var(--accent-dim)', border:'1px solid var(--accent-border)',
        borderRadius:'12px', color:'var(--accent)', padding:'9px 18px',
        fontSize:'0.93rem', fontWeight:600, cursor:'pointer',
        transition:'background 0.2s ease, transform 0.15s ease, color 0.2s ease', marginBottom:'24px',
      }}
        onMouseEnter={e=>{ e.currentTarget.style.background='var(--accent-glow)'; e.currentTarget.style.color='#fff' }}
        onMouseLeave={e=>{ e.currentTarget.style.background='var(--accent-dim)'; e.currentTarget.style.color='var(--accent)' }}
      >+ New Playlist</button>

      {playlists.length === 0
        ? <div style={{ textAlign:'center', color:'#555', marginTop:'60px', fontSize:'0.96rem' }}>
            No playlists yet — create one or right-click a song to add it.
          </div>
        : <div ref={animationParent} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(135px, 1fr))', gap:'20px' }}>
            {playlists.map(pl => {
              const coverSrc = customCovers[pl.Id] || (covers[pl.Id] !== 'loading' ? covers[pl.Id] : null)
              const displayName = renamed[pl.Id] || pl.Name
              return (
                <PlaylistCard
                  key={pl.Id}
                  coverSrc={coverSrc}
                  displayName={displayName}
                  childCount={pl.ChildCount}
                  onClick={() => onSelectPlaylist(pl)}
                  onContextMenu={e => handleContextMenu(e, pl)}
                />
              )
            })}
          </div>
      }

      {globalMenu && globalMenu.empty && (
        <EmptySpaceContextMenu
          x={globalMenu.x} y={globalMenu.y}
          onClose={closeMenu}
          onNewPlaylist={onNewPlaylist}
        />
      )}
      {globalMenu && globalMenu.playlist && (
        <PlaylistContextMenu
          key={`${globalMenu.x},${globalMenu.y}`}
          x={globalMenu.x} y={globalMenu.y} playlist={globalMenu.playlist}
          session={session}
          onClose={closeMenu}
          onOpen={()=>onSelectPlaylist(globalMenu.playlist)}
          onRenamed={(newName)=>{
            setRenamed(r => ({ ...r, [globalMenu.playlist.Id]: newName }))
            onPlaylistUpdated?.()
          }}
          onCoverChanged={(url)=>{
            setCustomCovers(c => ({ ...c, [globalMenu.playlist.Id]: url }))
          }}
          onDelete={()=>setConfirmPlaylist(globalMenu.playlist)}
          showToast={showToast}
        />
      )}
      {confirmPlaylist && (
        <ConfirmModal
          title="Delete Playlist"
          message={`"${confirmPlaylist.Name}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={()=>{ onDeletePlaylist?.(confirmPlaylist); setConfirmPlaylist(null) }}
          onCancel={()=>setConfirmPlaylist(null)}
        />
      )}
    </div>
  )
}

// ── Playlist Detail ───────────────────────────────────────────────────────────
export function PlaylistDetail({ session, playlist, songs, loading, favoriteIds, onToggleFavorite, onBack, onPlaylistUpdated, playlists, onAddToPlaylist, onNewPlaylist, onRemoveFromPlaylist, onDeletePlaylist, showToast, emptyPlaylistLabel }) {
  const { playSong, toggleShuffle, shuffle } = usePlayerStore()
  const { handleBack, exitStyle } = useBackTransition(onBack)
  const fileInputRef = useRef(null)
  const nameInputRef = useRef(null)

  const [editingName,  setEditingName]  = useState(false)
  const [nameValue,    setNameValue]    = useState(playlist.Name)
  const [savingName,   setSavingName]   = useState(false)
  const [coverUrl,     setCoverUrl]     = useState(null)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [hovering,     setHovering]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { setNameValue(playlist.Name) }, [playlist.Name])

  // Cover priority: playlist's own uploaded image > first song's art > null
  useEffect(() => {
    if (playlist.ImageTags?.Primary) {
      // Playlist has its own custom image (user-uploaded) — use it with cache bust
      setCoverUrl(imgUrl(session, playlist.Id, 400) + '&t=' + (playlist.ImageTags.Primary))
    } else {
      const first = songs.find(s => s.ImageTags?.Primary)
      setCoverUrl(first ? imgUrl(session, first.Id, 400) : null)
    }
  }, [playlist, songs, session])

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.focus()
  }, [editingName])

  const handleSaveName = async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === playlist.Name) { setEditingName(false); return }
    setSavingName(true)
    try {
      await renamePlaylist(session, playlist.Id, trimmed)
      onPlaylistUpdated?.()
      showToast?.({ message: `Playlist renamed to "${trimmed}"`, type: 'success' })
    } catch(e) {
      console.error('Rename failed:', e)
      showToast?.({ message: 'Failed to rename playlist', type: 'warning' })
    }
    setSavingName(false)
    setEditingName(false)
  }

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    try {
      await uploadPlaylistImage(session, playlist.Id, file)
      setCoverUrl(imgUrl(session, playlist.Id, 400) + '&t=' + Date.now())
      onPlaylistUpdated?.()
      showToast?.({ message: 'Cover updated', type: 'success' })
    } catch(e) {
      console.error('Image upload failed:', e)
      showToast?.({ message: 'Failed to update cover', type: 'warning' })
    }
    setUploadingImg(false)
    e.target.value = ''
  }

  const handleShuffle = () => {
    if (!songs.length) return
    if (!shuffle) toggleShuffle()
    playSong(songs, Math.floor(Math.random() * songs.length))
  }

  return (
    <div key={playlist.Id} style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, animation:'fadeUp 0.3s ease both', ...exitStyle }}>
      <BackButton onClick={handleBack} label="All Playlists"/>
      <div style={{ display:'flex', gap:'24px', marginBottom:'28px', alignItems:'flex-end' }}>

        {/* Cover with hover-to-edit */}
        <div
          style={{ position:'relative', width:160, height:160, flexShrink:0, cursor:'pointer' }}
          onMouseEnter={()=>setHovering(true)}
          onMouseLeave={()=>setHovering(false)}
          onClick={()=>fileInputRef.current?.click()}
        >
          {coverUrl
            ? <img src={coverUrl} alt="" style={{ width:160, height:160, borderRadius:'12px',
                objectFit:'cover', display:'block' }}/>
            : <div style={{ width:160, height:160, borderRadius:'12px',
                background:'var(--accent-dim)', border:'1px solid var(--accent-dim)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:'3.5rem' }}>♫</div>
          }
          <div style={{
            position:'absolute', inset:0, borderRadius:'12px',
            background:'rgba(0,0,0,0.55)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6,
            opacity: hovering || uploadingImg ? 1 : 0, transition:'opacity 0.18s',
          }}>
            {uploadingImg
              ? <div style={{ color:'#fff', fontSize:'0.97rem' }}>Uploading…</div>
              : <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span style={{ color:'#fff', fontSize:'0.81rem', fontWeight:600 }}>Change cover</span>
                </>
            }
          </div>
          <input ref={fileInputRef} type="file" accept="image/*"
            onChange={handleImagePick} style={{ display:'none' }}/>
        </div>

        {/* Name + actions */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.81rem', color:'#555', textTransform:'uppercase',
            letterSpacing:'1px', marginBottom:'6px' }}>Playlist</div>

          {editingName
            ? <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                <input ref={nameInputRef} value={nameValue}
                  onChange={e=>setNameValue(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter') handleSaveName(); if(e.key==='Escape') { setNameValue(playlist.Name); setEditingName(false) }}}
                  style={{ fontSize:'1.85rem', fontWeight:800, background:'transparent',
                    border:'none', borderBottom:'2px solid #a855f7', outline:'none',
                    color:'#fff', width:'100%', padding:'2px 0' }}
                />
                <button onClick={handleSaveName} disabled={savingName} style={{
                  background:'var(--accent)', border:'none', borderRadius:'7px', color:'#fff',
                  padding:'6px 14px', cursor:'pointer', fontSize:'0.97rem', fontWeight:600, flexShrink:0,
                }}>Save</button>
                <button onClick={()=>{ setNameValue(playlist.Name); setEditingName(false) }} style={{
                  background:'transparent', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'7px',
                  color:'#888', padding:'6px 10px', cursor:'pointer', fontSize:'0.97rem', flexShrink:0,
                }}>Cancel</button>
              </div>
            : <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
                <div style={{ fontSize:'1.85rem', fontWeight:800, whiteSpace:'nowrap',
                  overflow:'hidden', textOverflow:'ellipsis' }}>{nameValue}</div>
                <button onClick={()=>setEditingName(true)} title="Rename" style={{
                  background:'transparent', border:'none', color:'#555', cursor:'pointer',
                  padding:'4px', borderRadius:'6px', transition:'color 0.15s', flexShrink:0,
                }}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--accent)'}
                  onMouseLeave={e=>e.currentTarget.style.color='#555'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
          }

          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginTop:'10px' }}>
            <div style={{ fontSize:'0.93rem', color:'#555' }}>{plural(songs.length, 'song')}</div>
            {songs.length > 0 && !loading && (
              <button onClick={handleShuffle} style={{
                display:'flex', alignItems:'center', gap:'7px',
                background:'rgba(var(--accent-rgb,168,85,247),0.12)', border:'1px solid var(--accent-border)',
                borderRadius:'8px', color:'var(--accent)', padding:'7px 14px',
                fontSize:'0.97rem', fontWeight:600, cursor:'pointer', transition:'background 0.2s ease, transform 0.15s ease',
              }}
                onMouseEnter={e=>{ e.currentTarget.style.background='var(--accent-glow)'; e.currentTarget.style.color='#fff' }}
                onMouseLeave={e=>{ e.currentTarget.style.background='var(--accent-dim)'; e.currentTarget.style.color='var(--accent)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                  <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                  <line x1="4" y1="4" x2="9" y2="9"/>
                </svg>
                Shuffle Playlist
              </button>
            )}
            {/* Delete playlist */}
            {onDeletePlaylist && (
              <button onClick={()=>setConfirmDelete(true)} style={{
                marginLeft:'auto', display:'flex', alignItems:'center', gap:'6px',
                background:'transparent', border:'1px solid rgba(239,68,68,0.3)',
                borderRadius:'8px', color:'#f87171', padding:'7px 12px',
                fontSize:'0.97rem', cursor:'pointer', transition:'all 0.15s',
              }}
                onMouseEnter={e=>{ e.currentTarget.style.background='rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor='rgba(239,68,68,0.5)' }}
                onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='rgba(239,68,68,0.3)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Delete Playlist
              </button>
            )}
          </div>
        </div>
      </div>

      {loading
        ? <LoadingMessage/>
        : <VirtualSongList
            songs={songs} session={session}
            favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite}
            playlists={playlists} onAddToPlaylist={onAddToPlaylist} onNewPlaylist={onNewPlaylist}
            onRemoveFromPlaylist={onRemoveFromPlaylist}
            showToast={showToast}
            emptyPlaylistLabel={emptyPlaylistLabel}
          />
      }
      {confirmDelete && (
        <ConfirmModal
          title="Delete Playlist"
          message={`"${nameValue}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={()=>{ setConfirmDelete(false); onDeletePlaylist?.() }}
          onCancel={()=>setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

export function NewPlaylistModal({ onConfirm, onCancel }) {
  const [name, setName] = useState('')
  return (
    <div style={{ position:'fixed', inset:0, zIndex:800, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)',
      display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'rgba(18,18,18,1)',
        border:'1px solid rgba(255,255,255,0.09)',
        borderRadius:'18px', padding:'28px 32px', width:360,
        boxShadow:'0 32px 80px rgba(0,0,0,0.85), 0 0 0 0.5px rgba(255,255,255,0.05)',
      }}>
        <div style={{ fontSize:'1.2rem', fontWeight:700, marginBottom:'16px', letterSpacing:'-0.2px' }}>New Playlist</div>
        <input autoFocus type="text" placeholder="Playlist name..."
          value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'&&name.trim()) onConfirm(name.trim()); if(e.key==='Escape') onCancel() }}
          style={{ width:'100%', padding:'10px 14px', background:'rgba(255,255,255,0.06)',
            border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', color:'#fff',
            fontSize:'0.96rem', outline:'none', marginBottom:'16px',
            transition:'border-color 0.15s' }}
        />
        <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ padding:'8px 18px', background:'transparent',
            border:'1px solid rgba(255,255,255,0.12)', borderRadius:'9px', color:'#777', cursor:'pointer',
            transition:'border-color 0.15s, color 0.15s', fontSize:'0.93rem' }}>
            Cancel
          </button>
          <button onClick={()=>{ if(name.trim()) onConfirm(name.trim()) }} style={{
            padding:'8px 18px', background: name.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            border:'none', borderRadius:'9px', color: name.trim() ? '#fff' : '#555',
            cursor: name.trim() ? 'pointer' : 'default',
            fontWeight:600, fontSize:'0.93rem',
            transition:'background 0.2s ease, color 0.2s ease',
            boxShadow: name.trim() ? '0 0 16px var(--accent-glow)' : 'none',
          }}>Create</button>
        </div>
      </div>
    </div>
  )
}
