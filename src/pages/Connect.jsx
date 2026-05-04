import { useState, useEffect, useRef } from 'react'
import { authenticate } from '../utils/api'

const ipc = window.electronAPI

function Connect({ onConnect, onAddServer }) {
  const [ip,         setIp]         = useState('')
  const [port,       setPort]       = useState('')
  const [username,   setUsername]   = useState('')
  const [password,   setPassword]   = useState('')
  const [serverName, setServerName] = useState('')
  const [status,     setStatus]     = useState(null)
  const [loading,    setLoading]    = useState(false)
  const portRef = useRef(null)

  useEffect(() => {
    if (onAddServer) return  // add-mode: never auto-load
    // Load session from secure OS-encrypted store (Electron only)
    if (ipc?.loadSession) {
      ipc.loadSession().then(saved => {
        if (saved) onConnect(saved)
      }).catch(() => {})
    }
  }, [])

  const effectivePort = port || '8096'

  const validateInputs = () => {
    if (!ip || !username || !password) {
      setStatus({ ok: false, msg: 'Please fill in all fields.' })
      return false
    }
    const portNum = parseInt(effectivePort, 10)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setStatus({ ok: false, msg: 'Port must be a number between 1 and 65535.' })
      return false
    }
    // Basic IP / hostname validation: allow IPv4, IPv6, and hostnames
    const hostPattern = /^[a-zA-Z0-9.\-_\[\]:]+$/
    if (!hostPattern.test(ip.trim())) {
      setStatus({ ok: false, msg: 'Invalid server address.' })
      return false
    }
    return true
  }

  const handleConnect = async () => {
    if (!validateInputs()) return
    setLoading(true)
    setStatus(null)
    try {
      const session = await authenticate(ip, String(parseInt(effectivePort, 10)), username, password)
      if (onAddServer) {
        setStatus({ ok: true, msg: '✓ Server added!' })
        setTimeout(() => onAddServer({ ...session, serverName: serverName.trim() || null }), 600)
      } else {
        if (ipc?.saveServers) {
          // Save directly to servers.json so nickname is preserved
          const id = crypto.randomUUID()
          await ipc.saveServers({
            activeServerId: id,
            servers: [{ id, name: serverName.trim() || session.serverUrl, url: session.serverUrl,
                        userId: session.userId, token: session.token, username: session.username }],
          })
        } else {
          sessionStorage.setItem('flacr_session', JSON.stringify(session))
        }
        setStatus({ ok: true, msg: '✓ Connected! Loading library...' })
        setTimeout(() => onConnect(session), 800)
      }
    } catch (err) {
      setStatus({ ok: false, msg: err.message })
    }
    setLoading(false)
  }

  const handleIpChange = (e) => {
    const val = e.target.value
    if (val.endsWith(':')) {
      setIp(val.slice(0, -1))
      portRef.current?.focus()
      portRef.current?.select()
    } else {
      setIp(val)
    }
  }

  const handleIpKeyDown = (e) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      portRef.current?.focus()
      portRef.current?.select()
    }
  }

  const inputStyle = {
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', color: '#fff',
    fontSize: '0.95rem', outline: 'none',
  }

  const label = (text) => (
    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', marginBottom: '6px' }}>
      {text}
    </div>
  )

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 60% 40%, #1a0533 0%, #0a0a0f 70%)',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px', padding: '48px 40px',
        width: '100%', maxWidth: '440px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '2.8rem', fontWeight: 800, letterSpacing: '-2px', color: '#fff' }}>flacr</span>
          <span style={{ fontSize: '2.8rem', fontWeight: 800, color: '#a855f7' }}>.</span>
        </div>
        <p style={{ textAlign: 'center', color: '#888', fontSize: '0.9rem', marginBottom: '36px' }}>
          Connect to your Jellyfin server
        </p>

        <div style={{ marginBottom: '16px' }}>
          {label('Nickname (optional)')}
          <input type="text" placeholder="Home Server"
            value={serverName} onChange={e => setServerName(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          {label('Server Address')}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" placeholder="192.168.1.50"
              value={ip} onChange={handleIpChange} onKeyDown={handleIpKeyDown}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input ref={portRef} type="text" placeholder="8096"
              value={port} onChange={(e) => setPort(e.target.value)}
              style={{ ...inputStyle, width: '80px', textAlign: 'center' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          {label('Username')}
          <input type="text" placeholder="Your Username"
            value={username} onChange={(e) => setUsername(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          {label('Password')}
          <input type="password" placeholder="••••••••"
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        {status && (
          <div style={{
            padding: '10px', borderRadius: '8px', textAlign: 'center',
            fontSize: '0.88rem', marginBottom: '12px',
            background: status.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: status.ok ? '#22c55e' : '#ef4444',
          }}>
            {status.msg}
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={loading}
          style={{
            width: '100%', padding: '14px',
            background: '#a855f7', color: '#fff',
            fontSize: '1rem', fontWeight: 700,
            border: 'none', borderRadius: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1, marginTop: '8px',
          }}
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  )
}

export default Connect
