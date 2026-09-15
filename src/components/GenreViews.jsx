import { plural } from '../utils/format'
import { BackButton, LoadingMessage, useBackTransition } from './ui'
import { VirtualSongList } from './VirtualSongList'
import usePlayerStore from '../store/playerStore'
import { useAutoAnimate } from '@formkit/auto-animate/react'

export function GenreGrid({ genres, onSelectGenre }) {
  const [animationParent] = useAutoAnimate({ duration: 350, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' })
  const colors = ['#7c3aed','#2563eb','#059669','#dc2626','#d97706','#0891b2','#9333ea','#16a34a']

  if (genres.length === 0) return (
    <div style={{ textAlign:'center', color:'#555', marginTop:'60px', fontSize:'0.96rem' }}>
      No genres found.
    </div>
  )

  return (
    <div ref={animationParent} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'20px' }}>
      {genres.map((genre, i) => (
        <div key={genre.Id || genre.Name}
          onClick={()=>onSelectGenre(genre)}
          style={{
            borderRadius:'12px', padding:'24px 20px', cursor:'pointer',
            background:`linear-gradient(135deg, ${colors[i % colors.length]}33, ${colors[i % colors.length]}18)`,
            border:`1px solid ${colors[i % colors.length]}44`,
            transition:'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow=`0 12px 32px ${colors[i % colors.length]}30` }}
          onMouseLeave={e=>{ e.currentTarget.style.transform='translateY(0) scale(1)'; e.currentTarget.style.boxShadow='none' }}
        >
          <div style={{ fontSize:'1.06rem', fontWeight:700, color:'#fff', marginBottom:'6px',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{genre.Name}</div>
          <div style={{ fontSize:'0.81rem', color:'rgba(255,255,255,0.4)' }}>
            {genre.ItemCounts?.SongCount ? plural(genre.ItemCounts.SongCount, 'song') : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

export function GenreDetail({ genre, songs, loading, favoriteIds, session, onToggleFavorite, onBack, playlists, onAddToPlaylist, onNewPlaylist }) {
  const { playSong, toggleShuffle, shuffle } = usePlayerStore()
  const { handleBack, exitStyle } = useBackTransition(onBack)
  const handleShuffle = () => {
    if (!songs.length) return
    if (!shuffle) toggleShuffle()
    playSong(songs, Math.floor(Math.random() * songs.length))
  }
  return (
    <div key={genre.Id} style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, animation:'fadeUp 0.3s ease both', ...exitStyle }}>
      <BackButton onClick={handleBack} label="All Genres"/>
      <div style={{ marginBottom:'24px' }}>
        <div style={{ fontSize:'0.81rem', color:'#555', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px' }}>Genre</div>
        <div style={{ fontSize:'1.85rem', fontWeight:800, marginBottom:'4px' }}>{genre.Name}</div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px', marginTop:'10px' }}>
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
              Shuffle Genre
            </button>
          )}
        </div>
      </div>
      {loading ? <LoadingMessage/> : <VirtualSongList songs={songs} session={session} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} playlists={playlists} onAddToPlaylist={onAddToPlaylist} onNewPlaylist={onNewPlaylist}/>}
    </div>
  )
}
