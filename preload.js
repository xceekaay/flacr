const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:   () => ipcRenderer.send('minimize'),
  maximize:   () => ipcRenderer.send('maximize'),
  unmaximize: () => ipcRenderer.send('unmaximize'),
  close:      () => ipcRenderer.send('close'),
  quit:       () => ipcRenderer.send('quit'),
  openMini:   () => ipcRenderer.send('open-mini'),
  closeMini:  () => ipcRenderer.send('close-mini'),
  isMini:     () => new URLSearchParams(window.location.search).has('mini'),

  sendPlayerState: (playing) => ipcRenderer.send('player-state', playing),
  setCloseBehavior: (behavior) => ipcRenderer.send('set-close-behavior', behavior),
  setAuthToken: (token, serverUrl) => ipcRenderer.send('set-auth-token', { token, serverUrl }),
  updatePresence:        (payload) => ipcRenderer.send('discord-presence', payload),
  setDiscordRpcEnabled:  (val)     => ipcRenderer.send('discord-rpc-enabled', val),

  saveSession:  (session) => ipcRenderer.invoke('session:save', session),
  loadSession:  ()        => ipcRenderer.invoke('session:load'),
  clearSession: ()        => ipcRenderer.invoke('session:clear'),

  loadSettings: ()     => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),

  loadServers: ()     => ipcRenderer.invoke('servers:load'),
  saveServers: (data) => ipcRenderer.invoke('servers:save', data),

  onMaximized:        (cb) => ipcRenderer.on('maximized',         () => cb()),
  onUnmaximized:      (cb) => ipcRenderer.on('unmaximized',       () => cb()),
  onEnterFullscreen:  (cb) => ipcRenderer.on('enter-fullscreen',  () => cb()),
  onLeaveFullscreen:  (cb) => ipcRenderer.on('leave-fullscreen',  () => cb()),
  onTrayPlayPause:    (cb) => ipcRenderer.on('tray-play-pause',   () => cb()),
  onTrayNext:         (cb) => ipcRenderer.on('tray-next',         () => cb()),
  onTrayPrev:         (cb) => ipcRenderer.on('tray-prev',         () => cb()),
  onTrayPrevForce:    (cb) => ipcRenderer.on('tray-prev-force',   () => cb()),
  onToggleMini:       (cb) => ipcRenderer.on('toggle-mini',       () => cb()),

  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch),

  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getStartup: ()        => ipcRenderer.invoke('startup:get'),
  setStartup: (enabled) => ipcRenderer.send('startup:set', enabled),

  // ── Auto updater ──────────────────────────────────────────────────────────
  setUpdatePrefs:  (prefs) => ipcRenderer.invoke('update:set-prefs', prefs),
  checkForUpdates: ()      => ipcRenderer.invoke('update:check'),
  downloadUpdate:  ()      => ipcRenderer.invoke('update:download'),
  installUpdate:   ()      => ipcRenderer.invoke('update:install'),
  onUpdateStatus:  (cb)    => ipcRenderer.on('update-status', (_, data) => cb(data)),

  // ── System theme ──────────────────────────────────────────────────────────
  // Returns true when the OS is currently in dark mode.
  getTheme:       () => ipcRenderer.invoke('theme:get'),
  // Calls cb(isDark: boolean) whenever the OS theme changes.
  onThemeChanged: (cb) => ipcRenderer.on('theme-changed', (_, isDark) => cb(isDark)),
})
