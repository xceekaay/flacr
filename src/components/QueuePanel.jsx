import { useRef, useState, useEffect } from 'react'
import usePlayerStore from '../store/playerStore'
import { imgUrl } from '../utils/api'
import { formatTicks, plural } from '../utils/format'
import { T } from './ui'

const ROW_H     = 52
const SECTION_H = 30
const OVERSCAN  = 5

function VirtualList({ items, renderItem, estimatedItemHeight = ROW_H }) {
  const containerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight]       = useState(400)
  const refCallback = (el) => {
    if (!el) return
    containerRef.current = el
    setHeight(el.clientHeight)
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height))
    ro.observe(el)
  }

  let totalHeight = 0
  const offsets = items.map(item => {
    const top = totalHeight
    totalHeight += item.height ?? estimatedItemHeight
    return top
  })

  const viewStart = scrollTop - OVERSCAN * estimatedItemHeight
  const viewEnd   = scrollTop + height + OVERSCAN * estimatedItemHeight
  const visibleItems = []
  for (let i = 0; i < items.length; i++) {
    const top = offsets[i]
    const bot = top + (items[i].height ?? estimatedItemHeight)
    if (bot < viewStart) continue
    if (top > viewEnd)   break
    visibleItems.push({ ...items[i], _top: top, _i: i })
  }

  return (
    <div ref={refCallback} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      style={{ flex:1, overflowY:'auto', position:'relative', minHeight:0 }}>
      <div style={{ height: totalHeight, position:'relative' }}>
        {visibleItems.map(item => (
          <div key={item.key} style={{ position:'absolute', top: item._top, left:0, right:0 }}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function QueuePanel({ session, onClose, width = 300 }) {
  const { queue, currentIndex, playHistory,
    removeFromQueue, moveInQueue, playSong, clearQueue } = usePlayerStore()

  const panelRef        = useRef(null)
  const dragRef         = useRef(null)   // mutable, no stale closure in listeners
  const itemsRef        = useRef([])     // kept current each render for onMove
  const listRef         = useRef(null)   // ref to the drag-mode list container
  const currentIndexRef = useRef(currentIndex)
  const [drag, setDrag] = useState(null)
  // drag: { fromQi, overQi, y, panelLeft, panelWidth, song }

  const nowPlaying = currentIndex >= 0 ? queue[currentIndex] : null
  const upcoming   = currentIndex >= 0 ? queue.slice(currentIndex + 1) : []
  const currentId  = nowPlaying?.Id
  const playedIds  = new Set(playHistory.filter(id => id !== currentId))
  const played     = queue.filter((s, i) => i !== currentIndex && playedIds.has(s.Id))

  const items = []
  if (queue.length > 0) {
    items.push({ type:'header', key:'h-now', height:SECTION_H, label:'Now Playing' })
    if (nowPlaying) items.push({ type:'song', key:`song-${currentIndex}`, height:ROW_H,
      song:nowPlaying, qi:currentIndex, isCurrent:true, dimmed:false })
    if (upcoming.length > 0) {
      items.push({ type:'header', key:'h-next', height:SECTION_H, label:`Up Next · ${upcoming.length}` })
      upcoming.forEach((song, i) => {
        const qi = currentIndex + 1 + i
        items.push({ type:'song', key:`song-${qi}`, height:ROW_H, song, qi, isCurrent:false, dimmed:false })
      })
    }
    if (played.length > 0) {
      items.push({ type:'header', key:'h-played', height:SECTION_H, label:'Previously Played' })
      played.forEach(song => {
        const qi = queue.findIndex(s => s.Id === song.Id)
        if (qi !== -1) items.push({ type:'song', key:`song-played-${song.Id}`, height:ROW_H,
          song, qi, isCurrent:false, dimmed:true })
      })
    }
  }
  itemsRef.current        = items
  currentIndexRef.current = currentIndex

  // Global pointer listeners — mounted once, reads from dragRef (no stale closures)
  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return
      // Determine overQi from cursor Y against original (unshifted) item positions.
      // This avoids elementFromPoint issues with CSS-transformed rows overlapping mid-drag.
      let overQi = dragRef.current.overQi
      const listEl = listRef.current
      if (listEl) {
        const { top } = listEl.getBoundingClientRect()
        const y = e.clientY - top + listEl.scrollTop
        const items = itemsRef.current
        let offset = 0
        let bestQi = dragRef.current.fromQi
        let bestDist = Infinity
        for (const item of items) {
          if (item.type === 'song' && item.qi !== currentIndexRef.current) {
            const dist = Math.abs(y - (offset + item.height / 2))
            if (dist < bestDist) { bestDist = dist; bestQi = item.qi }
          }
          offset += item.height
        }
        overQi = bestQi
      }
      const updated = { ...dragRef.current, overQi, y: e.clientY }
      dragRef.current = updated
      setDrag({ ...updated })
    }
    const onUp = () => {
      if (!dragRef.current) return
      const { fromQi, overQi } = dragRef.current
      if (fromQi !== overQi) moveInQueue(fromQi, overQi)
      dragRef.current = null
      setDrag(null)
      document.body.style.cursor = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
    }
  }, [moveInQueue])

  const startDrag = (e, qi, song) => {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = panelRef.current?.getBoundingClientRect()
    const d = { fromQi: qi, overQi: qi, y: e.clientY,
      panelLeft: rect?.left ?? 0, panelWidth: rect?.width ?? width, song }
    dragRef.current = d
    setDrag(d)
    document.body.style.cursor = 'grabbing'
  }

  // How far each song row should shift to open/close the gap
  const rowShift = (qi) => {
    if (!drag) return 0
    const { fromQi, overQi } = drag
    if (qi === fromQi) return (overQi - fromQi) * ROW_H
    if (fromQi < overQi && qi > fromQi && qi <= overQi) return -ROW_H
    if (fromQi > overQi && qi >= overQi && qi < fromQi) return  ROW_H
    return 0
  }

  const renderHeader = (item) => (
    <div key={item.key} style={{
      fontSize:'0.91rem', fontWeight:600, color:T.textDim,
      letterSpacing:'0.4px', textTransform:'uppercase',
      padding:'8px 16px 4px', height:SECTION_H, boxSizing:'border-box',
    }}>{item.label}</div>
  )

  const renderSongRow = (item, dragMode = false) => {
    const { song, qi, isCurrent, dimmed } = item
    const isDragging = drag?.fromQi === qi
    const isDropTarget = drag && drag.overQi === qi && drag.fromQi !== qi
    const shift = dragMode ? rowShift(qi) : 0
    return (
      <div
        key={item.key}
        data-qi={String(qi)}
        onDoubleClick={() => playSong(queue, qi)}
        style={{
          display:'flex', alignItems:'center', gap:'10px',
          padding:'8px 16px', height:ROW_H, boxSizing:'border-box',
          cursor: 'default',
          opacity: isDragging ? 0.15 : dimmed ? 0.35 : 1,
          background: isCurrent ? 'var(--accent-dim)' : 'transparent',
          transform: `translateY(${shift}px)`,
          transition: dragMode ? 'transform 0.16s cubic-bezier(0.2,0,0,1), opacity 0.1s' : 'background 0.12s',
          pointerEvents: isDragging ? 'none' : 'auto',
          borderTop: isDropTarget && drag.fromQi > drag.overQi
            ? '2px solid var(--accent)' : '2px solid transparent',
          borderBottom: isDropTarget && drag.fromQi < drag.overQi
            ? '2px solid var(--accent)' : '2px solid transparent',
          position: 'relative', zIndex: 1,
        }}
        onMouseEnter={e => { if (!isCurrent && !drag) e.currentTarget.style.background = T.bgHover }}
        onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent' }}
      >
        <div
          onPointerDown={e => !isCurrent && startDrag(e, qi, song)}
          style={{ color:'#3a3a3a', cursor: isCurrent ? 'default' : 'grab', flexShrink:0, fontSize:'0.91rem', touchAction:'none',
            transition:'color 0.12s', opacity: isCurrent ? 0.2 : 1 }}
          onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.color = '#666' }}
          onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.color = '#3a3a3a' }}
        >⠿</div>
        {(song.ImageTags?.Primary || song.AlbumId)
          ? <img src={imgUrl(session, song.ImageTags?.Primary ? song.Id : song.AlbumId, 36)} alt=""
              style={{ width:36, height:36, borderRadius:'8px', objectFit:'cover', flexShrink:0 }}/>
          : <div style={{ width:32, height:32, borderRadius:'7px', flexShrink:0,
              background:T.accentDim, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:'0.91rem', color:T.accent }}>♪</div>
        }
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.93rem', fontWeight:500,
            color: isCurrent ? 'var(--accent)' : '#d0d0d0',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{song.Name}</div>
          <div style={{ fontSize:'0.93rem', color:T.textDim, marginTop:1,
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{song.AlbumArtist||'—'}</div>
        </div>
        <div style={{ fontSize:'0.93rem', color:'#444', flexShrink:0 }}>{formatTicks(song.RunTimeTicks)}</div>
        <div onClick={e => { e.stopPropagation(); removeFromQueue(qi) }} style={{
          color:'#3a3a3a', cursor:'pointer', flexShrink:0,
          width:18, height:18, display:'flex', alignItems:'center', justifyContent:'center',
          borderRadius:'50%', transition:'color 0.12s, background 0.12s', fontSize:'0.97rem',
        }}
          onMouseEnter={e => { e.currentTarget.style.color='#ff453a'; e.currentTarget.style.background='rgba(255,69,58,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.color='#3a3a3a'; e.currentTarget.style.background='transparent' }}
        >✕</div>
      </div>
    )
  }

  const renderItem = (item) => item.type === 'header' ? renderHeader(item) : renderSongRow(item, false)

  // Ghost card clamped to panel bounds
  const panelRect  = panelRef.current?.getBoundingClientRect()
  const ghostTop   = drag && panelRect
    ? Math.max(panelRect.top, Math.min(panelRect.bottom - ROW_H, drag.y - ROW_H / 2))
    : 0

  return (
    <div ref={panelRef} style={{
      width, flexShrink:0,
      background:'rgba(14,14,14,1)',
      borderLeft:'1px solid rgba(255,255,255,0.07)',
      display:'flex', flexDirection:'column', overflow:'hidden',
      position:'relative',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,0.05)', flexShrink:0 }}>
        <div style={{ fontSize:'0.95rem', fontWeight:600, color:'#e8e8e8' }}>
          Queue<span style={{ color:T.textDim, fontWeight:400 }}> · {plural(queue.length, 'song')}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {queue.length > 0 && (
            <div onClick={clearQueue} style={{
              fontSize:'0.93rem', color:T.textDim, cursor:'pointer',
              padding:'3px 8px', borderRadius:'5px', border:`1px solid ${T.border}`,
              transition:'color 0.15s, border-color 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.color='#ff453a'; e.currentTarget.style.borderColor='rgba(255,69,58,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.color=T.textDim; e.currentTarget.style.borderColor=T.border }}
            >Clear all</div>
          )}
          <div onClick={onClose} style={{ color:T.textDim, cursor:'pointer',
            width:20, height:20, display:'flex', alignItems:'center', justifyContent:'center',
            borderRadius:'50%', fontSize:'0.93rem', transition:'color 0.15s, background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.background='rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.color=T.textDim; e.currentTarget.style.background='transparent' }}
          >✕</div>
        </div>
      </div>

      {queue.length === 0
        ? <div style={{ textAlign:'center', color:'#444', marginTop:'60px', fontSize:'0.93rem' }}>Queue is empty</div>
        : drag
          // Drag mode: plain list so every row gets displacement transforms
          ? <div ref={listRef} style={{ flex:1, overflowY:'auto', userSelect:'none' }}>
              {items.map(item => item.type === 'header' ? renderHeader(item) : renderSongRow(item, true))}
            </div>
          // Normal mode: virtualised
          : <VirtualList items={items} renderItem={renderItem} estimatedItemHeight={ROW_H}/>
      }

      {/* Ghost card — follows cursor, styled as lifted row */}
      {drag && drag.song && (
        <div style={{
          position:'fixed', top: ghostTop, left: drag.panelLeft,
          width: drag.panelWidth, height: ROW_H,
          zIndex: 9999, pointerEvents:'none',
          display:'flex', alignItems:'center', gap:'10px',
          padding:'8px 16px', boxSizing:'border-box',
          background:'rgba(26,26,36,0.97)',
          borderRadius:'8px',
          boxShadow:'0 16px 48px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)',
          transform:'scale(1.025)',
        }}>
          <div style={{ color:'var(--accent)', flexShrink:0, fontSize:'0.91rem' }}>⠿</div>
          {(drag.song.ImageTags?.Primary || drag.song.AlbumId)
            ? <img src={imgUrl(session, drag.song.ImageTags?.Primary ? drag.song.Id : drag.song.AlbumId, 36)} alt=""
                style={{ width:36, height:36, borderRadius:'8px', objectFit:'cover', flexShrink:0 }}/>
            : <div style={{ width:32, height:32, borderRadius:'7px', flexShrink:0,
                background:T.accentDim, display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:'0.91rem', color:T.accent }}>♪</div>
          }
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'0.93rem', fontWeight:500, color:'#fff',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{drag.song.Name}</div>
            <div style={{ fontSize:'0.93rem', color:T.textDim, marginTop:1,
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{drag.song.AlbumArtist||'—'}</div>
          </div>
          <div style={{ fontSize:'0.93rem', color:'#444', flexShrink:0 }}>{formatTicks(drag.song.RunTimeTicks)}</div>
        </div>
      )}
    </div>
  )
}
