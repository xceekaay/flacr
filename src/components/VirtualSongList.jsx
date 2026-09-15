import { useRef, useState, useEffect, useCallback } from 'react'
import usePlayerStore from '../store/playerStore'
import { formatTicks } from '../utils/format'
import { HeartButton, ItemImage, SongListHeader } from './ui'
import { ContextMenu } from './ContextMenu'
import useMenuStore from '../store/menuStore'

const ROW_HEIGHT = 53
const OVERSCAN   = 5

function SongRow({ song, index, songList, session, favoriteIds, onToggleFavorite, style, onContextMenu, showPlayCount }) {
  const { playSong, queue, currentIndex } = usePlayerStore()
  const isActive = queue[currentIndex]?.Id === song.Id

  return (
    <div
      onClick={() => playSong(songList, index)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, song, index) }}
      style={{
        ...style,
        display: 'grid',
        gridTemplateColumns: '32px 1fr 1fr 1fr 36px 60px',
        gap: '12px', padding: '8px 12px',
        borderRadius: '8px', alignItems: 'center', cursor: 'pointer', margin:'0 4px',
        background: isActive ? 'var(--accent-dim)' : 'transparent',
        borderLeft: 'none',
        transition: 'background 0.18s ease, box-shadow 0.18s ease',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.transform = 'translateX(1px)' } }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = isActive ? 'rgba(var(--accent-rgb,168,85,247),0.12)' : 'transparent' }}
    >
      <div style={{ color: isActive ? 'var(--accent)' : '#444', fontSize: '0.82rem' }}>
        {isActive ? '▶' : index + 1}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <ItemImage session={session} item={song} size={36} />
        <span style={{ fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isActive ? 'var(--accent)' : '#e8e8e8' }}>
          {song.Name}
        </span>
      </div>
      <div style={{ fontSize: '0.83rem', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.AlbumArtist || '—'}</div>
      <div style={{ fontSize: '0.83rem', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.Album || '—'}</div>
      <HeartButton isFav={favoriteIds.has(song.Id)} onClick={(e) => { e.stopPropagation(); onToggleFavorite(song) }}/>
      {showPlayCount
        ? <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
            {song.UserData?.PlayCount ?? 0}×
          </div>
        : <div style={{ fontSize: '0.81rem', color: '#555' }}>{formatTicks(song.RunTimeTicks)}</div>
      }
    </div>
  )
}

export function VirtualSongList({ songs, session, favoriteIds, onToggleFavorite, playlists, onAddToPlaylist, onNewPlaylist, onRemoveFromPlaylist, jumpToCurrentSignal, showToast, emptyPlaylistLabel, fixedHeight, showPlayCount }) {
  const containerRef   = useRef(null)
  const scrollRef      = useRef(null)
  const scrollAnimRef  = useRef(null)
  const instanceId     = useRef(crypto.randomUUID()).current
  const [scrollTop,       setScrollTop]       = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)
  const { openMenu, menu: globalMenu, closeMenu } = useMenuStore()

  const { queue, currentIndex } = usePlayerStore()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerHeight(entry.contentRect.height))
    ro.observe(el)
    setContainerHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // Jump to current song
  useEffect(() => {
    if (!jumpToCurrentSignal || !scrollRef.current) return
    const currentSong = queue[currentIndex]
    if (!currentSong) return
    const idx = songs.findIndex(s => s.Id === currentSong.Id)
    if (idx === -1) return
    const targetScroll = Math.max(0, idx * ROW_HEIGHT - containerHeight / 2 + ROW_HEIGHT / 2)
    const el    = scrollRef.current
    const start = el.scrollTop
    const dist  = targetScroll - start
    if (Math.abs(dist) < 2) return
    if (scrollAnimRef.current) scrollAnimRef.current.cancelled = true
    const token = { cancelled: false }
    scrollAnimRef.current = token
    const dur = 320
    const t0  = performance.now()
    const step = (now) => {
      if (token.cancelled) return
      const p    = Math.min((now - t0) / dur, 1)
      const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p
      el.scrollTop = start + dist * ease
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [jumpToCurrentSignal, containerHeight])

  const onScroll = useCallback((e) => setScrollTop(e.currentTarget.scrollTop), [])

  const totalHeight  = songs.length * ROW_HEIGHT
  const startIndex   = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex     = Math.min(songs.length - 1, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN)

  const visibleSongs = []
  for (let i = startIndex; i <= endIndex; i++) visibleSongs.push({ song: songs[i], index: i })

  const handleContextMenu = (e, song, index) => {
    openMenu({ type:'song', x: e.clientX, y: e.clientY, song, index, instanceId })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: fixedHeight ? `0 0 ${fixedHeight}px` : 1, height: fixedHeight ? fixedHeight : '100%', minHeight: 0 }}>
      <SongListHeader showPlayCount={showPlayCount} />
      <div ref={containerRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div ref={scrollRef} onScroll={onScroll} style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleSongs.map(({ song, index }) => (
              <SongRow
                key={song.Id}
                song={song} index={index} songList={songs}
                session={session} favoriteIds={favoriteIds}
                onToggleFavorite={onToggleFavorite}
                onContextMenu={handleContextMenu}
                showPlayCount={showPlayCount}
                style={{ position: 'absolute', top: index * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
              />
            ))}
          </div>
        </div>
      </div>
      {globalMenu?.type === 'song' && globalMenu.instanceId === instanceId && (
        <ContextMenu
          x={globalMenu.x} y={globalMenu.y}
          song={globalMenu.song} songList={songs} index={globalMenu.index}
          playlists={playlists || []}
          session={session}
          favoriteIds={favoriteIds}
          onToggleFavorite={onToggleFavorite}
          onAddToPlaylist={onAddToPlaylist}
          onNewPlaylist={(song)=>{ closeMenu(); onNewPlaylist?.(song) }}
          onRemoveFromPlaylist={onRemoveFromPlaylist ? () => { onRemoveFromPlaylist(globalMenu.song); closeMenu() } : undefined}
          showToast={showToast}
          emptyPlaylistLabel={emptyPlaylistLabel}
        />
      )}
    </div>
  )
}
