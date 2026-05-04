import { imgUrl } from '../utils/api'
import { useState, useCallback, useEffect } from 'react'

// ── Design tokens (JS mirrors of CSS vars) ───────────────────────────────────
export const T = {
  accent:       'var(--accent)',
  accentHover:  'var(--accent-hover)',
  accentDim:    'var(--accent-dim)',
  accentGlow:   'var(--accent-glow)',
  accentBorder: 'var(--accent-border)',
  bg:           '#0a0a0a',
  bgCard:       'rgba(255,255,255,0.04)',
  bgHover:      'rgba(255,255,255,0.06)',
  bgActive:     'rgba(255,255,255,0.08)',
  border:       'rgba(255,255,255,0.08)',
  borderLight:  'rgba(255,255,255,0.05)',
  text:         '#f0f0f0',
  textSub:      '#999',
  textDim:      '#555',
  radius:       '14px',
  radiusSm:     '10px',
  radiusXs:     '7px',
  transition:   'var(--transition)',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function glassStyle(extra = {}) {
  return {
    background: 'rgba(22,22,22,1)',
    border: '1px solid rgba(255,255,255,0.08)',
    ...extra,
  }
}

// ── Placeholder ──────────────────────────────────────────────────────────────
export function Placeholder({ size = 36, round = false }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: round ? '50%' : T.radiusXs,
      background: T.accentDim,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, color: T.accent,
    }}>♪</div>
  )
}

// ── ItemImage ────────────────────────────────────────────────────────────────
export function ItemImage({ session, item, size = 48, round = false, style = {} }) {
  const imageId = item.ImageTags?.Primary ? item.Id : (item.AlbumId || null)
  if (!imageId) return <Placeholder size={size} round={round} />
  return (
    <img
      src={imgUrl(session, imageId, size)}
      alt=""
      style={{
        width: size, height: size, flexShrink: 0, objectFit: 'cover',
        borderRadius: round ? '50%' : T.radiusXs,
        ...style,
      }}
      onError={(e) => (e.target.style.display = 'none')}
    />
  )
}

// ── HeartButton ──────────────────────────────────────────────────────────────
export function HeartButton({ isFav, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', borderRadius: T.radiusXs, flexShrink: 0,
        color: isFav ? '#ef4444' : T.textDim,
        transition: `color ${T.transition}, transform ${T.transition}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = isFav ? '#f87171' : '#888'
        e.currentTarget.style.transform = 'scale(1.2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = isFav ? '#ef4444' : T.textDim
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24"
        fill={isFav ? '#ef4444' : 'none'}
        stroke={isFav ? '#ef4444' : 'currentColor'} strokeWidth="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </div>
  )
}

// ── useBackTransition ─────────────────────────────────────────────────────────
export function useBackTransition(onBack) {
  const [exiting, setExiting] = useState(false)
  const handleBack = () => {
    setExiting(true)
    setTimeout(onBack, 220)
  }
  const exitStyle = exiting ? { animation: 'fadeDown 0.2s ease both' } : {}
  return { handleBack, exitStyle }
}

// ── BackButton ───────────────────────────────────────────────────────────────
export function BackButton({ onClick, label }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        color: T.accent, cursor: 'pointer', fontSize: '0.82rem',
        marginBottom: '20px', fontWeight: 500,
        transition: `color ${T.transition}, transform ${T.transition}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-hover)'; e.currentTarget.style.transform = 'translateX(-2px)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = T.accent; e.currentTarget.style.transform = 'translateX(0)' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </div>
  )
}

// ── SortDropdown ─────────────────────────────────────────────────────────────
export function SortDropdown({ options, current, onSelectOption, onToggleOrder, show, onToggle, dropOnly }) {
  const orderIcon = (ord) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      {ord === 'Ascending' ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
    </svg>
  )

  const panel = show && (
    <div style={{
      position: 'absolute', top: '110%', right: 0, zIndex: 100,
      background: '#1a1a1a',
      border: `1px solid ${T.border}`,
      borderRadius: T.radiusSm, padding: '5px', minWidth: '175px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.04)',
    }}>
      {options.map((opt) => {
        const isActive = current.option.label === opt.label
        return (
          <div key={opt.label}
            onClick={() => isActive ? onToggleOrder() : onSelectOption(opt)}
            style={{
              padding: '7px 11px', borderRadius: T.radiusXs, cursor: 'pointer',
              fontSize: '0.84rem',
              color: isActive ? T.accent : '#aaa',
              background: isActive ? T.accentDim : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: `background ${T.transition}, color ${T.transition}`,
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = T.bgHover }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
          >
            {opt.label}
            {isActive && orderIcon(current.order)}
          </div>
        )
      })}
    </div>
  )

  if (dropOnly) return <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>{panel}</div>

  return (
    <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button onClick={onToggle} style={{
        background: T.bgHover, border: `1px solid ${T.border}`,
        borderRadius: T.radiusXs, color: '#aaa', padding: '5px 11px',
        fontSize: '0.8rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '5px',
        transition: `background ${T.transition}`,
      }}>
        {current.option.label} {current.order === 'Ascending' ? '↑' : '↓'}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {panel}
    </div>
  )
}

// ── SongListHeader ───────────────────────────────────────────────────────────
export function SongListHeader({ showPlayCount }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr 1fr 1fr 36px 60px',
      gap: '12px', padding: '6px 12px 8px',
      fontSize: '0.7rem', fontWeight: 500, color: T.textDim,
      letterSpacing: '0.3px', marginBottom: '2px',
      borderBottom: `1px solid ${T.borderLight}`,
    }}>
      <div>#</div><div>Title</div><div>Artist</div><div>Album</div><div></div><div>{showPlayCount ? 'Plays' : 'Duration'}</div>
    </div>
  )
}

// ── LoadingMessage ───────────────────────────────────────────────────────────
export function LoadingMessage({ text = 'Loading...' }) {
  return (
    <div style={{ textAlign: 'center', color: T.textDim, marginTop: '80px', fontSize: '0.88rem' }}>
      {text}
    </div>
  )
}

// ── Toast notifications ───────────────────────────────────────────────────────
export function useToast() {
  const [toasts, setToasts] = useState([])
  const showToast = useCallback(({ message, type = 'info', duration = 3000 }) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])
  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  const configs = {
    info:    { bg: 'rgba(22,22,22,0.96)', border: 'rgba(255,255,255,0.1)',  icon: '●', iconColor: '#888' },
    success: { bg: 'rgba(22,22,22,0.96)', border: 'rgba(52,199,89,0.4)',   icon: '✓', iconColor: '#34c759' },
    warning: { bg: 'rgba(22,22,22,0.96)', border: 'rgba(255,159,10,0.4)',  icon: '!', iconColor: '#ff9f0a' },
    error:   { bg: 'rgba(22,22,22,0.96)', border: 'rgba(255,69,58,0.4)',   icon: '✕', iconColor: '#ff453a' },
  }

  const ToastContainer = () => (
    <div style={{ position:'fixed', bottom: 92, right: 20, zIndex: 9999,
      display:'flex', flexDirection:'column', gap:'8px', pointerEvents:'none' }}>
      {toasts.map(toast => {
        const c = configs[toast.type] || configs.info
        return (
          <div key={toast.id} style={{
            display:'flex', alignItems:'center', gap:'10px',
            background: c.bg, border: `1px solid ${c.border}`,
            borderRadius: '12px', padding: '10px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04)',

            pointerEvents:'auto', cursor:'pointer',
            animation:'toastIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
            maxWidth:'300px',
          }} onClick={() => dismiss(toast.id)}>
            <span style={{ color: c.iconColor, fontSize:'0.81rem', fontWeight:700, flexShrink:0,
              width:17, height:17, display:'flex', alignItems:'center', justifyContent:'center',
              background: `${c.iconColor}20`, borderRadius:'50%' }}>{c.icon}</span>
            <span style={{ fontSize:'0.97rem', color:'#ddd', lineHeight:'1.4' }}>{toast.message}</span>
          </div>
        )
      })}
    </div>
  )

  return { showToast, ToastContainer }
}
