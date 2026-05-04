import { useState, useRef, useEffect } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { imgUrl, fetchArtistAlbums, fetchAlbumSongs, fetchSimilar } from '../utils/api'
import { plural } from '../utils/format'
import { BackButton, LoadingMessage, ItemImage, useBackTransition } from './ui'
import { VirtualSongList } from './VirtualSongList'
import { AlbumDetail } from './AlbumViews'
import usePlayerStore from '../store/playerStore'
import useMenuStore from '../store/menuStore'

function ArtistCard({ session, artist, onClick, onContextMenu }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ cursor:'pointer', textAlign:'center', transition:'transform 0.2s ease',
      transform: hovered ? 'translateY(-3px)' : 'translateY(0)' }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ opacity: hovered ? 0.88 : 1, transition:'opacity 0.2s ease, transform 0.2s ease',
        transform: hovered ? 'scale(1.02)' : 'scale(1)' }}>
        {artist.ImageTags?.Primary
          ? <img src={imgUrl(session, artist.Id, 140)} alt=""
              style={{ width:'100%', aspectRatio:'1', borderRadius:'14px', objectFit:'cover' }}/>
          : <div style={{ width:'100%', aspectRatio:'1', borderRadius:'14px',
              background:'var(--accent-dim)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 24 24" fill="var(--accent)" style={{ width:'45%', height:'45%', opacity:0.45 }}>
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
        }
        <div style={{ marginTop:'10px', fontSize:'0.93rem', fontWeight:600 }}>{artist.Name}</div>
      </div>
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

function SimilarArtistsRow({ session, artistId, onSelectArtist, onHasSimilar }) {
  const [similar, setSimilar] = useState([])
  useEffect(() => {
    let active = true
    fetchSimilar(session, artistId, 10).then(items => {
      if (!active) return
      const filtered = items.filter(i => i.Type === 'MusicArtist')
      setSimilar(filtered)
      onHasSimilar?.(filtered.length > 0)
    })
    return () => { active = false }
  }, [artistId])
  if (similar.length === 0) return null
  return (
    <div style={{ display:'flex', gap:'16px', overflowX:'auto', paddingBottom:'8px' }}>
        {similar.map(artist => (
          <div key={artist.Id} onClick={() => onSelectArtist(artist)}
            style={{ cursor:'pointer', flexShrink:0, width:'100px', textAlign:'center' }}
          >
            {artist.ImageTags?.Primary
              ? <img src={imgUrl(session, artist.Id, 100)} alt=""
                  style={{ width:'100px', height:'100px', borderRadius:'12px', objectFit:'cover' }}/>
              : <div style={{ width:'100px', height:'100px', borderRadius:'12px',
                  background:'var(--accent-dim)', display:'flex', alignItems:'center',
                  justifyContent:'center' }}>
                  <svg viewBox="0 0 24 24" fill="var(--accent)" style={{ width:'45%', height:'45%', opacity:0.45 }}>
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
            }
            <div style={{ fontSize:'0.78rem', color:'#ccc', marginTop:'8px',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {artist.Name}
            </div>
          </div>
        ))}
    </div>
  )
}

export function ArtistGrid({ session, artists, onSelectArtist }) {
  const [animationParent] = useAutoAnimate({ duration: 250, easing: 'ease-in-out' })
  const { openMenu } = useMenuStore()

  if (artists.length === 0) return (
    <div style={{ textAlign:'center', color:'#555', marginTop:'60px', fontSize:'0.96rem' }}>
      No artists found.
    </div>
  )

  return (
    <div ref={animationParent} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(135px, 1fr))', gap:'20px' }}>
      {artists.map(artist => (
        <ArtistCard key={artist.Id} session={session} artist={artist}
          onClick={() => onSelectArtist(artist)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openMenu({ type: 'homeArtist', x: e.clientX, y: e.clientY, artist, onOpen: () => onSelectArtist(artist) }) }}
        />
      ))}
    </div>
  )
}

function ArtistAlbumCard({ session, album, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ cursor:'pointer', transition:'transform 0.2s ease',
      transform: hovered ? 'translateY(-3px)' : 'translateY(0)' }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ opacity: hovered ? 0.88 : 1, transition:'opacity 0.2s ease, transform 0.2s ease',
        transform: hovered ? 'scale(1.01)' : 'scale(1)' }}>
        {album.ImageTags?.Primary
          ? <img src={imgUrl(session, album.Id, 200)} alt=""
              style={{ width:'100%', aspectRatio:'1', borderRadius:'12px', objectFit:'cover', display:'block' }}/>
          : <div style={{ width:'100%', aspectRatio:'1', borderRadius:'12px',
              background:'var(--accent-dim)', border:'1px solid var(--accent-border)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem' }}>♪</div>
        }
        <div style={{ marginTop:'10px', fontSize:'0.93rem', fontWeight:600,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{album.Name}</div>
        <div style={{ fontSize:'0.97rem', color:'#555', marginTop:'2px' }}>
          {album.ProductionYear || ''}
        </div>
      </div>
    </div>
  )
}

function ArtistAlbumList({ session, albums, onSelectAlbum }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
      {albums.map(album => (
        <div key={album.Id} onClick={() => onSelectAlbum(album)}
          style={{ display:'flex', alignItems:'center', gap:'12px', padding:'8px 10px',
            borderRadius:'8px', cursor:'pointer', transition:'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {album.ImageTags?.Primary
            ? <img src={imgUrl(session, album.Id, 48)} alt=""
                style={{ width:48, height:48, borderRadius:'6px', objectFit:'cover', flexShrink:0 }}/>
            : <div style={{ width:48, height:48, borderRadius:'6px', flexShrink:0,
                background:'var(--accent-dim)', display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:'1.2rem' }}>♪</div>
          }
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:'0.9rem', fontWeight:600, whiteSpace:'nowrap',
              overflow:'hidden', textOverflow:'ellipsis' }}>{album.Name}</div>
            <div style={{ fontSize:'0.8rem', color:'#555', marginTop:'2px' }}>
              {album.ProductionYear || ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ArtistAlbumGrid({ session, albums, onSelectAlbum }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(135px, 1fr))', gap:'20px', padding:'6px 2px 6px 2px' }}>
      {albums.map(album => (
        <ArtistAlbumCard key={album.Id} session={session} album={album} onClick={() => onSelectAlbum(album)}/>
      ))}
    </div>
  )
}

const TAB_STYLE = (active) => ({
  padding:'6px 16px', borderRadius:'8px', cursor:'pointer', fontSize:'0.91rem', fontWeight:600,
  background: active ? 'var(--accent-dim)' : 'transparent',
  color: active ? 'var(--accent)' : '#555',
  border: active ? '1px solid var(--accent-border)' : '1px solid transparent',
  transition:'all 0.15s',
})

export function ArtistDetail({
  session, artist, songs, loading,
  favoriteIds, onToggleFavorite,
  playlists, onAddToPlaylist, onNewPlaylist,
  onBack, backLabel, onSelectArtist,
}) {
  const [tab, setTab]               = useState('songs') // 'songs' | 'albums'
  const [albums, setAlbums]         = useState([])
  const [albumsLoading, setAlbumsLoading] = useState(false)
  const [selectedAlbum, setSelectedAlbum] = useState(null)
  const [albumSongs, setAlbumSongs] = useState([])
  const [albumSongsLoading, setAlbumSongsLoading] = useState(false)
  const [hasSimilar, setHasSimilar] = useState(false)
  const [similarOpen, setSimilarOpen] = useState(() => {
    try { return localStorage.getItem('flacr:similarOpen:artist') !== 'false' } catch { return true }
  })
  const [albumsContainerWidth, setAlbumsContainerWidth] = useState(9999)
  const albumsContainerRef = useRef(null)
  const loadedAlbumsForRef = useRef(null)
  const { playSong, toggleShuffle, shuffle } = usePlayerStore()
  const { handleBack, exitStyle } = useBackTransition(onBack)

  useEffect(() => {
    const el = albumsContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setAlbumsContainerWidth(entry.contentRect.width))
    ro.observe(el)
    setAlbumsContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [tab, albumsLoading])

  const toggleSimilar = () => {
    const next = !similarOpen
    setSimilarOpen(next)
    try { localStorage.setItem('flacr:similarOpen:artist', String(next)) } catch {}
  }

  // Reset album state when artist changes
  useEffect(() => {
    setAlbums([])
    setSelectedAlbum(null)
    setAlbumSongs([])
    setAlbumsContainerWidth(9999)
    loadedAlbumsForRef.current = null
  }, [artist.Id])

  // Fetch albums when tab switches to albums or artist changes
  useEffect(() => {
    if (tab !== 'albums' || loadedAlbumsForRef.current === artist.Id) return
    loadedAlbumsForRef.current = artist.Id
    setAlbumsLoading(true)
    fetchArtistAlbums(session, artist.Id)
      .then(setAlbums)
      .catch(console.error)
      .finally(() => setAlbumsLoading(false))
  }, [tab, artist.Id, session])

  const handleSelectAlbum = async (album) => {
    setSelectedAlbum(album)
    setAlbumSongsLoading(true)
    try { setAlbumSongs(await fetchAlbumSongs(session, album.Id)) } catch(e) { console.error(e) }
    setAlbumSongsLoading(false)
  }

  const handleShuffle = () => {
    if (!songs.length) return
    if (!shuffle) toggleShuffle()
    playSong(songs, Math.floor(Math.random() * songs.length))
  }

  // Drill into album from within artist page
  if (selectedAlbum) {
    return (
      <AlbumDetail
        session={session}
        album={selectedAlbum}
        songs={albumSongs}
        loading={albumSongsLoading}
        favoriteIds={favoriteIds}
        onToggleFavorite={onToggleFavorite}
        playlists={playlists}
        onAddToPlaylist={onAddToPlaylist}
        onNewPlaylist={onNewPlaylist}
        onBack={() => setSelectedAlbum(null)}
        backLabel={artist.Name}
        onSelectAlbum={handleSelectAlbum}
      />
    )
  }

  return (
    <div key={artist.Id} style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, animation:'fadeUp 0.3s ease both', ...exitStyle }}>
      {/* Header */}
      <BackButton onClick={handleBack} label={backLabel || 'All Artists'}/>
      <div style={{ display:'flex', gap:'24px', marginBottom:'20px', alignItems:'flex-end', flexShrink:0 }}>
        {artist.ImageTags?.Primary
          ? <img src={imgUrl(session, artist.Id, 140)} alt=""
              style={{ width:140, height:140, borderRadius:'10px', objectFit:'cover', flexShrink:0 }}/>
          : <div style={{ width:140, height:140, borderRadius:'10px', flexShrink:0,
              background:'var(--accent-dim)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 24 24" fill="var(--accent)" style={{ width:'45%', height:'45%', opacity:0.45 }}>
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
        }
        <div>
          <div style={{ fontSize:'0.81rem', color:'#555', textTransform:'uppercase',
            letterSpacing:'1px', marginBottom:'6px' }}>Artist</div>
          <div style={{ fontSize:'1.85rem', fontWeight:800, marginBottom:'4px' }}>{artist.Name}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginTop:'8px' }}>
            <div style={{ fontSize:'0.93rem', color:'#555' }}>{plural(songs.length, 'song')}</div>
            {songs.length > 0 && !loading && (
              <button onClick={handleShuffle} style={{
                display:'flex', alignItems:'center', gap:'7px',
                background:'var(--accent-dim)', border:'1px solid var(--accent-border)',
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
                Shuffle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'20px', flexShrink:0 }}>
        <button style={TAB_STYLE(tab==='songs')} onClick={() => setTab('songs')}>Songs</button>
        <button style={TAB_STYLE(tab==='albums')} onClick={() => setTab('albums')}>Albums</button>
      </div>

      {/* Content — songs tab: VirtualSongList owns scroll; albums tab: scrollable wrapper */}
      <div key={tab} style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', animation:'fadeUp 0.2s ease both' }}>
        {tab === 'songs' && (
          loading
            ? <LoadingMessage/>
            : <VirtualSongList
                songs={songs} session={session}
                favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite}
                playlists={playlists} onAddToPlaylist={onAddToPlaylist} onNewPlaylist={onNewPlaylist}
              />
        )}
        {tab === 'albums' && (
          albumsLoading
            ? <LoadingMessage/>
            : albums.length === 0
              ? <div style={{ color:'#555', marginTop:'40px', textAlign:'center' }}>No albums found</div>
              : <div ref={albumsContainerRef} style={{ flex:1, minHeight:0, overflowY:'auto' }}>
                  {albumsContainerWidth < 480
                    ? <ArtistAlbumList session={session} albums={albums} onSelectAlbum={handleSelectAlbum}/>
                    : <ArtistAlbumGrid session={session} albums={albums} onSelectAlbum={handleSelectAlbum}/>
                  }
                </div>
        )}
      </div>

      {onSelectArtist && (
        <div style={{ flexShrink:0, ...(!hasSimilar && { display:'none' }) }}>
          <button onClick={toggleSimilar} style={{
            display:'flex', alignItems:'center', gap:'6px', width:'100%',
            background:'none', border:'none', borderTop:'1px solid rgba(255,255,255,0.05)',
            cursor:'pointer', color:'#888', fontSize:'0.75rem', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'0.8px', padding:'12px 0 10px',
          }}>
            <span>Similar Artists</span>
            <ChevronIcon open={similarOpen}/>
          </button>
          <div style={{ display:'grid', gridTemplateRows: similarOpen ? '1fr' : '0fr', transition:'grid-template-rows 0.25s ease' }}>
            <div style={{ overflow:'hidden' }}>
              <SimilarArtistsRow
                session={session} artistId={artist.Id} onSelectArtist={onSelectArtist}
                onHasSimilar={setHasSimilar}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
