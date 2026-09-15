import { useState, useEffect } from 'react'
import Connect from './pages/Connect'
import Library from './pages/Library'
import { MiniPlayer } from './components/MiniPlayer'
import useSettingsStore, { hydrateSettingsFromFile } from './store/settingsStore'
import useUpdateStore from './store/updateStore'

const ipc = window.electronAPI

// Apply 'dark' or 'light' class to <html> so CSS variables (and any
// future component-level selectors) can respond to the OS theme.
function applyTheme(isDark) {
  document.documentElement.classList.toggle('dark',  isDark)
  document.documentElement.classList.toggle('light', !isDark)
}

function App() {
  const [session, setSession]   = useState(null)
  const [checked, setChecked]   = useState(false)
  const { autoUpdate } = useSettingsStore()
  const setUpdateStatus = useUpdateStore(s => s.setUpdateStatus)

  // ── System theme detection ───────────────────────────────────────────────
  useEffect(() => {
    if (ipc?.getTheme) {
      // Electron path: ask main process for the current OS setting …
      ipc.getTheme().then(applyTheme)
      // … and update whenever the user changes it in System Preferences.
      ipc.onThemeChanged(applyTheme)
    } else {
      // Web / dev-server fallback: use the CSS media query directly.
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches)
      const handler = (e) => applyTheme(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        if (ipc?.loadSettings) {
          await hydrateSettingsFromFile()
        }
        if (ipc?.loadServers) {
          // servers.json is the primary store; migrateSessionEnc() runs inside loadServers
          const data = await ipc.loadServers()
          if (data?.servers?.length) {
            const active = data.servers.find(s => s.id === data.activeServerId) ?? data.servers[0]
            if (active) {
              setSession({ serverUrl: active.url, userId: active.userId, token: active.token, username: active.username || '' })
              setChecked(true)
              return
            }
          }
        } else {
          const raw = sessionStorage.getItem('flacr_session')
          if (raw) { setSession(JSON.parse(raw)); setChecked(true); return }
        }
      } catch {}
      setChecked(true)
    }
    load()
  }, [])

  // ── Global Update Listener ────────────────────────────────────────────────
  useEffect(() => {
    if (!ipc?.onUpdateStatus) return
    ipc.onUpdateStatus((status) => {
      setUpdateStatus(status)
    })
    return () => ipc.removeAllListeners?.('update-status')
  }, [setUpdateStatus])

  // ── Sync the auto-download preference on startup ─────────────────────────
  // The actual startup check is owned by the main process background loop,
  // so no check is fired from here (it used to run a third, duplicate one).
  useEffect(() => {
    if (!checked || !ipc?.setUpdatePrefs) return
    ipc.setUpdatePrefs({ autoDownload: autoUpdate })
  }, [checked]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!checked) return null  // avoid flash of connect screen on startup

  // Mini player mode: ?mini=1 in the URL (set by main.js when opening mini window)
  if (ipc?.isMini()) {
    return session ? <MiniPlayer session={session}/> : null
  }

  if (!session) return <Connect onConnect={(sess) => { setSession(sess) }}/>
  return <Library key={session?.serverUrl} session={session}/>
}

export default App
