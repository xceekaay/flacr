import { create } from 'zustand'

const STORAGE_KEY = 'flacr_settings'
function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} } }
function save(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
  window.electronAPI?.saveSettings?.(s)?.catch?.(() => {})
}

const defaults = {
  normalize:               true,
  crossfade:               0,
  gapless:                 true,
  accentColor:             '#a855f7',
  animations:              true,
  closeBehavior:           'tray',   // 'tray' | 'quit'
  streamQuality:           'auto',
  discordRPC:              false,
  updateChecker:           true,
  autoUpdate:              false,
  eq: {
    enabled: false,
    gains:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preset:  'flat',
  },
}

const useSettingsStore = create((set, get) => {
  const saved = load()
  return {
    ...defaults,
    ...saved,
    eq: { ...defaults.eq, ...(saved.eq ?? {}) },
    set: (key, value) => {
      set({ [key]: value })
      save({ ...get(), [key]: value })
    },
  }
})

// Called once on app start: load settings from the settings.json file in userData.
// This ensures settings are synced across different environments (dev/prod)
// and preserved through updates/reinstalls.
export async function hydrateSettingsFromFile() {
  try {
    const saved = await window.electronAPI?.loadSettings?.()
    if (!saved || typeof saved !== 'object') return
    const merged = { ...defaults, ...saved, eq: { ...defaults.eq, ...(saved.eq ?? {}) } }
    useSettingsStore.setState(merged)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)) } catch {}
  } catch {}
}

export default useSettingsStore
