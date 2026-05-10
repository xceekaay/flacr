import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import Connect from './Connect'
import usePlayerStore, { restoreQueueFromLibrary } from '../store/playerStore'
import useSettingsStore, { hydrateSettingsFromFile } from '../store/settingsStore'
import Player from '../components/Player'
import { AlbumGrid, AlbumDetail, AlbumContextMenu } from '../components/AlbumViews'
import { ContextMenu, MenuShell, MenuItem as CtxMenuItem } from '../components/ContextMenu'
import { ArtistGrid, ArtistDetail } from '../components/ArtistViews'
import { GenreGrid, GenreDetail } from '../components/GenreViews'
import { PlaylistGrid, PlaylistDetail, NewPlaylistModal } from '../components/PlaylistViews'
import { VirtualSongList } from '../components/VirtualSongList'
import { QueuePanel } from '../components/QueuePanel'
import { NowPlayingOverlay } from '../components/NowPlaying'
import { SortDropdown, LoadingMessage, useToast } from '../components/ui'
import { SettingsView } from '../components/SettingsView'
import { imgUrl, verifySession, fetchAllSongs, fetchAlbums, fetchArtists,
  fetchRecentAlbums, fetchFavoriteSongs,
  fetchAlbumSongs, fetchArtistSongs, toggleFavoriteApi,
  fetchGenres, fetchGenreSongs, fetchPlaylists, fetchPlaylistSongs,
  createPlaylist, addToPlaylist, removeFromPlaylist, deletePlaylist,
  fetchRecentlyPlayed, fetchTopItems, fetchCurrentUser, logoutSession } from '../utils/api'
import { sortSongs, sortAlbums, sortByName } from '../utils/sort'
import { plural } from '../utils/format'
import { useSortPrefs } from '../hooks/useSortPrefs'
import useMenuStore from '../store/menuStore'

const STORAGE_KEY      = 'flacr_session'
const ipc = window.electronAPI

const SIDEBAR_ITEMS = ['Home','Songs','Albums','Artists','Genres','Playlists','Favorites']

const NAV_ICONS = {
  Home:      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Songs:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  Albums:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>,
  Artists:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Genres:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  Playlists: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><line x1="8" y1="6" x2="21" y2="6"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><line x1="8" y1="12" x2="21" y2="12"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/><line x1="8" y1="18" x2="21" y2="18"/></svg>,
  Favorites: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  Settings:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
}


const SONG_SORT_OPTIONS = [
  { label:'Name',           sortBy:'SortName',      sortOrder:'Ascending'  },
  { label:'Artist',         sortBy:'AlbumArtist',   sortOrder:'Ascending'  },
  { label:'Album',          sortBy:'Album',          sortOrder:'Ascending'  },
  { label:'Year',           sortBy:'ProductionYear', sortOrder:'Descending' },
  { label:'Duration',       sortBy:'Runtime',        sortOrder:'Ascending'  },
  { label:'Recently Added', sortBy:'DateCreated',    sortOrder:'Descending' },
]
const ALBUM_SORT_OPTIONS = [
  { label:'Name',           sortBy:'SortName',      sortOrder:'Ascending'  },
  { label:'Artist',         sortBy:'AlbumArtist',   sortOrder:'Ascending'  },
  { label:'Year',           sortBy:'ProductionYear', sortOrder:'Descending' },
  { label:'Recently Added', sortBy:'DateCreated',    sortOrder:'Descending' },
]
const ARTIST_SORT_OPTIONS = [{ label:'Name', sortBy:'SortName', sortOrder:'Ascending' }]

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `${r},${g},${b}`
}
function lighten(hex) {
  const r = Math.min(255, parseInt(hex.slice(1,3),16)+20)
  const g = Math.min(255, parseInt(hex.slice(3,5),16)+20)
  const b = Math.min(255, parseInt(hex.slice(5,7),16)+20)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}




// ── Title bar (28px — slimmed down) ─────────────────────────────────────────
function TitleBar({ isMaximized, isFullscreen }) {
  if (isFullscreen || !ipc) return null
  const btn = {
    width:'40px', height:'28px', border:'none', background:'transparent',
    color:'#555', cursor:'pointer', display:'flex', alignItems:'center',
    justifyContent:'center', transition:'background 0.15s, color 0.15s', flexShrink:0,
  }
  return (
    <div style={{ height:'28px', flexShrink:0, background:'rgba(14,14,14,1)',
      borderBottom:'none',
      display:'flex', alignItems:'center', justifyContent:'flex-end',
      WebkitAppRegion:'drag', userSelect:'none', position:'relative', zIndex:10 }}>
      <div style={{ display:'flex', WebkitAppRegion:'no-drag' }}>
        <button style={btn} onClick={()=>ipc.minimize()}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color='#fff'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#555'}}>
          <svg width="10" height="1" viewBox="0 0 10 1"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
        <button style={btn} onClick={()=>isMaximized?ipc.unmaximize():ipc.maximize()}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color='#fff'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#555'}}>
          {isMaximized
            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 0.5h7v7M0.5 2.5v7h7" stroke="currentColor" strokeWidth="1.2"/></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1.2"/></svg>
          }
        </button>
        <button style={btn} onClick={()=>ipc.close()}
          onMouseEnter={e=>{e.currentTarget.style.background='#e81123';e.currentTarget.style.color='#fff'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#555'}}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Home view ────────────────────────────────────────────────────────────────
// ── Home album card with right-click menu ─────────────────────────────────────
function HomeAlbumCard({ session, album, onClick, fetchSongs, showToast }) {
  const [hovered, setHovered] = useState(false)
  const { openMenu } = useMenuStore()
  return (
    <div style={{ cursor:'pointer', transition:'transform 0.2s ease',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)' }}
      onClick={onClick}
      onContextMenu={e=>{ e.preventDefault(); e.stopPropagation(); openMenu({ type:'album', x:e.clientX, y:e.clientY, album, session, onOpen:onClick, fetchSongs, showToast }) }}
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
    >
      <div style={{ transition:'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'scale(1.02)' : 'scale(1)',
        boxShadow: hovered ? '0 12px 32px rgba(0,0,0,0.5)' : 'none',
        borderRadius:'12px',
      }}>
        {album.ImageTags?.Primary
          ? <img src={imgUrl(session, album.Id, 135)} alt="" style={{ width:'100%', aspectRatio:'1', borderRadius:'12px', objectFit:'cover', display:'block' }}/>
          : <div style={{ width:'100%', aspectRatio:'1', borderRadius:'12px', background:'var(--accent-dim)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem' }}>♪</div>
        }
      </div>
      <div style={{ marginTop:'8px', fontSize:'0.91rem', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{album.Name}</div>
      <div style={{ fontSize:'0.81rem', color:'#666', marginTop:'2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{album.AlbumArtist||'—'}</div>
    </div>
  )
}
// ── Home Song Card (Quick Pick) ──────────────────────────────────────────────
function QuickPickCard({ session, song, onClick, onContextMenu }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        borderRadius: '10px', cursor: 'pointer',
        transition: 'background 0.15s ease, transform 0.2s ease, box-shadow 0.2s ease',
        border: '1px solid rgba(255,255,255,0.04)',
        transform: hovered ? 'scale(1.02)' : 'scale(1)',
        boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.35)' : 'none',
      }}
    >
      <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
        <img src={imgUrl(session, song.ImageTags?.Primary ? song.Id : (song.AlbumId || song.Id), 80)} alt="" style={{ width: '100%', height: '100%', borderRadius: '6px', objectFit: 'cover' }} />
        {hovered && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.Name}</div>
        <div style={{ fontSize: '0.78rem', color: '#777', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.AlbumArtist || 'Unknown Artist'}</div>
      </div>
    </div>
  )
}

// ── Home Artist Card ─────────────────────────────────────────────────────────
function HomeArtistCard({ session, artist, onClick, onContextMenu }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ textAlign: 'center', cursor: 'pointer' }}
    >
      <div style={{
        width: '100%', aspectRatio: '1', borderRadius: '12px', overflow: 'hidden', marginBottom: '10px',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
        background: 'rgba(255,255,255,0.05)',
      }}>
        {artist.ImageTags?.Primary
          ? <img src={imgUrl(session, artist.Id, 135)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', color: '#333' }}>👤</div>
        }
      </div>
      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: hovered ? 'var(--accent)' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.15s' }}>
        {artist.Name}
      </div>
    </div>
  )
}

function HomeView({ session, username, allSongs, albums, artists, recent, recentlyPlayed, topSongs, topArtists, onSelectAlbum, onSelectArtist, onSelectPlaylist, fetchSongs, showToast }) {
  const { playSong, toggleShuffle, shuffle } = usePlayerStore()
  const { openMenu } = useMenuStore()
  const [quickPicksRef]  = useAutoAnimate({ duration: 350, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' })
  const [jumpBackRef]    = useAutoAnimate({ duration: 350, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' })
  const [topArtistsRef]  = useAutoAnimate({ duration: 350, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' })
  const [recentRef]      = useAutoAnimate({ duration: 350, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' })

  const handleShuffleAll = () => {
    if (!allSongs.length) return
    if (!shuffle) toggleShuffle()
    playSong(allSongs, Math.floor(Math.random() * allSongs.length))
  }

  const sectionTitleStyle = {
    fontSize: '0.97rem', fontWeight: 600, color: '#666', letterSpacing: '0.5px',
    textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'
  }

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '6px', letterSpacing: '-0.5px' }}>What's up, {username}? 👋</h2>
        <p style={{ color: '#777', fontSize: '0.89rem', marginBottom: '20px' }}>
          {plural(allSongs.length, 'song')} · {plural(albums.length, 'album')} · {plural(artists.length, 'artist')}
        </p>
        {allSongs.length > 0 && (
          <button onClick={handleShuffleAll} style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'var(--accent)', border: 'none', borderRadius: '12px',
            color: '#fff', padding: '10px 22px', fontSize: '0.93rem', fontWeight: 600,
            boxShadow: '0 0 20px var(--accent-glow), 0 4px 12px rgba(0,0,0,0.4)',
            cursor: 'pointer', transition: 'background 0.15s, transform 0.1s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-hover)'; e.currentTarget.style.boxShadow = '0 0 28px var(--accent-glow), 0 4px 16px rgba(0,0,0,0.5)'; e.currentTarget.style.transform = 'scale(1.04)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 20px var(--accent-glow), 0 4px 12px rgba(0,0,0,0.4)'; e.currentTarget.style.transform = 'scale(1)' }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            Shuffle All
          </button>
        )}
      </div>

      {/* Quick Picks */}
      {topSongs.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h3 style={sectionTitleStyle}>Quick Picks</h3>
          <div ref={quickPicksRef} data-autogrid style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {topSongs.map(song => (
              <QuickPickCard
                key={song.Id}
                session={session}
                song={song}
                onClick={() => playSong([song], 0)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openMenu({ type: 'song', x: e.clientX, y: e.clientY, song, index: 0 }) }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Jump Back In */}
      {recentlyPlayed.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h3 style={sectionTitleStyle}>Jump Back In</h3>
          <div ref={jumpBackRef} data-autogrid style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '18px' }}>
            {recentlyPlayed.map(item => (
              <HomeAlbumCard
                key={item.Id}
                session={session}
                album={item}
                onClick={() => {
                  if (item.Type === 'Playlist') onSelectPlaylist(item)
                  else onSelectAlbum(item)
                }}
                fetchSongs={fetchSongs}
                showToast={showToast}
              />
            ))}
          </div>
        </div>
      )}

      {/* Top Artists */}
      {topArtists.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h3 style={sectionTitleStyle}>Your Top Artists</h3>
          <div ref={topArtistsRef} data-autogrid style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '18px' }}>
            {topArtists.map(artist => (
              <HomeArtistCard
                key={artist.Id}
                session={session}
                artist={artist}
                onClick={() => onSelectArtist(artist)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openMenu({ type: 'homeArtist', x: e.clientX, y: e.clientY, artist, onOpen: () => onSelectArtist(artist) }) }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recently Added */}
      {recent.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h3 style={sectionTitleStyle}>Recently Added</h3>
          <div ref={recentRef} data-autogrid style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '18px' }}>
            {recent.map(album => (
              <HomeAlbumCard key={album.Id} session={session} album={album}
                onClick={() => onSelectAlbum(album)} fetchSongs={fetchSongs} showToast={showToast} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Global menu renderer ─────────────────────────────────────────────────────
function GlobalMenuRenderer({ session, playlists, onAddToPlaylist, onNewPlaylist, showToast, fetchAlbumSongs, favoriteIds, onToggleFavorite }) {
  const { menu, closeMenu } = useMenuStore()
  if (!menu) return null

  if (menu.type === 'album') {
    return (
      <AlbumContextMenu
        x={menu.x} y={menu.y}
        album={menu.album} session={menu.session || session}
        onClose={closeMenu}
        onOpen={()=>{ closeMenu(); menu.onOpen?.() }}
        fetchSongs={menu.fetchSongs || ((id) => fetchAlbumSongs(session, id))}
        showToast={menu.showToast || showToast}
      />
    )
  }

  if (menu.type === 'song') {
    return (
      <ContextMenu
        x={menu.x} y={menu.y}
        song={menu.song}
        playlists={playlists || []}
        session={session}
        favoriteIds={favoriteIds}
        onToggleFavorite={onToggleFavorite}
        onAddToPlaylist={onAddToPlaylist}
        onNewPlaylist={onNewPlaylist}
        showToast={showToast}
      />
    )
  }

  if (menu.type === 'homeArtist') {
    return (
      <MenuShell x={menu.x} y={menu.y} minWidth={160}>
        <CtxMenuItem label="Open" onClick={() => { closeMenu(); menu.onOpen?.() }} icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>} />
      </MenuShell>
    )
  }

  return null
}

// ── FLIP animation hook for grid items ───────────────────────────────────────
// Records item positions before a layout change, then animates from old→new.
function useFlipGrid(containerRef) {
  const snapshots = useRef(null)

  const before = () => {
    const container = containerRef.current
    if (!container) return
    const items = container.querySelectorAll('[data-autogrid] > *')
    const map = new Map()
    items.forEach(el => {
      const r = el.getBoundingClientRect()
      map.set(el, { x: r.left, y: r.top })
    })
    snapshots.current = map
  }

  const after = () => {
    const map = snapshots.current
    if (!map) return
    snapshots.current = null
    const container = containerRef.current
    if (!container) return
    const items = container.querySelectorAll('[data-autogrid] > *')

    // Collect movers with their new screen positions
    const movers = []
    items.forEach(el => {
      const old = map.get(el)
      if (!old) return
      const r = el.getBoundingClientRect()
      const dx = old.x - r.left
      const dy = old.y - r.top
      if (dx === 0 && dy === 0) return
      movers.push({ el, dx, dy, newTop: r.top })
    })

    if (!movers.length) return

    // Snap all movers to old positions before any paint.
    // Also force-clear any hover transform by resetting to neutral state —
    // this prevents the hover translateY from compositing with the FLIP transform.
    movers.forEach(({ el, dx, dy }) => {
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      el.setAttribute('data-flipping', '1')
    })

    // Stagger by ROW not by item — all items in the same row move together.
    // This keeps the wave effect without making late items wait too long.
    const DURATION    = 220  // ms per item transition
    const ROW_STAGGER = 18   // ms between each row starting

    // Group movers into rows by their new Y position (within 4px tolerance)
    const rows = []
    movers.forEach(mover => {
      const row = rows.find(r => Math.abs(r.y - mover.newTop) < 4)
      if (row) { row.items.push(mover) }
      else      { rows.push({ y: mover.newTop, items: [mover] }) }
    })
    rows.sort((a, b) => a.y - b.y)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rows.forEach(({ items }, rowIndex) => {
          const delay = rowIndex * ROW_STAGGER
          items.forEach(({ el }) => {
            el.style.transition = `transform ${DURATION}ms cubic-bezier(0.25,0,0.2,1) ${delay}ms`
            el.style.transform = ''
            // transitionend cleans up; setTimeout is a safety net so
            // data-flipping can never get stuck blocking clicks
            const cleanup = () => {
              el.style.transition = ''
              el.removeAttribute('data-flipping')
              el.removeEventListener('transitionend', cleanup)
            }
            el.addEventListener('transitionend', cleanup)
            setTimeout(cleanup, DURATION + delay + 50)
          })
        })
      })
    })
  }

  return { before, after }
}

// ── Library ──────────────────────────────────────────────────────────────────
function Library({ session: initialSession }) {
  const [session, setSession] = useState(initialSession)
  const sessionRef = useRef(initialSession)
  const [allSongs,    setAllSongs]    = useState([])
  const [albums,      setAlbums]      = useState([])
  const [artists,     setArtists]     = useState([])
  const [genres,      setGenres]      = useState([])
  const [playlists,   setPlaylists]   = useState([])
  const [recent,      setRecent]      = useState([])
  const [recentlyPlayed, setRecentlyPlayed] = useState([])
  const [topSongs,     setTopSongs]     = useState([])
  const [topArtists,   setTopArtists]   = useState([])
  const [favorites,   setFavorites]   = useState([])
  const [favoriteIds, setFavoriteIds] = useState(new Set())
  const [loading,     setLoading]     = useState(true)
  const [favLoading,  setFavLoading]  = useState(false)
  const [search,      setSearch]      = useState('')
  const [activeNav,   setActiveNav]   = useState('Home')
  const [exitingNav,  setExitingNav]  = useState(null)
  const navExitTimerRef = useRef(null)
  const [isMaximized,  setIsMaximized]  = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showQueue,    setShowQueue]    = useState(false)
  const [queueVisible, setQueueVisible] = useState(false) // drives CSS transition on main content

  // ── Backfill username if missing from stored session ─────────────────────────
  useEffect(() => {
    if (session.username) return
    fetchCurrentUser(session)
      .then(user => { if (user?.Name) setSession(s => ({ ...s, username: user.Name })) })
      .catch(() => {})
  }, [])

  // Theme
  const { accentColor, animations, closeBehavior } = useSettingsStore()
  useEffect(() => {
    const root = document.documentElement
    const hex = accentColor || '#a855f7'
    // Add color-scheme transition on first change, then set vars
    root.style.setProperty('--accent-transition', 'color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, fill 0.3s ease')
    root.style.setProperty('--accent', hex)
    root.style.setProperty('--accent-hover', lighten(hex))
    root.style.setProperty('--accent-dim', `rgba(${hexToRgb(hex)},0.15)`)
    root.style.setProperty('--accent-glow', `rgba(${hexToRgb(hex)},0.22)`)
    root.style.setProperty('--accent-border', `rgba(${hexToRgb(hex)},0.3)`)
    const [r,g,b] = hexToRgb(hex).split(',').map(Number)
    root.style.setProperty('--accent-fg', (0.299*r + 0.587*g + 0.114*b) > 160 ? '#000' : '#fff')
  }, [accentColor])
  useEffect(() => {
    document.body.classList.toggle('no-animations', !animations)
  }, [animations])
  useEffect(() => {
    ipc?.setCloseBehavior?.(closeBehavior)
  }, [closeBehavior])

  // Queue panel width — persisted to localStorage, draggable
  const [queueWidth, setQueueWidth] = useState(() => {
    const saved = localStorage.getItem('flacr:queueWidth')
    return saved ? Math.max(220, Math.min(500, parseInt(saved, 10))) : 300
  })
  const queueDragRef = useRef(null)
  const startDragQueue = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = queueWidth
    const onMove = (ev) => {
      const newW = Math.max(220, Math.min(500, startW - (ev.clientX - startX)))
      setQueueWidth(newW)
    }
    const onUp = (ev) => {
      const finalW = Math.max(220, Math.min(500, startW - (ev.clientX - startX)))
      localStorage.setItem('flacr:queueWidth', finalW)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [queueWidth])

  // Sidebar width — persisted to localStorage, draggable, retractable
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('flacr:sidebarWidth')
    return saved ? Math.max(68, Math.min(400, parseInt(saved, 10))) : 210
  })
  const sidebarWidthRef = useRef(sidebarWidth)
  useEffect(() => { sidebarWidthRef.current = sidebarWidth }, [sidebarWidth])

  const startDragSidebar = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidthRef.current
    // When starting from retracted (68px), treat it as if we're starting from 140
    // so any rightward movement immediately begins expanding
    const effectiveStartW = startW === 68 ? 140 : startW
    const onMove = (ev) => {
      let newW = effectiveStartW + (ev.clientX - startX)
      if (newW < 140) newW = 68
      else newW = Math.max(140, Math.min(400, newW))
      setSidebarWidth(newW)
    }
    const onUp = (ev) => {
      let finalW = effectiveStartW + (ev.clientX - startX)
      if (finalW < 140) finalW = 68
      else finalW = Math.max(140, Math.min(400, finalW))
      localStorage.setItem('flacr:sidebarWidth', finalW)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const isSidebarRetracted = sidebarWidth === 68

  const mainContentRef = useRef(null)

  const openQueue = () => {
    setShowQueue(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setQueueVisible(true)))
  }
  const closeQueue = () => {
    setQueueVisible(false)
    setTimeout(() => setShowQueue(false), 240)
  }
  const [showNowPlaying, setShowNowPlaying] = useState(false)
  const [npExiting,      setNpExiting]      = useState(false)
  const closeNowPlaying = useCallback(() => {
    setNpExiting(true)
    setTimeout(() => { setShowNowPlaying(false); setNpExiting(false) }, 300)
  }, [])
  const [showNewPlaylist, setShowNewPlaylist] = useState(false)
  const pendingSongRef = useRef(null)
  const [jumpSignal,   setJumpSignal]   = useState(0)

  const [servers,            setServers]            = useState(null)
  const [showAddServer,      setShowAddServer]      = useState(false)
  const [showQuickSwitch,    setShowQuickSwitch]    = useState(false)
  const [switchingServerId,  setSwitchingServerId]  = useState(null)

  const { showToast, ToastContainer } = useToast()

  // Drill-down (Dedicated tabs)
  const [selectedAlbum,  setSelectedAlbum]  = useState(null)
  const [albumSongs,     setAlbumSongs]     = useState([])
  const [albumLoading,   setAlbumLoading]   = useState(false)
  const [selectedArtist, setSelectedArtist] = useState(null)
  const [artistSongs,    setArtistSongs]    = useState([])
  const [artistLoading,  setArtistLoading]  = useState(false)
  const [selectedGenre,  setSelectedGenre]  = useState(null)
  const [genreSongs,     setGenreSongs]     = useState([])
  const [genreLoading,   setGenreLoading]   = useState(false)
  const [selectedPlaylist, setSelectedPlaylist] = useState(null)
  const [playlistSongs,    setPlaylistSongs]    = useState([])
  const [playlistLoading,  setPlaylistLoading]  = useState(false)

  // Drill-down (Home tab only — prevents mirroring/flashing when switching)
  const [homeDetail, setHomeDetail] = useState(null) // { type: 'album'|'artist'|'genre'|'playlist', item }
  const [homeDetailSongs, setHomeDetailSongs] = useState([])
  const [homeDetailLoading, setHomeDetailLoading] = useState(false)

  // Sort
  const { sort: songSort,   setSort: setSongSort,   showDropdown: showSongSort,   setShowDropdown: setShowSongSort   } = useSortPrefs(SONG_SORT_OPTIONS,   'song')
  const { sort: albumSort,  setSort: setAlbumSort,  showDropdown: showAlbumSort,  setShowDropdown: setShowAlbumSort  } = useSortPrefs(ALBUM_SORT_OPTIONS,  'album')
  const { sort: artistSort, setSort: setArtistSort, showDropdown: showArtistSort, setShowDropdown: setShowArtistSort } = useSortPrefs(ARTIST_SORT_OPTIONS, 'artist')

  const { togglePlay, next, prev, prevForce, queue, currentIndex, isPlaying } = usePlayerStore()

  // ── IPC ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ipc) return
    ipc.onMaximized(()=>setIsMaximized(true))
    ipc.onUnmaximized(()=>setIsMaximized(false))
    ipc.onEnterFullscreen(()=>setIsFullscreen(true))
    ipc.onLeaveFullscreen(()=>setIsFullscreen(false))
    ipc.onTrayPlayPause(togglePlay)
    ipc.onTrayNext(next)
    ipc.onTrayPrev(prev)
    ipc.onTrayPrevForce(prevForce)
    return () => ['maximized','unmaximized','enter-fullscreen','leave-fullscreen',
      'tray-play-pause','tray-next','tray-prev','tray-prev-force']
      .forEach(ch=>ipc.removeAllListeners(ch))
  }, [])

  // Sync play state to tray
  useEffect(() => { ipc?.sendPlayerState(isPlaying) }, [isPlaying])

  // Keep refs so keyboard handler always has fresh values without re-registering
  const showQueueRef2      = useRef(showQueue)
  const closeQueueRef      = useRef(closeQueue)
  const showNowPlayingRef  = useRef(showNowPlaying)
  const closeNowPlayingRef = useRef(closeNowPlaying)
  useEffect(() => { showQueueRef2.current      = showQueue      }, [showQueue])
  useEffect(() => { closeQueueRef.current      = closeQueue     }, [closeQueue])
  useEffect(() => { showNowPlayingRef.current  = showNowPlaying }, [showNowPlaying])
  useEffect(() => { closeNowPlayingRef.current = closeNowPlaying}, [closeNowPlaying])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName.toLowerCase() === 'input') return
      if (e.code === 'Space')  { e.preventDefault(); togglePlay() }
      if (e.code === 'ArrowRight') { e.preventDefault(); next() }
      if (e.code === 'ArrowLeft')  { e.preventDefault(); prev() }
      if (e.key  === 'f' || e.key === 'F') {
        if (showNowPlayingRef.current) closeNowPlayingRef.current()
        else {
          const { queue: q, currentIndex: ci } = usePlayerStore.getState()
          if (q.length > 0 && ci >= 0) setShowNowPlaying(true)
        }
      }
      if (e.key  === 'q' || e.key === 'Q') {
        if (showQueueRef2.current) closeQueueRef.current()
        else openQueue()
      }
      if (e.key  === 'Escape') {
        if (showNowPlayingRef.current) closeNowPlayingRef.current()
        if (showQueueRef2.current) closeQueueRef.current()
        setShowAddServer(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, next, prev])

  useEffect(() => {
    const close = () => { setShowSongSort(false); setShowAlbumSort(false); setShowArtistSort(false); setShowQuickSwitch(false) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const loadLibrary = async (sess) => {
    const s = sess ?? sessionRef.current
    setLoading(true)
    try {
      const status = await verifySession(s)
      if (status === 'auth') {
        localStorage.removeItem(STORAGE_KEY)
        window.electronAPI?.clearSession?.()
        window.electronAPI?.saveServers?.({ activeServerId: null, servers: [] })
        window.location.reload()
        return
      }
      // Register token with main process so audio stream requests use header auth, not URL param
      window.electronAPI?.setAuthToken?.(s.token, s.serverUrl)
      const [songs, albs, arts, rec, favSongs, gens, pls, recPlayed, tSongs, tArts] = await Promise.all([
        fetchAllSongs(s), fetchAlbums(s),
        fetchArtists(s),  fetchRecentAlbums(s, 20),
        fetchFavoriteSongs(s), fetchGenres(s),
        fetchPlaylists(s), fetchRecentlyPlayed(s, 10),
        fetchTopItems(s, 'Audio,MusicVideo', 10), fetchTopItems(s, 'MusicArtist', 10)
      ])
      const sortedSongs = sortSongs(songs,'SortName','Ascending')
      setAllSongs(sortedSongs)
      restoreQueueFromLibrary(sortedSongs)
      setAlbums(albs); setArtists(arts); setRecent(rec)
      setRecentlyPlayed(recPlayed); setTopSongs(tSongs); setTopArtists(tArts)
      setFavorites(favSongs); setFavoriteIds(new Set(favSongs.map(x=>x.Id)))
      setGenres(gens); setPlaylists(pls)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const loadFavorites = async (sess) => {
    const s = sess ?? sessionRef.current
    setFavLoading(true)
    try { const favs = await fetchFavoriteSongs(s); setFavorites(favs); setFavoriteIds(new Set(favs.map(x=>x.Id))) }
    catch(e) { console.error(e) }
    setFavLoading(false)
  }


  useEffect(() => { loadLibrary(); hydrateSettingsFromFile() }, [])
  useEffect(() => { if (activeNav==='Favorites') loadFavorites() }, [activeNav])

  useEffect(() => {
    if (!ipc?.loadServers) return
    ipc.loadServers().then(data => { if (data) setServers(data) }).catch(() => {})
  }, [])

  useEffect(() => { sessionRef.current = session }, [session])




  const handleSelectHomeItem = async (item, type) => {
    setHomeDetail({ type, item })
    setHomeDetailLoading(true)
    try {
      const songs = type === 'album' ? await fetchAlbumSongs(session, item.Id)
                  : type === 'artist' ? await fetchArtistSongs(session, item.Id)
                  : type === 'genre' ? await fetchGenreSongs(session, item.Name)
                  : await fetchPlaylistSongs(session, item.Id)
      setHomeDetailSongs(songs)
    } catch(e){console.error(e)}
    setHomeDetailLoading(false)
  }

  const handleSelectAlbum = async (album) => {
    setSelectedAlbum(album); setAlbumLoading(true)
    try { setAlbumSongs(await fetchAlbumSongs(session, album.Id)) } catch(e){console.error(e)}
    setAlbumLoading(false)
  }
  const handleSelectArtist = async (artist) => {
    setSelectedArtist(artist); setArtistLoading(true)
    try { setArtistSongs(await fetchArtistSongs(session, artist.Id)) } catch(e){console.error(e)}
    setArtistLoading(false)
  }
  const handleSelectGenre = async (genre) => {
    setSelectedGenre(genre); setGenreLoading(true)
    try { setGenreSongs(await fetchGenreSongs(session, genre.Name)) } catch(e){console.error(e)}
    setGenreLoading(false)
  }
  const handleSelectPlaylist = async (pl) => {
    setSelectedPlaylist(pl); setPlaylistLoading(true)
    try { setPlaylistSongs(await fetchPlaylistSongs(session, pl.Id)) } catch(e){console.error(e)}
    setPlaylistLoading(false)
  }

  const handleToggleFavorite = useCallback(async (song) => {
    const isFav = favoriteIds.has(song.Id)
    try {
      await toggleFavoriteApi(session, song.Id, isFav)
      setFavoriteIds(prev=>{ const n=new Set(prev); isFav?n.delete(song.Id):n.add(song.Id); return n })
      if (activeNav==='Favorites')
        setFavorites(prev=>isFav?prev.filter(s=>s.Id!==song.Id):[...prev,song])
    } catch(e){console.error(e)}
  }, [favoriteIds, session, activeNav])

  const handleAddToPlaylist = useCallback(async (playlistId, song) => {
    try {
      // Check for duplicate — fetch current playlist songs first
      const existing = await fetchPlaylistSongs(session, playlistId)
      const isDuplicate = existing.some(s => s.Id === song.Id)
      if (isDuplicate) {
        const pl = playlists.find(p => p.Id === playlistId)
        showToast({ message: `${song.Name} is already in "${pl?.Name || 'this playlist'}"`, type: 'warning' })
        return
      }

      await addToPlaylist(session, playlistId, [song.Id])

      // Refresh playlist list so counts update
      const pls = await fetchPlaylists(session)
      setPlaylists(pls)

      // If this playlist is currently open, refresh its songs too
      if (selectedPlaylist?.Id === playlistId) {
        setPlaylistSongs(await fetchPlaylistSongs(session, playlistId))
      }

      const pl = playlists.find(p => p.Id === playlistId)
      showToast({ message: `Added ${song.Name} to "${pl?.Name || 'playlist'}"`, type: 'success' })
    } catch(e) {
      console.error(e)
      showToast({ message: 'Failed to add song to playlist', type: 'warning' })
    }
  }, [session, selectedPlaylist, showToast])

  const handleNewPlaylist = useCallback(async (name, songToAdd) => {
    try {
      const res = await createPlaylist(session, name)
      const newId = res?.Id
      if (songToAdd && newId) {
        await addToPlaylist(session, newId, [songToAdd.Id])
        showToast({ message: `${songToAdd.Name} added to "${name}"`, type: 'success' })
      }
      const pls = await fetchPlaylists(session)
      setPlaylists(pls)
    } catch(e){console.error(e)}
    setShowNewPlaylist(false)
  }, [session, showToast])

  const handleRemoveFromPlaylist = useCallback(async (song) => {
    if (!selectedPlaylist) return
    try {
      // Need the playlist entry ID (not the song ID) to remove
      const songs = await fetchPlaylistSongs(session, selectedPlaylist.Id)
      const entry = songs.find(s => s.Id === song.Id)
      if (!entry?.PlaylistItemId) return
      await removeFromPlaylist(session, selectedPlaylist.Id, [entry.PlaylistItemId])
      const refreshed = await fetchPlaylistSongs(session, selectedPlaylist.Id)
      setPlaylistSongs(refreshed)
      const pls = await fetchPlaylists(session)
      setPlaylists(pls)
      showToast({ message: `Removed ${song.Name} from playlist`, type: 'warning' })
    } catch(e) {
      console.error(e)
      showToast({ message: 'Failed to remove song', type: 'warning' })
    }
  }, [session, selectedPlaylist, showToast])

  const handleDeletePlaylist = useCallback(async () => {
    if (!selectedPlaylist) return
    try {
      await deletePlaylist(session, selectedPlaylist.Id)
      const pls = await fetchPlaylists(session)
      setPlaylists(pls)
      setSelectedPlaylist(null)
      setPlaylistSongs([])
      showToast({ message: `Deleted "${selectedPlaylist.Name}"`, type: 'warning' })
    } catch(e) {
      console.error(e)
      showToast({ message: 'Failed to delete playlist', type: 'warning' })
    }
  }, [session, selectedPlaylist, showToast])

  const handleDeletePlaylistById = useCallback(async (playlist) => {
    try {
      await deletePlaylist(session, playlist.Id)
      const pls = await fetchPlaylists(session)
      setPlaylists(pls)
      showToast({ message: `Deleted "${playlist.Name}"`, type: 'warning' })
    } catch(e) {
      console.error(e)
      showToast({ message: 'Failed to delete playlist', type: 'warning' })
    }
  }, [session, showToast])

  const handleSwitchServer = async (serverId) => {
    if (!servers || serverId === servers.activeServerId || switchingServerId) return
    const target = servers.servers.find(s => s.id === serverId)
    if (!target) return
    const newSession = { serverUrl: target.url, userId: target.userId, token: target.token, username: target.username || '', deviceId: target.deviceId || null }
    setSwitchingServerId(serverId)
    const status = await verifySession(newSession)
    setSwitchingServerId(null)
    setShowQuickSwitch(false)
    if (status === 'timeout') {
      showToast({ message: `Can't reach ${target.nickname || target.url} — check your connection`, type: 'error' })
      return
    }
    if (status === 'unreachable') {
      showToast({ message: `Server unreachable: ${target.nickname || target.url}`, type: 'error' })
      return
    }
    if (status === 'auth') {
      showToast({ message: 'Session expired — remove and re-add this server', type: 'warning' })
      return
    }
    const updated = { ...servers, activeServerId: serverId }
    setServers(updated)
    if (ipc?.saveServers) await ipc.saveServers(updated)
    // Reset library and drill-down state
    setAllSongs([]); setAlbums([]); setArtists([])
    setSelectedAlbum(null)
    setSelectedArtist(null)
    setActiveNav('Home')
    // Update session and reload library for the new server
    setSession(newSession)
    loadLibrary(newSession)
  }

  const handleRemoveServer = (serverId) => {
    if (!servers || serverId === servers.activeServerId) return
    const updated = { ...servers, servers: servers.servers.filter(s => s.id !== serverId) }
    setServers(updated)
    if (ipc?.saveServers) ipc.saveServers(updated)
  }

  const handleRenameServer = (serverId, name) => {
    if (!servers || !name.trim()) return
    const updated = { ...servers, servers: servers.servers.map(s => s.id === serverId ? { ...s, name: name.trim() } : s) }
    setServers(updated)
    if (ipc?.saveServers) ipc.saveServers(updated)
  }

  const handleAddServer = (newSession) => {
    const id = crypto.randomUUID()
    const newServer = { id, name: newSession.serverName || newSession.serverUrl, url: newSession.serverUrl,
                        userId: newSession.userId, token: newSession.token, username: newSession.username || '',
                        deviceId: newSession.deviceId || null }
    const updated = {
      activeServerId: servers?.activeServerId || id,
      servers: [...(servers?.servers || []), newServer],
    }
    setServers(updated)
    if (ipc?.saveServers) ipc.saveServers(updated)
    setShowAddServer(false)
  }

  const goToNav = useCallback((item) => {
    if (item === activeNav) return
    clearTimeout(navExitTimerRef.current)
    setExitingNav(activeNav)
    setActiveNav(item)
    navExitTimerRef.current = setTimeout(() => setExitingNav(null), 220)
  }, [activeNav])

  const navigateTo = (item) => {
    useMenuStore.getState().closeMenu(); goToNav(item); setSearch('')
  }
  const navigateToAlbum = (album) => { 
    useMenuStore.getState().closeMenu(); 
    if (activeNav === 'Home') handleSelectHomeItem(album, 'album')
    else { if (activeNav !== 'Albums') goToNav('Albums'); handleSelectAlbum(album) }
  }
  const navigateToArtist = (artist) => { 
    useMenuStore.getState().closeMenu(); 
    if (activeNav === 'Home') handleSelectHomeItem(artist, 'artist')
    else { if (activeNav !== 'Artists') goToNav('Artists'); handleSelectArtist(artist) }
  }

  // ── Memoised lists ────────────────────────────────────────────────────────
  const q = search.toLowerCase()
  const filtered = useMemo(()=>sortSongs(
    allSongs.filter(s=>s.Name?.toLowerCase().includes(q)||s.AlbumArtist?.toLowerCase().includes(q)||s.Album?.toLowerCase().includes(q)),
    songSort.option.sortBy, songSort.order), [allSongs,q,songSort])
  const filteredAlbums  = useMemo(()=>sortAlbums(albums.filter(a=>a.Name?.toLowerCase().includes(q)), albumSort.option.sortBy, albumSort.order), [albums,q,albumSort])
  const filteredArtists = useMemo(()=>sortByName(artists.filter(a=>a.Name?.toLowerCase().includes(q)), artistSort.order), [artists,q,artistSort])
  const filteredFavs    = useMemo(()=>favorites.filter(s=>s.Name?.toLowerCase().includes(q)||s.AlbumArtist?.toLowerCase().includes(q)), [favorites,q])
  const filteredGenres  = useMemo(()=>genres.filter(g=>g.Name?.toLowerCase().includes(q)), [genres,q])
  const filteredPlaylists = useMemo(()=>playlists.filter(p=>p.Name?.toLowerCase().includes(q)), [playlists,q])

  // Global search: songs matching query across entire library
  const globalResults = useMemo(()=>{
    if (!q || q.length < 2) return null
    return allSongs.filter(s=>s.Name?.toLowerCase().includes(q)||s.AlbumArtist?.toLowerCase().includes(q)||s.Album?.toLowerCase().includes(q)).slice(0,50)
  }, [allSongs, q])

  const countLabel = () => {
    if (q && globalResults) return `${globalResults.length} results`
    if (activeNav==='Songs') return plural(filtered.length,'track')
    if (activeNav==='Albums'&&!selectedAlbum) return plural(filteredAlbums.length,'album')
    if (activeNav==='Albums'&&selectedAlbum)  return plural(albumSongs.length,'track')
    if (activeNav==='Artists'&&!selectedArtist) return plural(filteredArtists.length,'artist')
    if (activeNav==='Artists'&&selectedArtist)  return plural(artistSongs.length,'track')
    if (activeNav==='Genres'&&!selectedGenre) return plural(filteredGenres.length,'genre')
    if (activeNav==='Genres'&&selectedGenre)  return plural(genreSongs.length,'track')
    if (activeNav==='Playlists'&&!selectedPlaylist) return plural(filteredPlaylists.length,'playlist')
    if (activeNav==='Playlists'&&selectedPlaylist)  return plural(playlistSongs.length,'track')
    if (activeNav==='Home')      return ''   // shown in the "What's up" subtitle already
    if (activeNav==='Favorites') return plural(filteredFavs.length,'track')
    return ''
  }

  const shared = { session, favoriteIds, onToggleFavorite: handleToggleFavorite }
  const contextProps = { playlists, onAddToPlaylist: handleAddToPlaylist, onNewPlaylist: (song) => { pendingSongRef.current = song ?? null; setShowNewPlaylist(true) }, showToast }
  const playlistDetailContextProps = { ...contextProps, playlists: playlists.filter(p => p.Id !== selectedPlaylist?.Id), emptyPlaylistLabel: 'No other playlists' }

  // ── Tab transition style ──────────────────────────────────────────────────
  const panel = (active, name) => {
    const exiting = name && exitingNav === name
    return {
      display: (!loading && active) || exiting ? 'flex' : 'none',
      flexDirection: 'column', flex:1, overflow:'hidden',
      padding: '16px 0 16px 28px', marginRight: '20px',
      animation: exiting ? 'pageFadeOut 0.18s ease both' : active ? 'fadeUp 0.22s ease both' : 'none',
      ...(exiting ? { position:'absolute', inset:0, pointerEvents:'none' } : {}),
    }
  }
  const scrollPanel = (active, name) => {
    const exiting = name && exitingNav === name
    return {
      display: (!loading && active) || exiting ? 'block' : 'none',
      flex:1, overflowY: exiting ? 'hidden' : 'auto', overflowX:'hidden',
      padding: '16px 8px 16px 28px', marginRight: '20px',
      scrollbarGutter: 'stable',
      animation: exiting ? 'pageFadeOut 0.18s ease both' : active ? 'fadeUp 0.22s ease both' : 'none',
      ...(exiting ? { position:'absolute', inset:0, pointerEvents:'none' } : {}),
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#0a0a0a', color:'#fff', position:'relative', overflow:'hidden' }}>

      {/* Ambient glow — soft layered blobs, no visible edges */}
      <div style={{
        position:'fixed', top:'-30%', left:'-20%', width:'64vw', height:'64vw',
        pointerEvents:'none', zIndex:0,
        background:`radial-gradient(ellipse 60% 50% at 40% 40%, var(--accent-glow) 0%, transparent 70%)`,
        opacity:0.45,
        filter:'blur(40px)',
        animation: animations ? 'pulseGlow 8s ease-in-out infinite' : 'none',
        transition:'background 1s ease',
      }}/>

      <div style={{
        position:'fixed', bottom:'-5%', left:'50%', transform:'translateX(-50%)',
        width:'70vw', height:'40vh',
        pointerEvents:'none', zIndex:0,
        background:`radial-gradient(ellipse 80% 60% at 50% 80%, var(--accent-glow) 0%, transparent 70%)`,
        opacity:0.35,
        filter:'blur(60px)',
        transition:'background 1s ease',
      }}/>

      <TitleBar isMaximized={isMaximized} isFullscreen={isFullscreen}/>
      <GlobalMenuRenderer session={session} playlists={playlists} onAddToPlaylist={handleAddToPlaylist} onNewPlaylist={(song)=>{ pendingSongRef.current=song??null; setShowNewPlaylist(true) }} showToast={showToast} fetchAlbumSongs={fetchAlbumSongs} favoriteIds={favoriteIds} onToggleFavorite={handleToggleFavorite}/>
      {(showNowPlaying || npExiting) && <NowPlayingOverlay session={session} forceExit={npExiting} onClose={closeNowPlaying}/>}
      {showNewPlaylist && <NewPlaylistModal onConfirm={(name) => handleNewPlaylist(name, pendingSongRef.current)} onCancel={()=>{ pendingSongRef.current = null; setShowNewPlaylist(false) }}/>}

      <div style={{ display:'flex', flex:1, overflow:'hidden', position:'relative', zIndex:1 }}>
        {/* Sidebar — full height including titlebar area */}
        <div style={{ width: sidebarWidth, flexShrink:0, background:'rgba(14,14,14,1)',
          borderRight:'1px solid rgba(255,255,255,0.06)',
          display:'flex', flexDirection:'column', padding:'16px 0', position:'relative', zIndex:1,
          transition: isSidebarRetracted ? 'width 0.2s cubic-bezier(0.2,0,0,1)' : 'none',
        }}>
          <div style={{ padding: isSidebarRetracted ? '0 0 24px' : '0 20px 24px', textAlign: isSidebarRetracted ? 'center' : 'left' }}>
            {isSidebarRetracted ? (
              <>
                <span style={{ fontSize:'1.65rem', fontWeight:800, letterSpacing:'-1px' }}>f</span>
                <span style={{ fontSize:'1.65rem', fontWeight:800, color:'var(--accent)', textShadow:'0 0 20px var(--accent-glow)' }}>.</span>
              </>
            ) : (
              <>
                <span style={{ fontSize:'1.55rem', fontWeight:800, letterSpacing:'-1px' }}>flacr</span>
                <span style={{ fontSize:'1.55rem', fontWeight:800, color:'var(--accent)', textShadow:'0 0 20px var(--accent-glow)' }}>.</span>
              </>
            )}
          </div>

          {SIDEBAR_ITEMS.map(item=>(
            <div key={item} onClick={()=>navigateTo(item)} style={{
              padding:'9px 14px', cursor:'pointer', borderRadius:'8px', margin:'2px 8px',
              fontSize:'1rem', fontWeight: 500, // Fixed weight to prevent shifting
              color: activeNav===item ? '#fff' : '#555',
              background: activeNav===item ? 'var(--accent-dim)' : 'transparent',
              boxShadow: activeNav===item ? 'inset 0 0 20px var(--accent-glow)' : 'none',
              transition:'all 0.18s ease',
              display:'flex', alignItems:'center', gap:'10px',
              justifyContent: isSidebarRetracted ? 'center' : 'flex-start',
            }}
              title={isSidebarRetracted ? item : undefined}
              onMouseEnter={e=>{ if(activeNav!==item) { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#888'; if(!isSidebarRetracted) e.currentTarget.style.transform='translateX(2px)' } }}
              onMouseLeave={e=>{ if(activeNav!==item) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#555'; e.currentTarget.style.transform='translateX(0)' } }}
            >
              <span style={{ flexShrink:0, opacity: activeNav===item ? 1 : 0.6, display:'flex', alignItems:'center' }}>
                {NAV_ICONS[item]}
              </span>
              {!isSidebarRetracted && item}
            </div>
          ))}

          <div style={{ marginTop:'auto', padding:'4px 8px 12px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            {/* Settings button */}
            <div onClick={()=>navigateTo('Settings')} style={{
              padding:'9px 14px', cursor:'pointer', borderRadius:'8px', margin:'4px 0',
              fontSize:'1rem', fontWeight: 500, // Fixed weight to prevent shifting
              color: activeNav==='Settings' ? '#fff' : '#555',
              background: activeNav==='Settings' ? 'var(--accent-dim)' : 'transparent',
              boxShadow: activeNav==='Settings' ? 'inset 0 0 20px var(--accent-glow)' : 'none',
              transition:'all 0.18s ease',
              display:'flex', alignItems:'center', gap:'10px',
              justifyContent: isSidebarRetracted ? 'center' : 'flex-start',
            }}
              title={isSidebarRetracted ? 'Settings' : undefined}
              onMouseEnter={e=>{ if(activeNav!=='Settings') { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#888' } }}
              onMouseLeave={e=>{ if(activeNav!=='Settings') { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#555' } }}
            >
              <span style={{ flexShrink:0, opacity: activeNav==='Settings' ? 1 : 0.6, display:'flex', alignItems:'center' }}>
                {NAV_ICONS.Settings}
              </span>
              {!isSidebarRetracted && 'Settings'}
            </div>

            {/* Quick server switch */}
            {ipc && servers && servers.servers.length > 1 && (
              <div style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
                <div onClick={() => setShowQuickSwitch(p => !p)} style={{
                  padding:'9px 14px', cursor:'pointer', borderRadius:'8px', margin:'4px 0',
                  fontSize:'0.9rem', color: showQuickSwitch ? '#fff' : '#555',
                  background: showQuickSwitch ? 'rgba(255,255,255,0.06)' : 'transparent',
                  transition:'all 0.18s ease',
                  display:'flex', alignItems:'center', gap:'10px',
                  justifyContent: isSidebarRetracted ? 'center' : 'flex-start',
                }}
                  title={isSidebarRetracted ? 'Switch server' : undefined}
                  onMouseEnter={e=>{ if(!showQuickSwitch){ e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#888' } }}
                  onMouseLeave={e=>{ if(!showQuickSwitch){ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#555' } }}
                >
                  <span style={{ flexShrink:0, display:'flex', alignItems:'center', opacity: showQuickSwitch ? 1 : 0.6 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
                      <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
                    </svg>
                  </span>
                  {!isSidebarRetracted && <span style={{ flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {servers.servers.find(s => s.id === servers.activeServerId)?.name || 'Server'}
                  </span>}
                </div>
                {showQuickSwitch && (
                  <div style={{
                    position:'absolute', bottom:'calc(100% + 4px)', left:0, right:0, zIndex:200,
                    background:'#1a1a1a', border:'1px solid rgba(255,255,255,0.1)',
                    borderRadius:'10px', boxShadow:'0 -8px 32px rgba(0,0,0,0.6)', overflow:'hidden',
                    animation:'menuIn 0.16s cubic-bezier(0.4,0,0.2,1) both',
                  }}>
                    {servers.servers.map(srv => {
                      const isActive = srv.id === servers.activeServerId
                      const isConnecting = switchingServerId === srv.id
                      return (
                        <div key={srv.id}
                          onClick={() => { if (!switchingServerId && !isActive) handleSwitchServer(srv.id) }}
                          style={{
                            padding:'10px 14px', cursor: isActive || switchingServerId ? 'default' : 'pointer',
                            fontSize:'0.88rem', color: isActive ? 'var(--accent)' : isConnecting ? '#fff' : '#ccc',
                            background: isActive ? 'var(--accent-dim)' : isConnecting ? 'rgba(255,255,255,0.06)' : 'transparent',
                            display:'flex', alignItems:'center', gap:'10px',
                            transition:'background 0.12s',
                            borderBottom:'1px solid rgba(255,255,255,0.04)',
                          }}
                          onMouseEnter={e=>{ if(!isActive && !switchingServerId) e.currentTarget.style.background='rgba(255,255,255,0.06)' }}
                          onMouseLeave={e=>{ if(!isActive && !isConnecting) e.currentTarget.style.background='transparent' }}
                        >
                          <span style={{ flexShrink:0, opacity: isActive ? 1 : 0.4, display:'flex', color: isActive ? 'var(--accent)' : 'currentColor' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
                              <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
                            </svg>
                          </span>
                          <span style={{ flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{srv.name}</span>
                          {isActive && !isConnecting && <span style={{ fontSize:'0.7rem', color:'var(--accent)', fontWeight:600, flexShrink:0 }}>●</span>}
                          {isConnecting && <svg style={{ animation:'spin 0.8s linear infinite', flexShrink:0 }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Sign out */}
            <div onClick={async ()=>{
                const FLACR_KEYS = ['flacr_device_id','flacr_player_prefs','flacr_player_queue',
                  'flacr_settings','flacr_sort_prefs','flacr:queueWidth','flacr:npQueueWidth','flacr:sidebarWidth']
                FLACR_KEYS.forEach(k => localStorage.removeItem(k))
                sessionStorage.removeItem('flacr_session')
                await logoutSession(sessionRef.current)
                if (window.electronAPI?.clearSession) await window.electronAPI.clearSession()
                if (window.electronAPI?.saveServers) await window.electronAPI.saveServers({ activeServerId: null, servers: [] })
                window.location.reload()
              }}
              style={{
                padding:'9px 14px', cursor:'pointer', borderRadius:'8px', margin:'4px 0',
                fontSize:'0.9rem', color:'#555', transition:'all 0.18s ease',
                display:'flex', alignItems:'center', gap:'10px',
                justifyContent: isSidebarRetracted ? 'center' : 'flex-start',
              }}
              title={isSidebarRetracted ? 'Sign out' : undefined}
              onMouseEnter={e=>{ e.currentTarget.style.color='#ef4444'; e.currentTarget.style.background='rgba(239,68,68,0.08)' }}
              onMouseLeave={e=>{ e.currentTarget.style.color='#555'; e.currentTarget.style.background='transparent' }}
            >
              <span style={{ flexShrink:0, display:'flex', alignItems:'center', opacity:0.6 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </span>
              {!isSidebarRetracted && 'Sign out'}
            </div>
          </div>

          {/* Drag handle */}
          <div onMouseDown={startDragSidebar} style={{
            position:'absolute', top:0, right: isSidebarRetracted ? -4 : -2, bottom:0,
            width: isSidebarRetracted ? 8 : 4, cursor:'col-resize',
            background:'transparent', transition:'background 0.15s', zIndex:10
          }}
            onMouseEnter={e=>e.currentTarget.style.background='var(--accent-glow)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          />
        </div>

        {/* Main */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', background:'transparent' }}>
          {/* Toolbar — single unified strip */}
          <div style={{ padding:'8px 20px', borderBottom:'1px solid rgba(255,255,255,0.04)',
            background:'transparent',
            display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>

            {/* Unified search + sort + actions container */}
            <div style={{
              flex:1, display:'flex', alignItems:'stretch',
              background:'transparent',
              border:'none',
              borderRadius:'10px', overflow:'visible', height:30,
            }}>
              {/* Search input */}
              <div style={{ flex:1, display:'flex', alignItems:'center', position:'relative' }}>
                <svg style={{ position:'absolute', left:10, color:'#444', pointerEvents:'none', flexShrink:0 }}
                  width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text"
                  placeholder={`Search ${activeNav==='Home'?'your library':activeNav.toLowerCase()}...`}
                  value={search} onChange={e=>setSearch(e.target.value)}
                  style={{ width:'100%', height:'100%', padding:'0 10px 0 30px',
                    background:'transparent', border:'none', outline:'none',
                    color:'#fff', fontSize:'0.91rem' }}
                />
              </div>

              {/* Sort — shown as inline section when relevant */}
              {!q && (activeNav==='Songs' || (activeNav==='Albums'&&!selectedAlbum) || (activeNav==='Artists'&&!selectedArtist)) && (<>
                <div style={{ width:1, background:'rgba(255,255,255,0.06)', alignSelf:'stretch', margin:'5px 0', flexShrink:0 }}/>
                <div style={{ position:'relative' }} onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>{
                    if(activeNav==='Songs') setShowSongSort(p=>!p)
                    else if(activeNav==='Albums') setShowAlbumSort(p=>!p)
                    else if(activeNav==='Artists') setShowArtistSort(p=>!p)
                  }} style={{
                    height:'100%', background:'transparent', border:'none', color:'#666',
                    padding:'0 12px', cursor:'pointer', display:'flex', alignItems:'center',
                    gap:6, fontSize:'0.91rem', whiteSpace:'nowrap',
                    transition:'color 0.15s, background 0.15s',
                  }}
                    onMouseEnter={e=>{e.currentTarget.style.color='var(--accent)';e.currentTarget.style.background='var(--accent-dim)'}}
                    onMouseLeave={e=>{e.currentTarget.style.color='#666';e.currentTarget.style.background='transparent'}}
                  >
                    {activeNav==='Songs' ? `${songSort.option.label} ${songSort.order==='Ascending'?'↑':'↓'}`
                      : activeNav==='Albums' ? `${albumSort.option.label} ${albumSort.order==='Ascending'?'↑':'↓'}`
                      : `${artistSort.option.label} ${artistSort.order==='Ascending'?'↑':'↓'}`}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {/* Sort dropdown panels */}
                  {activeNav==='Songs'&&showSongSort&&<SortDropdown options={SONG_SORT_OPTIONS} current={songSort} show={showSongSort} onToggle={()=>setShowSongSort(p=>!p)} onSelectOption={opt=>{setSongSort({option:opt,order:opt.sortOrder});setShowSongSort(false)}} onToggleOrder={()=>setSongSort(p=>({...p,order:p.order==='Ascending'?'Descending':'Ascending'}))} dropOnly/>}
                  {activeNav==='Albums'&&!selectedAlbum&&showAlbumSort&&<SortDropdown options={ALBUM_SORT_OPTIONS} current={albumSort} show={showAlbumSort} onToggle={()=>setShowAlbumSort(p=>!p)} onSelectOption={opt=>{setAlbumSort({option:opt,order:opt.sortOrder});setShowAlbumSort(false)}} onToggleOrder={()=>setAlbumSort(p=>({...p,order:p.order==='Ascending'?'Descending':'Ascending'}))} dropOnly/>}
                  {activeNav==='Artists'&&!selectedArtist&&showArtistSort&&<SortDropdown options={ARTIST_SORT_OPTIONS} current={artistSort} show={showArtistSort} onToggle={()=>setShowArtistSort(p=>!p)} onSelectOption={opt=>{setArtistSort({option:opt,order:opt.sortOrder});setShowArtistSort(false)}} onToggleOrder={()=>setArtistSort(p=>({...p,order:p.order==='Ascending'?'Descending':'Ascending'}))} dropOnly/>}
                </div>
              </>)}

              <div style={{ width:1, background:'rgba(255,255,255,0.06)', alignSelf:'stretch', margin:'5px 0', flexShrink:0 }}/>

              {/* Jump to current — Songs only */}
              {activeNav==='Songs'&&!q&&(<>
                <button onClick={()=>setJumpSignal(p=>p+1)} title="Jump to playing song" style={{
                  height:'100%', background:'transparent', border:'none', color:'#555',
                  padding:'0 10px', cursor:'pointer', display:'flex', alignItems:'center',
                  transition:'color 0.15s, background 0.15s',
                }}
                  onMouseEnter={e=>{e.currentTarget.style.color='var(--accent)';e.currentTarget.style.background='var(--accent-dim)'}}
                  onMouseLeave={e=>{e.currentTarget.style.color='#555';e.currentTarget.style.background='transparent'}}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                  </svg>
                </button>
                <div style={{ width:1, background:'rgba(255,255,255,0.06)', alignSelf:'stretch', margin:'5px 0', flexShrink:0 }}/>
              </>)}


            </div>
          </div>

          {/* Content + Queue side by side */}
          <div style={{ flex:1, display:'flex', overflow:'hidden', position:'relative' }}>
            <div ref={mainContentRef} style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative',
              maxWidth: queueVisible ? `calc(100% - ${queueWidth + 4}px)` : '100%',
              transition: `max-width 0.24s cubic-bezier(0,0,0.2,1)`,
            }}>

              {loading && <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><LoadingMessage text="Loading your library..."/></div>}

              {/* Global search results */}
              {!loading && q && activeNav === 'Home' && globalResults && (
                <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:'0 0 0 28px', marginRight:'20px' }}>
                  <div style={{ fontSize:'0.93rem', color:'#555', textTransform:'uppercase', letterSpacing:'1px', padding:'16px 0 8px', flexShrink:0 }}>
                    Results across all tabs
                  </div>
                  <VirtualSongList songs={globalResults} {...shared} {...contextProps} jumpToCurrentSignal={0}/>
                </div>
              )}

              {/* Per-tab panels — hidden during global search */}
              {!(q && activeNav === 'Home') && <>
                <div style={homeDetail ? panel(!loading && activeNav==='Home', 'Home') : scrollPanel(!loading && activeNav==='Home', 'Home')}>
                  {homeDetail ? (
                    homeDetail.type === 'album' ? <AlbumDetail session={session} album={homeDetail.item} songs={homeDetailSongs} loading={homeDetailLoading} {...shared} {...contextProps} onBack={()=>setHomeDetail(null)} backLabel="Home" onSelectAlbum={album => handleSelectHomeItem(album, 'album')}/>
                    : homeDetail.type === 'artist' ? <ArtistDetail session={session} artist={homeDetail.item} songs={homeDetailSongs} loading={homeDetailLoading} {...shared} {...contextProps} onBack={()=>setHomeDetail(null)} backLabel="Home" onSelectAlbum={album => handleSelectHomeItem(album, 'album')}/>
                    : homeDetail.type === 'genre' ? <GenreDetail session={session} genre={homeDetail.item} songs={homeDetailSongs} loading={homeDetailLoading} {...shared} {...contextProps} onBack={()=>setHomeDetail(null)} backLabel="Home" onSelectAlbum={album => handleSelectHomeItem(album, 'album')}/>
                    : <PlaylistDetail session={session} playlist={homeDetail.item} songs={homeDetailSongs} loading={homeDetailLoading} {...shared} {...playlistDetailContextProps} onBack={()=>setHomeDetail(null)} onRemoveFromPlaylist={handleRemoveFromPlaylist} onDeletePlaylist={handleDeletePlaylist} backLabel="Home" onSelectAlbum={album => handleSelectHomeItem(album, 'album')}/>
                  ) : (
                    <HomeView
                      session={session}
                      username={session.username}
                      allSongs={allSongs}
                      albums={albums}
                      artists={artists}
                      recent={recent}
                      recentlyPlayed={recentlyPlayed}
                      topSongs={topSongs}
                      topArtists={topArtists}
                      onSelectAlbum={album => handleSelectHomeItem(album, 'album')}
                      onSelectArtist={artist => handleSelectHomeItem(artist, 'artist')}
                      onSelectPlaylist={pl => handleSelectHomeItem(pl, 'playlist')}
                      fetchSongs={(id)=>fetchAlbumSongs(session, id)}
                      showToast={showToast}
                    />
                  )}
                </div>
                <div style={{ ...panel(!loading && activeNav==='Songs', 'Songs'), padding:'0 0 0 28px' }}>
                  <VirtualSongList songs={filtered} {...shared} {...contextProps} jumpToCurrentSignal={jumpSignal}/>
                </div>
                <div style={selectedAlbum ? panel(!loading && activeNav==='Albums', 'Albums') : scrollPanel(!loading && activeNav==='Albums', 'Albums')}>
                  {selectedAlbum
                    ? <AlbumDetail session={session} album={selectedAlbum} songs={albumSongs} loading={albumLoading} {...shared} {...contextProps} onBack={()=>setSelectedAlbum(null)} backLabel="All Albums" onSelectAlbum={handleSelectAlbum}/>
                    : <AlbumGrid session={session} albums={filteredAlbums} onSelectAlbum={handleSelectAlbum} fetchSongs={(id)=>fetchAlbumSongs(session, id)} showToast={showToast}/>
                  }
                </div>
                <div style={selectedArtist ? panel(!loading && activeNav==='Artists', 'Artists') : scrollPanel(!loading && activeNav==='Artists', 'Artists')}>
                  {selectedArtist
                    ? <ArtistDetail session={session} artist={selectedArtist} songs={artistSongs} loading={artistLoading} {...shared} {...contextProps} onBack={()=>setSelectedArtist(null)} backLabel="All Artists" onSelectAlbum={handleSelectAlbum} onSelectArtist={handleSelectArtist}/>
                    : <ArtistGrid session={session} artists={filteredArtists} onSelectArtist={handleSelectArtist}/>
                  }
                </div>
                <div style={selectedGenre ? panel(!loading && activeNav==='Genres', 'Genres') : scrollPanel(!loading && activeNav==='Genres', 'Genres')}>
                  {selectedGenre
                    ? <GenreDetail genre={selectedGenre} songs={genreSongs} loading={genreLoading} {...shared} {...contextProps} onBack={()=>setSelectedGenre(null)}/>
                    : <GenreGrid genres={filteredGenres} onSelectGenre={handleSelectGenre}/>
                  }
                </div>
                <div style={selectedPlaylist ? panel(!loading && activeNav==='Playlists', 'Playlists') : scrollPanel(!loading && activeNav==='Playlists', 'Playlists')}>
                  {selectedPlaylist
                    ? <PlaylistDetail session={session} playlist={selectedPlaylist} songs={playlistSongs} loading={playlistLoading} {...shared} {...playlistDetailContextProps} onBack={()=>setSelectedPlaylist(null)} onRemoveFromPlaylist={handleRemoveFromPlaylist} onDeletePlaylist={handleDeletePlaylist} showToast={showToast} onPlaylistUpdated={async ()=>{ const pls = await fetchPlaylists(session); setPlaylists(pls); if(selectedPlaylist) { const updated = pls.find(p=>p.Id===selectedPlaylist.Id); if(updated) setSelectedPlaylist(updated) }}}/>
                    : <PlaylistGrid session={session} playlists={filteredPlaylists} onSelectPlaylist={handleSelectPlaylist} onNewPlaylist={()=>{ pendingSongRef.current = null; setShowNewPlaylist(true) }} onPlaylistUpdated={async ()=>{ const pls = await fetchPlaylists(session); setPlaylists(pls) }} onDeletePlaylist={handleDeletePlaylistById} showToast={showToast}/>
                  }
                </div>
                <div style={panel(!loading && activeNav==='Favorites', 'Favorites')}>
                  {favLoading ? <LoadingMessage text="Loading favorites..."/>
                    : !favorites.length
                      ? <div style={{ textAlign:'center', marginTop:'80px' }}>
                          <div style={{ fontSize:'2.5rem', marginBottom:'12px' }}>♡</div>
                          <div style={{ color:'#555', fontSize:'0.96rem' }}>No favorites yet — heart a song to add it here</div>
                        </div>
                      : <VirtualSongList songs={filteredFavs} {...shared} {...contextProps}/>
                  }
                </div>
              <div style={scrollPanel(!loading && activeNav==='Settings', 'Settings')}>
                  <SettingsView
                    servers={ipc && servers ? servers : null}
                    onSwitchServer={handleSwitchServer}
                    onRemoveServer={handleRemoveServer}
                    onRenameServer={handleRenameServer}
                    onAddServer={() => setShowAddServer(true)}
                    switchingServerId={switchingServerId}
                  />
                </div>
              </>}
            </div>

            {/* Queue panel — open: in flex flow (pushes content); exiting: absolute (slides out without holding space so FLIP runs correctly) */}
            {showQueue && (
              <div style={{
                display: 'flex', flexShrink: 0, overflow: 'hidden',
                width: queueVisible ? queueWidth + 4 : 0,
                transition: `width 0.24s cubic-bezier(0,0,0.2,1)`,
              }}>
                <div style={{
                  display: 'flex', flex: 1, minWidth: queueWidth + 4,
                  transform: queueVisible ? 'translateX(0)' : 'translateX(100%)',
                  transition: `transform 0.24s cubic-bezier(0,0,0.2,1)`,
                }}>
                  <div
                    onMouseDown={startDragQueue}
                    style={{
                      width:4, cursor:'col-resize', flexShrink:0,
                      background:'transparent', transition:'background 0.15s',
                      alignSelf:'stretch',
                    }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--accent-glow)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  />
                  <QueuePanel session={session} onClose={closeQueue} width={queueWidth}/>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Player session={session} onOpenNowPlaying={()=>setShowNowPlaying(true)} showQueue={queueVisible} onToggleQueue={()=>{ if(showQueue) closeQueue(); else openQueue() }}/>
      <ToastContainer/>

      {showAddServer && (
        <div style={{
          position:'fixed', inset:0, zIndex:500,
          background:'rgba(0,0,0,0.85)', backdropFilter:'blur(8px)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddServer(false) }}
        >
          <div style={{ position:'relative' }}>
            <button
              onClick={() => setShowAddServer(false)}
              style={{
                position:'absolute', top:'-36px', right:0,
                background:'transparent', border:'none', color:'#666',
                cursor:'pointer', fontSize:'0.93rem',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#666'}
            >Cancel</button>
            <Connect onAddServer={handleAddServer} />
          </div>
        </div>
      )}
    </div>
  )
}

export default Library
