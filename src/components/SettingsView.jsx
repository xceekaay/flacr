import { useState, useRef, useEffect, useCallback } from 'react'
import useSettingsStore from '../store/settingsStore'
import usePlayerStore from '../store/playerStore'

const ACCENT_PRESETS = [
  { label:'Purple',  value:'#a855f7' },
  { label:'Blue',    value:'#3b82f6' },
  { label:'Cyan',    value:'#06b6d4' },
  { label:'Green',   value:'#22c55e' },
  { label:'Yellow',  value:'#eab308' },
  { label:'Orange',  value:'#f97316' },
  { label:'Red',     value:'#ef4444' },
  { label:'Pink',    value:'#ec4899' },
  { label:'Rose',    value:'#f43f5e' },
]

const SLEEP_OPTIONS = [
  { value: '0',    label: 'Off' },
  { value: 'song', label: 'After current song' },
  { value: '15',   label: '15 minutes' },
  { value: '30',   label: '30 minutes' },
  { value: '45',   label: '45 minutes' },
  { value: '60',   label: '60 minutes' },
  { value: '90',   label: '90 minutes' },
  { value: '120',  label: '120 minutes' },
]

const EQ_BANDS = ['32Hz','64Hz','125Hz','250Hz','500Hz','1kHz','2kHz','4kHz','8kHz','16kHz']

const EQ_PRESETS = {
  flat:      [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  rock:      [ 4,  3,  2,  0, -1,  0,  2,  3,  3,  2],
  pop:       [-1,  2,  4,  4,  2,  0, -1, -1, -1, -1],
  jazz:      [ 3,  2,  0,  2, -2, -2,  0,  1,  2,  3],
  classical: [ 4,  3,  2,  1,  0,  0,  0,  1,  2,  3],
  bass:      [ 6,  5,  4,  2,  0,  0,  0,  0,  0,  0],
  vocal:     [-2, -2,  0,  2,  4,  4,  2,  0, -1, -2],
}

const EQ_PRESET_OPTIONS = [
  { value: 'flat',      label: 'Flat'       },
  { value: 'rock',      label: 'Rock'       },
  { value: 'pop',       label: 'Pop'        },
  { value: 'jazz',      label: 'Jazz'       },
  { value: 'classical', label: 'Classical'  },
  { value: 'bass',      label: 'Bass Boost' },
  { value: 'vocal',     label: 'Vocal'      },
  { value: 'custom',    label: 'Custom'     },
]

// ── Custom dropdown (replaces native <select>) ──────────────────────────────
function CustomSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = options.find(o => o.value === value) || options[0]

  return (
    <div ref={ref} style={{ position:'relative', maxWidth:'300px' }}>
      <div onClick={() => setOpen(p => !p)} style={{
        padding:'10px 14px', borderRadius:'10px', cursor:'pointer',
        background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)',
        color: value !== '0' ? '#fff' : '#aaa', fontSize:'0.95rem',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        transition:'border-color 0.15s',
        borderColor: open ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
      }}>
        {selected.label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" style={{ opacity:0.5, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition:'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:100,
          background:'#1a1a1a', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px',
          boxShadow:'0 12px 40px rgba(0,0,0,0.6)', overflow:'hidden',
          animation:'scaleIn 0.12s ease both',
        }}>
          {options.map(opt => (
            <div key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{
                padding:'10px 14px', cursor:'pointer', fontSize:'0.93rem',
                color: opt.value === value ? 'var(--accent)' : '#ccc',
                background: opt.value === value ? 'var(--accent-dim)' : 'transparent',
                transition:'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = opt.value === value ? 'var(--accent-dim)' : 'rgba(255,255,255,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.background = opt.value === value ? 'var(--accent-dim)' : 'transparent' }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Update all accent CSS vars directly — used for lag-free live preview during drag
function setAccentCSSVars(hex) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  const lc = n => Math.min(255, n+20).toString(16).padStart(2,'0')
  const root = document.documentElement
  root.style.setProperty('--accent', hex)
  root.style.setProperty('--accent-hover', `#${lc(r)}${lc(g)}${lc(b)}`)
  root.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.15)`)
  root.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.22)`)
  root.style.setProperty('--accent-border', `rgba(${r},${g},${b},0.3)`)
  root.style.setProperty('--accent-fg', (0.299*r + 0.587*g + 0.114*b) > 160 ? '#000' : '#fff')
}

// ── Custom color picker popover ─────────────────────────────────────────────
function ColorPickerPopover({ color, onChange, onClose, isExiting }) {
  const canvasRef = useRef(null)
  const hueRef = useRef(null)
  const [hue, setHue] = useState(0)
  const [sat, setSat] = useState(100)
  const [val, setVal] = useState(100)
  const [hexInput, setHexInput] = useState(color)
  const draggingMain = useRef(false)
  const draggingHue = useRef(false)
  const popRef = useRef(null)
  const leaveTimeoutRef = useRef(null)
  // Tracks the latest color during drag; committed to store on mouseup
  const currentColorRef = useRef(color)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
  }

  const handleMouseLeave = () => {
    leaveTimeoutRef.current = setTimeout(() => {
      if (draggingMain.current || draggingHue.current) return
      onCloseRef.current()
    }, 800)
  }

  useEffect(() => {
    return () => {
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current)
    }
  }, [])

  // Parse initial color to HSV
  useEffect(() => {
    const r = parseInt(color.slice(1,3),16)/255
    const g = parseInt(color.slice(3,5),16)/255
    const b = parseInt(color.slice(5,7),16)/255
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min
    let h = 0
    if (d !== 0) {
      if (max === r) h = ((g-b)/d + (g<b?6:0)) * 60
      else if (max === g) h = ((b-r)/d + 2) * 60
      else h = ((r-g)/d + 4) * 60
    }
    const s = max === 0 ? 0 : (d/max)*100
    const v = max * 100
    setHue(h); setSat(s); setVal(v); setHexInput(color)
    currentColorRef.current = color
  }, [])

  // stopPropagation on the popover's mousedown prevents the outside-click handler
  // below from firing for clicks inside the picker, while still closing on outside clicks
  useEffect(() => {
    const handler = (e) => { if (popRef.current && !popRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const hsvToHex = useCallback((h,s,v) => {
    s /= 100; v /= 100
    const c = v * s, x = c * (1 - Math.abs((h/60)%2 - 1)), m = v - c
    let r,g,b
    if (h<60) { r=c;g=x;b=0 } else if (h<120) { r=x;g=c;b=0 }
    else if (h<180) { r=0;g=c;b=x } else if (h<240) { r=0;g=x;b=c }
    else if (h<300) { r=x;g=0;b=c } else { r=c;g=0;b=x }
    const toHex = n => Math.round((n+m)*255).toString(16).padStart(2,'0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }, [])

  // Draw gradient canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    const hueColor = hsvToHex(hue, 100, 100)
    const gradH = ctx.createLinearGradient(0,0,w,0)
    gradH.addColorStop(0, '#fff')
    gradH.addColorStop(1, hueColor)
    ctx.fillStyle = gradH
    ctx.fillRect(0,0,w,h)
    const gradV = ctx.createLinearGradient(0,0,0,h)
    gradV.addColorStop(0, 'rgba(0,0,0,0)')
    gradV.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = gradV
    ctx.fillRect(0,0,w,h)
  }, [hue, hsvToHex])

  const updateFromCanvas = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    const s = x * 100, v = (1 - y) * 100
    setSat(s); setVal(v)
    const hex = hsvToHex(hue, s, v)
    currentColorRef.current = hex
    setHexInput(hex)
    setAccentCSSVars(hex)
  }, [hue, hsvToHex])

  const updateHue = useCallback((e) => {
    const rect = hueRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const h = x * 360
    setHue(h)
    const hex = hsvToHex(h, sat, val)
    currentColorRef.current = hex
    setHexInput(hex)
    setAccentCSSVars(hex)
  }, [sat, val, hsvToHex])

  // RAF-throttled mousemove; commit to store on mouseup (not during drag)
  useEffect(() => {
    let rafId = null
    const onMove = (e) => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (draggingMain.current) updateFromCanvas(e)
        if (draggingHue.current) updateHue(e)
      })
    }
    const onUp = () => {
      draggingMain.current = false
      draggingHue.current = false
      if (rafId) { cancelAnimationFrame(rafId); rafId = null }
      onChangeRef.current(currentColorRef.current)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [updateFromCanvas, updateHue])

  return (
    <div ref={popRef}
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position:'absolute', top:'calc(100% + 8px)', left:0, zIndex:200,
        background:'#1a1a1a', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'14px',
        padding:'16px', width:'260px', boxShadow:'0 16px 48px rgba(0,0,0,0.7)',
        animation: isExiting ? 'scaleOut 0.12s ease both' : 'scaleIn 0.12s ease both',
      }}>
      {/* Saturation / Value canvas */}
      <canvas ref={canvasRef} width={228} height={140}
        style={{ width:'100%', height:'140px', borderRadius:'8px', cursor:'crosshair', display:'block' }}
        onMouseDown={(e) => { draggingMain.current = true; updateFromCanvas(e) }}
      />
      {/* Indicator */}
      <div style={{
        position:'absolute', top: 16 + (1 - val/100)*140 - 7, left: 16 + (sat/100)*228 - 7,
        width:14, height:14, borderRadius:'50%', border:'2px solid #fff',
        boxShadow:'0 0 4px rgba(0,0,0,0.5)', pointerEvents:'none',
      }}/>
      {/* Hue slider */}
      <div ref={hueRef}
        style={{
          marginTop:'12px', height:'14px', borderRadius:'7px', cursor:'pointer',
          background:'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        }}
        onMouseDown={(e) => { draggingHue.current = true; updateHue(e) }}
      >
        <div style={{
          position:'relative', top:-1, left: `calc(${(hue/360)*100}% - 8px)`,
          width:16, height:16, borderRadius:'50%', border:'2px solid #fff',
          boxShadow:'0 0 4px rgba(0,0,0,0.5)', pointerEvents:'none',
          background: hsvToHex(hue, 100, 100),
        }}/>
      </div>
      {/* Hex input */}
      <div style={{ display:'flex', gap:'8px', marginTop:'12px', alignItems:'center' }}>
        <div style={{
          width:32, height:32, borderRadius:'8px', flexShrink:0,
          background: hexInput, border:'1px solid rgba(255,255,255,0.15)',
        }}/>
        <input
          value={hexInput}
          onChange={(e) => {
            const v = e.target.value
            setHexInput(v)
            if (/^#[0-9a-fA-F]{6}$/.test(v)) {
              currentColorRef.current = v
              setAccentCSSVars(v)
              onChangeRef.current(v)
            }
          }}
          style={{
            flex:1, padding:'6px 10px', fontSize:'0.9rem', fontFamily:'monospace',
            background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)',
            borderRadius:'8px', color:'#fff', outline:'none',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
        />
      </div>
    </div>
  )
}

const Toggle = ({ label, desc, value, onChange, isLast }) => (
  <div style={{
    display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'16px',
    marginBottom: isLast ? 0 : '20px',
    paddingBottom: isLast ? 0 : '20px',
    borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
  }}>
    <div>
      <div style={{ fontSize:'1rem', color:'#fff', fontWeight:500 }}>{label}</div>
      {desc && <div style={{ fontSize:'0.9rem', color:'#888', marginTop:'4px' }}>{desc}</div>}
    </div>
    <div onClick={onChange} style={{ width:44, height:24, borderRadius:'99px', flexShrink:0, cursor:'pointer', marginTop:'2px',
      background: value ? 'var(--accent)' : 'rgba(255,255,255,0.12)', position:'relative', transition:'background 0.2s' }}>
      <div style={{ position:'absolute', top:3, borderRadius:'50%', width:18, height:18, background:'#fff',
        left: value ? 23 : 3, transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
    </div>
  </div>
)

function CollapsibleSection({ title, open, onToggle, children }) {
  const contentRef = useRef(null)
  const [displayHeight, setDisplayHeight] = useState(open ? 'auto' : 0)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    const el = contentRef.current
    if (!el) return
    if (open) {
      const h = el.scrollHeight
      setDisplayHeight(h)
      const t = setTimeout(() => setDisplayHeight('auto'), 260)
      return () => clearTimeout(t)
    } else {
      const h = el.scrollHeight
      setDisplayHeight(h)
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setDisplayHeight(0))
      )
      return () => cancelAnimationFrame(id)
    }
  }, [open])

  return (
    <div style={{ marginBottom:'40px' }}>
      <button onClick={onToggle} style={{
        display:'flex', alignItems:'center', gap:'6px', width:'100%',
        background:'none', border:'none', cursor:'pointer', padding:0,
        marginBottom: open ? '20px' : '0px', transition:'margin-bottom 0.25s ease',
      }}>
        <span style={{ fontSize:'1.2rem', fontWeight:600, color:'var(--accent)' }}>{title}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition:'transform 0.18s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink:0, marginTop:2 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div ref={contentRef} style={{
        height: displayHeight,
        overflow: displayHeight === 'auto' ? 'visible' : 'hidden',
        transition: typeof displayHeight === 'number' ? 'height 0.25s ease' : 'none',
      }}>
        {children}
      </div>
    </div>
  )
}

const ServerIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
    <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
  </svg>
)

export function SettingsView({ servers, onSwitchServer, onRemoveServer, onRenameServer, onAddServer, switchingServerId }) {
  const { normalize, crossfade, gapless, accentColor, animations, closeBehavior, discordRPC, updateChecker, autoUpdate, eq, set } = useSettingsStore()
  const { setSleepTimer, sleepTimer } = usePlayerStore()
  const [appVersion, setAppVersion] = useState(null)
  const [launchAtStartup, setLaunchAtStartup] = useState(false)
  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then(v => setAppVersion(v)).catch(() => {})
    window.electronAPI?.getStartup?.().then(v => setLaunchAtStartup(!!v)).catch(() => {})
  }, [])
  const [sleepValue, setSleepValue] = useState(() => {
    // Sync initial state from the store
    if (!sleepTimer) return '0'
    if (sleepTimer === 'song') return 'song'
    // It's a timestamp — figure out closest remaining minutes
    const remaining = Math.max(0, Math.ceil((sleepTimer - Date.now()) / 60000))
    if (remaining <= 0) return '0'
    // Find closest option
    const closest = [15,30,45,60,90,120].reduce((prev, curr) =>
      Math.abs(curr - remaining) < Math.abs(prev - remaining) ? curr : prev
    )
    return String(closest)
  })

  useEffect(() => {
    if (!sleepTimer) { setSleepValue('0'); return }
    if (sleepTimer === 'song') { setSleepValue('song'); return }
    const remaining = Math.max(0, Math.ceil((sleepTimer - Date.now()) / 60000))
    if (remaining <= 0) { setSleepValue('0'); return }
    const closest = [15,30,45,60,90,120].reduce((prev, curr) =>
      Math.abs(curr - remaining) < Math.abs(prev - remaining) ? curr : prev
    )
    setSleepValue(String(closest))
  }, [sleepTimer])
  // ── Update status ──────────────────────────────────────────────────────────
  // { type: 'checking'|'available'|'not-available'|'downloading'|'downloaded'|'error', version?, percent?, message? }
  const [updateStatus, setUpdateStatus] = useState(null)

  useEffect(() => {
    const ipc = window.electronAPI
    if (!ipc?.onUpdateStatus) return
    ipc.onUpdateStatus(setUpdateStatus)
    if (updateChecker) ipc.checkForUpdates?.()
    return () => ipc.removeAllListeners?.('update-status')
  }, [])

  const [editingServerId,   setEditingServerId]   = useState(null)
  const [editingServerName, setEditingServerName] = useState('')
  const [shortcutsOpen,  setShortcutsOpen]  = useState(false)
  const [serversOpen,    setServersOpen]    = useState(true)
  const [appearanceOpen, setAppearanceOpen] = useState(true)
  const [playbackOpen,   setPlaybackOpen]   = useState(true)
  const [equalizerOpen,  setEqualizerOpen]  = useState(true)
  const [systemOpen,     setSystemOpen]     = useState(true)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pickerExiting, setPickerExiting] = useState(false)

  const closeColorPicker = useCallback(() => {
    setPickerExiting(true)
    setTimeout(() => {
      setShowColorPicker(false)
      setPickerExiting(false)
    }, 120)
  }, [])

  const handleSleepChange = (val) => {
    setSleepValue(val)
    setSleepTimer(val === 'song' ? 'song' : +val)
  }

  return (
    <div style={{ paddingBottom:'60px' }}>

      {servers && (
        <CollapsibleSection title="Servers" open={serversOpen} onToggle={() => setServersOpen(o => !o)}>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {servers.servers.map(srv => {
              const isActive = srv.id === servers.activeServerId
              const isConnecting = switchingServerId === srv.id
              return (
                <div key={srv.id} style={{
                  display:'flex', alignItems:'center', gap:'12px',
                  padding:'12px 14px', borderRadius:'10px',
                  background: isActive ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isActive ? 'var(--accent-border)' : 'rgba(255,255,255,0.07)'}`,
                  transition:'background 0.15s',
                }}>
                  <span style={{ flexShrink:0, opacity: isActive ? 1 : 0.45, color: isActive ? 'var(--accent)' : 'currentColor', display:'flex' }}>
                    <ServerIcon/>
                  </span>
                  {editingServerId === srv.id ? (
                    <input autoFocus value={editingServerName}
                      onChange={e => setEditingServerName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { onRenameServer?.(srv.id, editingServerName); setEditingServerId(null) }
                        if (e.key === 'Escape') setEditingServerId(null)
                      }}
                      onBlur={() => { if (editingServerName.trim()) onRenameServer?.(srv.id, editingServerName); setEditingServerId(null) }}
                      style={{ flex:1, background:'rgba(255,255,255,0.08)', border:'1px solid var(--accent-border)',
                        borderRadius:'6px', color:'#fff', fontSize:'0.92rem', padding:'4px 8px', outline:'none' }}
                    />
                  ) : (
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'0.92rem', fontWeight: 500, color: isActive ? '#fff' : '#aaa',
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{srv.name}</div>
                      <div style={{ fontSize:'0.78rem', color:'#888', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{srv.url}</div>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                    {!isActive && (
                      <button onClick={() => { if (!switchingServerId) onSwitchServer?.(srv.id) }}
                        disabled={!!switchingServerId}
                        style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid rgba(255,255,255,0.1)',
                          background: isConnecting ? 'var(--accent-dim)' : 'transparent',
                          color: isConnecting ? 'var(--accent)' : '#888',
                          borderColor: isConnecting ? 'var(--accent-border)' : 'rgba(255,255,255,0.1)',
                          fontSize:'0.8rem', cursor: switchingServerId ? 'default' : 'pointer', transition:'all 0.12s',
                          display:'flex', alignItems:'center', gap:'5px', minWidth:'58px', justifyContent:'center' }}
                        onMouseEnter={e => { if (!switchingServerId) { e.currentTarget.style.background='var(--accent-dim)'; e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.borderColor='var(--accent-border)' } }}
                        onMouseLeave={e => { if (!isConnecting) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#888'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)' } }}
                      >
                        {isConnecting
                          ? <><svg style={{ animation:'spin 0.8s linear infinite' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2a10 10 0 0 1 10 10"/></svg> Connecting</>
                          : 'Switch'}
                      </button>
                    )}
                    {isActive && <span style={{ fontSize:'0.75rem', color:'var(--accent)', fontWeight:600, padding:'4px 10px' }}>Active</span>}
                    <button onClick={() => { setEditingServerId(srv.id); setEditingServerName(srv.name) }}
                      title="Rename"
                      style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid rgba(255,255,255,0.08)',
                        background:'transparent', color:'#666', fontSize:'0.8rem', cursor:'pointer', transition:'all 0.12s', lineHeight:1 }}
                      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.color='#aaa' }}
                      onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#666' }}
                    ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                    {!isActive && (
                      <button onClick={() => onRemoveServer?.(srv.id)}
                        title="Remove"
                        style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid rgba(255,255,255,0.08)',
                          background:'transparent', color:'#666', fontSize:'0.8rem', cursor:'pointer', transition:'all 0.12s', lineHeight:1 }}
                        onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.1)'; e.currentTarget.style.color='#ef4444'; e.currentTarget.style.borderColor='rgba(239,68,68,0.3)' }}
                        onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#666'; e.currentTarget.style.borderColor='rgba(255,255,255,0.08)' }}
                      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                    )}
                  </div>
                </div>
              )
            })}
            <button onClick={onAddServer}
              style={{ padding:'10px 14px', borderRadius:'10px', border:'1px dashed rgba(255,255,255,0.15)',
                background:'transparent', color:'#555', fontSize:'0.9rem', cursor:'pointer',
                display:'flex', alignItems:'center', gap:'8px', transition:'all 0.15s', width:'100%' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent-border)'; e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.background='var(--accent-dim)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; e.currentTarget.style.color='#555'; e.currentTarget.style.background='transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Server
            </button>
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Appearance" open={appearanceOpen} onToggle={() => setAppearanceOpen(o => !o)}>
        <>
          <div style={{ marginBottom:'20px', paddingBottom:'20px', borderBottom:'1px solid rgba(255,255,255,0.05)', position:'relative' }}>
            <div style={{ fontSize:'1rem', color:'#fff', fontWeight:500, marginBottom:'14px' }}>Accent Color</div>
            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'center' }}>
              {ACCENT_PRESETS.map(p => (
                <div key={p.value} onClick={() => set('accentColor', p.value)}
                  title={p.label}
                  style={{
                    width:32, height:32, borderRadius:'50%', cursor:'pointer',
                    background: p.value,
                    boxShadow: accentColor === p.value
                      ? `0 0 0 3px #0e0e0e, 0 0 0 5px ${p.value}, 0 0 16px ${p.value}80`
                      : 'none',
                    transition:'box-shadow 0.15s, transform 0.15s',
                    transform: accentColor === p.value ? 'scale(1.1)' : 'scale(1)',
                  }}
                  onMouseEnter={e => { if (accentColor !== p.value) e.currentTarget.style.transform = 'scale(1.15)' }}
                  onMouseLeave={e => { if (accentColor !== p.value) e.currentTarget.style.transform = 'scale(1)' }}
                />
              ))}
              <div onMouseDown={e => {
                  e.stopPropagation();
                  if (showColorPicker && !pickerExiting) closeColorPicker()
                  else if (!showColorPicker) setShowColorPicker(true)
                }}
                title="Custom color"
                style={{
                  width:32, height:32, borderRadius:'50%', cursor:'pointer',
                  background:'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  boxShadow: showColorPicker || !ACCENT_PRESETS.find(p => p.value === accentColor)
                    ? `0 0 0 3px #0e0e0e, 0 0 0 5px ${accentColor}`
                    : 'none',
                  transition:'transform 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              />
            </div>
            {(showColorPicker || pickerExiting) && (
              <ColorPickerPopover
                color={accentColor}
                onChange={(hex) => set('accentColor', hex)}
                onClose={closeColorPicker}
                isExiting={pickerExiting}
              />
            )}
          </div>
          <Toggle label="Animations" desc="Enable smooth transitions and visual effects" value={animations} onChange={() => set('animations', !animations)} isLast/>
        </>
      </CollapsibleSection>

      <CollapsibleSection title="Playback" open={playbackOpen} onToggle={() => setPlaybackOpen(o => !o)}>
        <>
          <Toggle label="Audio Normalization" desc="Levels out the volume between different tracks" value={normalize} onChange={() => set('normalize', !normalize)}/>
          <Toggle label="Gapless Playback" desc="Remove silence between tracks for seamless listening" value={gapless} onChange={() => set('gapless', !gapless)}/>
          <div style={{ marginBottom:'20px', paddingBottom:'20px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'14px' }}>
              <div>
                <div style={{ fontSize:'1rem', color:'#fff', fontWeight:500 }}>Crossfade</div>
                <div style={{ fontSize:'0.9rem', color:'#888', marginTop:'4px' }}>Fade between songs instead of playing gapless</div>
              </div>
              <div style={{ fontSize:'1rem', fontWeight:600, color: crossfade > 0 ? 'var(--accent)' : '#555' }}>
                {crossfade > 0 ? `${crossfade}s` : 'Off'}
              </div>
            </div>
            <input type="range" min={0} max={12} step={1} value={crossfade}
              onChange={e => set('crossfade', +e.target.value)}
              style={{ width:'100%', accentColor:'var(--accent)', height:'6px', borderRadius:'4px', appearance:'none',
                background:`linear-gradient(to right, var(--accent) ${(crossfade/12)*100}%, rgba(255,255,255,0.12) ${(crossfade/12)*100}%)` }}/>
          </div>
          <div style={{ paddingBottom:'20px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize:'1rem', color:'#fff', fontWeight:500, marginBottom:'4px' }}>Sleep Timer</div>
            <div style={{ fontSize:'0.9rem', color:'#888', marginBottom:'14px' }}>Automatically pause playback after a set time</div>
            <CustomSelect value={sleepValue} options={SLEEP_OPTIONS} onChange={handleSleepChange}/>
            {sleepTimer && sleepTimer !== 'song' && (
              <div style={{ fontSize:'0.88rem', color:'var(--accent)', marginTop:'10px' }}>
                ⏱ Pausing in {Math.max(1, Math.ceil((sleepTimer - Date.now()) / 60000))} min
              </div>
            )}
            {sleepTimer === 'song' && (
              <div style={{ fontSize:'0.88rem', color:'var(--accent)', marginTop:'10px' }}>
                ⏱ Pausing after current song
              </div>
            )}
          </div>
        </>
      </CollapsibleSection>

      <CollapsibleSection title="Equalizer" open={equalizerOpen} onToggle={() => setEqualizerOpen(o => !o)}>
        <>
          <Toggle
            label="Enable Equalizer"
            desc="Apply frequency adjustments to audio output"
            value={eq.enabled}
            onChange={() => set('eq', { ...eq, enabled: !eq.enabled })}
          />
          <div style={{ marginBottom:'20px', paddingBottom:'20px', borderBottom:'1px solid rgba(255,255,255,0.05)',
            opacity: eq.enabled ? 1 : 0.4, pointerEvents: eq.enabled ? 'auto' : 'none' }}>
            <div style={{ fontSize:'1rem', color:'#fff', fontWeight:500, marginBottom:'4px' }}>Preset</div>
            <div style={{ fontSize:'0.9rem', color:'#888', marginBottom:'14px' }}>Load a preconfigured EQ curve</div>
            <CustomSelect
              value={eq.preset}
              options={EQ_PRESET_OPTIONS}
              onChange={preset => { if (preset === 'custom') return; set('eq', { ...eq, preset, gains: [...EQ_PRESETS[preset]] }) }}
            />
          </div>
          <div style={{ opacity: eq.enabled ? 1 : 0.4, pointerEvents: eq.enabled ? 'auto' : 'none' }}>
            <div style={{ fontSize:'1rem', color:'#fff', fontWeight:500, marginBottom:'16px' }}>Bands</div>
            <div style={{ display:'flex', gap:'4px', alignItems:'flex-end', justifyContent:'space-between' }}>
              {EQ_BANDS.map((label, i) => (
                <div key={label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', flex:1 }}>
                  <div style={{ fontSize:'0.7rem', color: eq.gains[i] !== 0 ? 'var(--accent)' : '#555', fontWeight:500, minWidth:24, textAlign:'center' }}>
                    {eq.gains[i] > 0 ? `+${eq.gains[i]}` : eq.gains[i]}
                  </div>
                  <div style={{ height:'80px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <input
                      type="range" min={-12} max={12} step={0.5} value={eq.gains[i]}
                      onChange={e => {
                        const newGains = [...eq.gains]
                        newGains[i] = +e.target.value
                        set('eq', { ...eq, gains: newGains, preset: 'custom' })
                      }}
                      style={{
                        width:'80px', height:'6px', borderRadius:'3px',
                        transform:'rotate(-90deg)', cursor:'pointer',
                        appearance:'none', accentColor:'var(--accent)',
                        background:`linear-gradient(to right, var(--accent) ${((eq.gains[i]+12)/24)*100}%, rgba(255,255,255,0.12) ${((eq.gains[i]+12)/24)*100}%)`,
                      }}
                    />
                  </div>
                  <div style={{ fontSize:'0.65rem', color:'#555', textAlign:'center', whiteSpace:'nowrap' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      </CollapsibleSection>

      <CollapsibleSection title="System" open={systemOpen} onToggle={() => setSystemOpen(o => !o)}>
        <>
          <Toggle label="Close to tray" desc="The X button minimizes the app to the system tray instead of quitting" value={closeBehavior === 'tray'} onChange={() => set('closeBehavior', closeBehavior === 'tray' ? 'quit' : 'tray')}/>
          <Toggle
            label="Launch at startup"
            desc="Automatically start flacr. when you log in"
            value={launchAtStartup}
            onChange={() => {
              const next = !launchAtStartup
              setLaunchAtStartup(next)
              window.electronAPI?.setStartup?.(next)
            }}
          />
          <Toggle
            label="Discord Rich Presence"
            desc="Show currently playing song in your Discord status"
            value={discordRPC}
            onChange={() => {
              const next = !discordRPC
              set('discordRPC', next)
              window.electronAPI?.setDiscordRpcEnabled?.(next)
            }}
          />
          <Toggle
            label="Check for Updates"
            desc="Notify you when a new version of flacr. is available"
            value={updateChecker}
            onChange={() => {
              const next = !updateChecker
              set('updateChecker', next)
              if (next) window.electronAPI?.checkForUpdates?.()
              else setUpdateStatus(null)
            }}
          />
          <Toggle
            label="Auto Update"
            desc="Automatically download and install updates in the background"
            value={autoUpdate}
            onChange={() => {
              const next = !autoUpdate
              set('autoUpdate', next)
              window.electronAPI?.setUpdatePrefs?.({ autoDownload: next })
            }}
            isLast={!updateStatus || !updateChecker}
          />
          {/* ── Update status banner ── */}
          {updateChecker && updateStatus && updateStatus.type !== 'not-available' && (
            <div style={{
              marginTop: '16px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: updateStatus.type === 'error'
                ? 'rgba(239,68,68,0.08)'
                : updateStatus.type === 'downloaded'
                  ? 'rgba(34,197,94,0.08)'
                  : 'rgba(255,255,255,0.04)',
              border: `1px solid ${
                updateStatus.type === 'error'
                  ? 'rgba(239,68,68,0.2)'
                  : updateStatus.type === 'downloaded'
                    ? 'rgba(34,197,94,0.2)'
                    : 'rgba(255,255,255,0.07)'
              }`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            }}>
              <span style={{
                fontSize: '0.88rem',
                color: updateStatus.type === 'error'
                  ? '#ef4444'
                  : updateStatus.type === 'downloaded'
                    ? '#22c55e'
                    : '#aaa',
              }}>
                {updateStatus.type === 'checking'   && 'Checking for updates…'}
                {updateStatus.type === 'available'  && `Update v${updateStatus.version} available`}
                {updateStatus.type === 'downloading'&& `Downloading… ${updateStatus.percent}%`}
                {updateStatus.type === 'downloaded' && 'Update ready to install'}
                {updateStatus.type === 'error'      && `Update error: ${updateStatus.message}`}
              </span>
              {updateStatus.type === 'available' && !autoUpdate && (
                <button
                  onClick={() => window.electronAPI?.downloadUpdate?.()}
                  style={{
                    padding: '5px 12px', borderRadius: '7px', border: '1px solid var(--accent-border)',
                    background: 'var(--accent-dim)', color: 'var(--accent)',
                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Download
                </button>
              )}
              {updateStatus.type === 'downloaded' && (
                <button
                  onClick={() => window.electronAPI?.installUpdate?.()}
                  style={{
                    padding: '5px 12px', borderRadius: '7px', border: '1px solid rgba(34,197,94,0.3)',
                    background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Restart & Install
                </button>
              )}
              {updateStatus.type === 'downloading' && (
                <div style={{
                  width: '80px', height: '4px', borderRadius: '2px',
                  background: 'rgba(255,255,255,0.1)', flexShrink: 0, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    width: `${updateStatus.percent}%`,
                    background: 'var(--accent)', transition: 'width 0.3s ease',
                  }}/>
                </div>
              )}
            </div>
          )}
        </>
      </CollapsibleSection>

      <CollapsibleSection title="Shortcuts" open={shortcutsOpen} onToggle={() => setShortcutsOpen(o => !o)}>
        <div style={{ display:'flex', flexDirection:'column' }}>
            {[
              ['Space',   'Play / Pause'],
              ['→',       'Next track'],
              ['←',       'Previous track'],
              ['↑',       'Volume +5%'],
              ['↓',       'Volume −5%'],
              ['F',       'Now Playing fullscreen'],
              ['Q',       'Toggle queue panel'],
              ['L',       'Toggle lyrics'],
              ['Escape',  'Close overlay'],
            ].map(([key, action], i, arr) => (
              <div key={key} style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'9px 0',
                borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}>
                <span style={{ fontSize:'0.93rem', color:'#ccc' }}>{action}</span>
                <kbd style={{
                  fontSize:'0.8rem', color:'#aaa',
                  background:'rgba(255,255,255,0.07)',
                  border:'1px solid rgba(255,255,255,0.14)',
                  borderRadius:'5px', padding:'2px 8px', fontFamily:'inherit',
                }}>{key}</kbd>
              </div>
            ))}
          </div>
      </CollapsibleSection>

      {appVersion && (
        <div style={{ textAlign: 'center', padding: '20px 0 4px', color: '#444', fontSize: '0.78rem' }}>
          flacr. v{appVersion}
        </div>
      )}

    </div>
  )
}
