const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, screen, nativeTheme } = require('electron')
const path = require('path')
const fs   = require('fs')

// ── Discord Rich Presence ────────────────────────────────────────────────────
const DISCORD_CLIENT_ID = '1497720821379104788'
let rpc            = null
let rpcConnected   = false
let rpcRetryTimer  = null
let _pendingPresence = null

function initDiscordRPC() {
  let DiscordRPC
  try { DiscordRPC = require('@xhayper/discord-rpc') } catch (e) {
    console.error('[Discord RPC] @xhayper/discord-rpc package not found:', e.message)
    return
  }

  if (rpc) { const old = rpc; rpc = null; try { old.destroy().catch(() => {}) } catch {} }
  rpc = new DiscordRPC.Client({ clientId: DISCORD_CLIENT_ID })

  rpc.on('ready', () => {
    rpcConnected = true
    if (_pendingPresence) { setDiscordPresence(_pendingPresence); _pendingPresence = null }
  })

  rpc.on('disconnected', () => {
    rpcConnected = false
    scheduleRpcRetry()
  })

  rpc.login()
    .catch((err) => {
      if (err.message !== 'RPC_CONNECTION_TIMEOUT') {
        console.error('[Discord RPC] login failed:', err.message)
      }
      rpcConnected = false
      scheduleRpcRetry()
    })
}

function scheduleRpcRetry() {
  if (rpcRetryTimer) return
  rpcRetryTimer = setTimeout(() => { rpcRetryTimer = null; initDiscordRPC() }, 30_000)
}

function setDiscordPresence(data) {
  if (!rpcConnected || !rpc) { _pendingPresence = data; return }
  if (!data) { rpc.user?.clearActivity().catch((e) => console.error('[Discord RPC] clearActivity:', e.message)); _pendingPresence = null; return }
  rpc.user?.setActivity(data).catch((e) => console.error('[Discord RPC] setActivity error:', e.message))
}

function clearDiscordPresence() {
  _pendingPresence = null
  if (rpcConnected && rpc) rpc.user?.clearActivity().catch(() => {})
}

// ── Auto Updater ─────────────────────────────────────────────────────────────
let autoUpdater = null

function setupAutoUpdater() {
  try {
    const { autoUpdater: au } = require('electron-updater')
    autoUpdater = au
    autoUpdater.autoDownload        = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger              = null  // silence file logging
  } catch (e) {
    console.warn('[Updater] electron-updater unavailable:', e.message)
  }
}

function bindUpdaterEvents() {
  if (!autoUpdater) return
  const send = (type, extra = {}) =>
    mainWin?.webContents.send('update-status', { type, ...extra })

  autoUpdater.removeAllListeners()
  autoUpdater.on('checking-for-update',  ()    => send('checking'))
  autoUpdater.on('update-available',     info  => send('available',    { version: info.version }))
  autoUpdater.on('update-not-available', ()    => send('not-available'))
  autoUpdater.on('download-progress',    prog  => send('downloading',  { percent: Math.round(prog.percent) }))
  autoUpdater.on('update-downloaded',    ()    => send('downloaded'))
  autoUpdater.on('error',                err   => send('error',        { message: err?.message || String(err) }))
}

// ── App icon (PNG file — works in both dev and packaged mode) ────────────────
function getIconPath() {
  return path.join(__dirname, 'src', 'assets', 'icon.png')
}


// ── Secure session storage (encrypted via OS keychain) ───────────────────────
const { safeStorage } = require('electron')
const SESSION_PATH = () => path.join(app.getPath('userData'), 'session.enc')

function saveSessionSecure(session) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return
    const enc = safeStorage.encryptString(JSON.stringify(session))
    fs.writeFileSync(SESSION_PATH(), enc)
  } catch {}
}

function loadSessionSecure() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const enc = fs.readFileSync(SESSION_PATH())
    return JSON.parse(safeStorage.decryptString(enc))
  } catch { return null }
}

function clearSessionSecure() {
  try { fs.unlinkSync(SESSION_PATH()) } catch {}
}

// ── Settings file storage ────────────────────────────────────────────────────
const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json')

function loadFileSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH(), 'utf8')) } catch { return null }
}
function saveFileSettings(data) {
  try { fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(data)) } catch {}
}

// ── Multi-server storage ─────────────────────────────────────────────────────
const SERVERS_PATH = () => path.join(app.getPath('userData'), 'servers.json')
const { randomUUID } = require('crypto')

function loadServers() {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const raw = JSON.parse(fs.readFileSync(SERVERS_PATH(), 'utf8'))
    return {
      activeServerId: raw.activeServerId,
      servers: raw.servers.map(s => ({
        ...s,
        token: safeStorage.decryptString(Buffer.from(s.token, 'base64')),
      })),
    }
  } catch { return null }
}

function saveServers(data) {
  if (!safeStorage.isEncryptionAvailable()) return
  try {
    const encrypted = {
      activeServerId: data.activeServerId,
      servers: data.servers.map(s => ({
        ...s,
        token: safeStorage.encryptString(s.token).toString('base64'),
      })),
    }
    fs.writeFileSync(SERVERS_PATH(), JSON.stringify(encrypted))
  } catch {}
}

function migrateSessionEnc() {
  try { if (fs.existsSync(SERVERS_PATH())) return } catch { return }
  const old = loadSessionSecure()
  if (!old) return
  const id = randomUUID()
  saveServers({
    activeServerId: id,
    servers: [{ id, name: old.serverUrl, url: old.serverUrl, userId: old.userId, token: old.token, username: old.username || '' }],
  })
  clearSessionSecure()
}

app.commandLine.appendSwitch('log-level', '3')
app.commandLine.appendSwitch('disable-pinch')
// Prevent Windows from dropping the GPU compositor frame when minimized,
// which causes a white flash on restore.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.setName('flacr.')
app.setAppUserModelId('com.flacr.app')
app.setPath('userData', path.join(app.getPath('appData'), 'flacr'))

// ── Single instance lock ─────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); showMainWin() }
  })
}

let mainWin = null
let miniWin = null
let tray    = null
let updateTrayMenu = null
let isPlaying = false
let _thumbarIcon = null  // cache: { prev, play, pause, next } nativeImages

function showMainWin() {
  if (!mainWin || mainWin.isDestroyed()) return
  mainWin.setOpacity(0)
  mainWin.show()
  mainWin.focus()
  setTimeout(() => { if (mainWin && !mainWin.isDestroyed()) mainWin.setOpacity(1) }, 50)
  setTimeout(() => updateThumbarButtons(), 200)
}

const STATE_PATH = () => path.join(app.getPath('userData'), 'window-state.json')

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH(), 'utf8')) } catch { return null }
}

function isSnappedFullDisplay(bounds) {
  const disp = screen.getDisplayMatching(bounds)
  const wa   = disp.workArea
  return (
    Math.abs(bounds.x      - wa.x)      < 8 &&
    Math.abs(bounds.y      - wa.y)      < 8 &&
    Math.abs(bounds.width  - wa.width)  < 8 &&
    Math.abs(bounds.height - wa.height) < 8
  )
}

// ── Windows Thumbnail Toolbar (taskbar prev/play/next buttons) ───────────────
const _THUMB_B64 = {
  prev:  'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAU0lEQVR4nNXUOw4AIAgDUO5/aVwN4WOpRu1cXggDIt9Ep6Bz28C0j4JlHwHVhAItRoEe1gYjrAVmGARW0P0Nj92wQttghFKgh9LgUh8Fpfo2z2YAmcUCG5Jnn8EAAAAASUVORK5CYII=',
  play:  'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAATUlEQVR4nNXUwQ0AIAhDUfZfut6NQoEa9Q/wQnrA7LsAQA5KUUzJwTa6AluwB5ZgBkyhLEjDWTCEr10o3ZDGIjAFeWAJ2oEtzE58m+cawfnCTJwhPAEAAAAASUVORK5CYII=',
  pause: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAH0lEQVR4nGNgGFLgPxZAjppRA0cNHDVw1MChbuCgBACTg32fK+iedwAAAABJRU5ErkJggg==',
  next:  'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAUklEQVR4nNXTSQoAIAwDwP7/0/EkiFjTDaw5J6MIinwXAPB0Z2ipHLSgbpChIfBWDoPaIAWeRmlwH5aAK9DvhqVvyLou0NI1g2rx+V9mmPfwPhm+WgIb660uUAAAAABJRU5ErkJggg==',
}

function getThumbIcons() {
  if (!_thumbarIcon) {
    const load = b64 => nativeImage.createFromDataURL(`data:image/png;base64,${b64}`)
    _thumbarIcon = { prev: load(_THUMB_B64.prev), play: load(_THUMB_B64.play), pause: load(_THUMB_B64.pause), next: load(_THUMB_B64.next) }
  }
  return _thumbarIcon
}

function updateThumbarButtons() {
  if (process.platform !== 'win32' || !mainWin || mainWin.isDestroyed()) return
  // Windows only allows setting thumbar buttons when the window is visible.
  if (!mainWin.isVisible()) return

  try {
    const icons = getThumbIcons()
    const success = mainWin.setThumbarButtons([
      { tooltip: 'Previous',               icon: icons.prev,                    click: () => mainWin?.webContents.send('tray-prev') },
      { tooltip: isPlaying ? 'Pause':'Play', icon: isPlaying ? icons.pause : icons.play, click: () => mainWin?.webContents.send('tray-play-pause') },
      { tooltip: 'Next',                   icon: icons.next,                    click: () => mainWin?.webContents.send('tray-next') },
    ])
    // If it failed (sometimes happens if the taskbar entry is still initializing), 
    // we don't need to do much here as the 'show' and 'focus' events will retry.
  } catch (e) { console.warn('[Thumbar]', e.message) }
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 }))
  tray.setToolTip('flacr.')
  updateTrayMenu = () => {
    const isVisible = mainWin && !mainWin.isDestroyed() && mainWin.isVisible()
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: isPlaying ? 'Pause' : 'Play', click: () => mainWin?.webContents.send('tray-play-pause') },
      { label: 'Previous', click: () => mainWin?.webContents.send('tray-prev') },
      { label: 'Next',     click: () => mainWin?.webContents.send('tray-next') },
      { type: 'separator' },
      ...(isVisible ? [] : [
        { label: 'Show',        click: () => showMainWin() },
        { type: 'separator' }
      ]),
      { label: 'Quit',        click: () => { if (mainWin) mainWin._forceQuit = true; app.quit() } },
    ]))
    updateThumbarButtons()
  }
  updateTrayMenu()
  ipcMain.on('player-state', (_, p) => { isPlaying = p; updateTrayMenu() })
  tray.on('double-click', () => showMainWin())
}

function createWindow() {
  const s  = loadState()
  const b  = s?.bounds || {}

  const allDisplays  = screen.getAllDisplays()
  const savedDisplay = s?.displayId
    ? allDisplays.find(d => d.id === s.displayId) || screen.getPrimaryDisplay()
    : screen.getPrimaryDisplay()
  const sf = savedDisplay.scaleFactor || s?.scaleFactor || 1

  // When maximized, we must start the window somewhere ON the target display
  // before calling maximize() — otherwise maximize() fills whichever monitor
  // the constructor x/y lands on (which may be the old monitor).
  // Use the center of the target display's work area as the starting point.
  let startX = b.x ?? undefined
  let startY = b.y ?? undefined

  if ((s?.isMaximized || s?.isFullScreen) && s?.displayId) {
    const wa = savedDisplay.workArea
    startX = wa.x + Math.floor(wa.width  / 2)
    startY = wa.y + Math.floor(wa.height / 2)
  }

  mainWin = new BrowserWindow({
    icon:     getIconPath(),
    x:        startX,
    y:        startY,
    width:    b.width  || 1280,
    height:   b.height || 800,
    minWidth: 1060, minHeight: 735,
    frame: false, backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: false,
    },
  })

  // ── Content Security Policy ────────────────────────────────────────
  // Dev mode (Vite): allow inline scripts and ws: for HMR.
  // Production (file://): strict — no unsafe-inline, no ws.
  const isDev = !app.isPackaged
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'"
  const connectSrc = isDev
    ? "connect-src 'self' http: https: ws: wss:"
    : "connect-src 'self' http: https:"
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    connectSrc,
    "media-src 'self' http: https: blob:",
    "img-src 'self' http: https: data: blob:",
  ].join('; ')

  mainWin.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  // ── Navigation guard — prevent the renderer from navigating away from localhost ──
  mainWin.webContents.on('will-navigate', (e, url) => {
    if (isDev && !url.startsWith('http://localhost:5173')) e.preventDefault()
    else if (!isDev && !url.startsWith('file://')) e.preventDefault()
  })
  mainWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // ── Token injection — inject X-Emby-Token on audio stream requests so the
  //    token never appears in URLs (network logs, Referer headers, etc.) ────────
  let activeToken = null
  let activeOrigin = null
  ipcMain.on('set-auth-token', (event, { token, serverUrl }) => {
    if (!isFromMainWindow(event)) return
    activeToken  = token
    activeOrigin = serverUrl
  })

  mainWin.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders }
      if (
        activeToken &&
        activeOrigin &&
        details.url.startsWith(activeOrigin) &&
        details.url.includes('/Audio/')
      ) {
        headers['X-Emby-Token'] = activeToken
      }
      callback({ requestHeaders: headers })
    }
  )

  // HiDPI: second setBounds corrects misapplied initial bounds (windowed only)
  if (b.width && sf !== 1 && !s?.isMaximized && !s?.isFullScreen) {
    const target = { x: b.x, y: b.y, width: b.width, height: b.height }
    setTimeout(() => {
      if (!mainWin || mainWin.isDestroyed()) return
      mainWin.setBounds(target)
    }, 150)
  }

  mainWin.once('ready-to-show', () => {
    if (s?.isFullScreen) {
      mainWin.setFullScreen(true)
    } else if (s?.isMaximized) {
      mainWin.maximize()
    }
    mainWin.show()
    mainWin.focus()
    // Multiple retries for Windows Taskbar to catch the window registration
    setTimeout(() => updateThumbarButtons(), 300)
    setTimeout(() => updateThumbarButtons(), 1000)
    setTimeout(() => updateThumbarButtons(), 3000)
  })

  // ── State tracking ─────────────────────────────────────────────────────────
  let lastWindowedBounds = b.width
    ? { x: b.x, y: b.y, width: b.width, height: b.height }
    : null
  let lastKnownDisplayId = savedDisplay.id

  function saveState() {
    if (!mainWin || mainWin.isDestroyed()) return

    const isMax  = mainWin.isMaximized()
    const isFull = mainWin.isFullScreen()
    const bounds = mainWin.getBounds()

    const snapped      = !isMax && !isFull && isSnappedFullDisplay(bounds)
    const effectiveMax = isMax || snapped

    if (!effectiveMax && !isFull) {
      lastWindowedBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      lastKnownDisplayId = screen.getDisplayMatching(bounds).id
    }

    if (!lastWindowedBounds) return

    const targetDisplay = screen.getAllDisplays().find(d => d.id === lastKnownDisplayId)
      || screen.getPrimaryDisplay()
    const saveSf = targetDisplay.scaleFactor || 1

    try {
      fs.writeFileSync(STATE_PATH(), JSON.stringify({
        bounds:       lastWindowedBounds,
        isMaximized:  effectiveMax,
        isFullScreen: isFull,
        displayId:    lastKnownDisplayId,
        scaleFactor:  saveSf,
      }))
    } catch {}
  }

  // ── Event listeners ────────────────────────────────────────────────────────
  let saveTimer    = null
  let displayTimer = null

  const flushSave = () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    saveState()
  }
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveTimer = null; saveState() }, 400)
  }

  mainWin.on('move', () => {
    // Track display changes eagerly during drag (50ms) so lastKnownDisplayId
    // is always current when a snap or maximize fires
    if (displayTimer) clearTimeout(displayTimer)
    displayTimer = setTimeout(() => {
      displayTimer = null
      if (!mainWin || mainWin.isDestroyed()) return
      const bounds = mainWin.getBounds()
      const disp   = screen.getDisplayMatching(bounds)
      if (disp.id !== lastKnownDisplayId) {
        console.log('[DISPLAY CHANGE]', lastKnownDisplayId, '->', disp.id)
        lastKnownDisplayId = disp.id
      }
    }, 50)

    scheduleSave()
  })

  mainWin.on('resize',            scheduleSave)
  mainWin.on('maximize',          () => { flushSave(); mainWin.webContents.send('maximized') })
  mainWin.on('unmaximize',        () => { flushSave(); mainWin.webContents.send('unmaximized') })
  mainWin.on('enter-full-screen', () => { flushSave(); mainWin.webContents.send('enter-fullscreen') })
  mainWin.on('leave-full-screen', () => { flushSave(); mainWin.webContents.send('leave-fullscreen') })

  mainWin.on('show',     () => { if (updateTrayMenu) updateTrayMenu() })
  mainWin.on('hide',     () => { if (updateTrayMenu) updateTrayMenu() })
  mainWin.on('focus',    () => { updateThumbarButtons() })
  mainWin.on('minimize', () => { mainWin.setOpacity(0) })
  mainWin.on('restore',  () => {
    if (updateTrayMenu) updateTrayMenu()
    setTimeout(() => { if (mainWin && !mainWin.isDestroyed()) mainWin.setOpacity(1) }, 50)
    setTimeout(() => updateThumbarButtons(), 150)
  })

  // closeBehavior: 'tray' (default) | 'quit'
  let closeBehavior = 'tray'
  ipcMain.on('set-close-behavior', (_, behavior) => { if (['tray', 'quit'].includes(behavior)) closeBehavior = behavior })

  mainWin.on('close', (e) => {
    if (mainWin._forceQuit) return  // allow quit
    e.preventDefault()
    if (closeBehavior === 'quit') {
      mainWin._forceQuit = true
      app.quit()
    } else {
      mainWin.hide()
    }
  })

  // ── IPC sender validation — only accept messages from our own windows ────
  const isFromMainWindow = (event) => event.sender === mainWin?.webContents

  ipcMain.on('minimize',   (e) => { if (isFromMainWindow(e)) mainWin.minimize() })
  ipcMain.on('maximize',   (e) => { if (isFromMainWindow(e)) mainWin.maximize() })
  ipcMain.on('unmaximize', (e) => { if (isFromMainWindow(e)) mainWin.unmaximize() })
  ipcMain.on('close',      (e) => {
    if (!isFromMainWindow(e)) return
    if (closeBehavior === 'quit') { mainWin._forceQuit = true; app.quit() }
    else mainWin.hide()
  })
  ipcMain.on('quit', (e) => { if (isFromMainWindow(e)) { mainWin._forceQuit = true; app.quit() } })

  ipcMain.on('discord-presence', (event, payload) => {
    if (!isFromMainWindow(event)) return
    if (!payload.playing || !payload.title) { clearDiscordPresence(); return }
    setDiscordPresence({
      type:           2,   // "Listening to …"
      details:        payload.title,
      state:          `by ${payload.artist || 'Unknown'}`,
      ...(payload.startTimestamp ? { startTimestamp: payload.startTimestamp } : {}),
      largeImageKey:  'flacr',
      largeImageText: 'flacr.',
      instance:       false,
    })
  })

  ipcMain.on('discord-rpc-enabled', (event, enabled) => {
    if (!isFromMainWindow(event)) return
    if (enabled) {
      if (!rpcConnected) initDiscordRPC()
    } else {
      if (rpcRetryTimer) { clearTimeout(rpcRetryTimer); rpcRetryTimer = null }
      clearDiscordPresence()
      if (rpc) { const old = rpc; rpc = null; rpcConnected = false; try { old.destroy().catch(() => {}) } catch {} }
    }
  })

  if (isDev) {
    const http = require('http')
    function waitForVite(cb, n = 20) {
      http.get('http://localhost:5173', r => { r.resume(); if (r.statusCode === 200) cb(); else retry() })
        .on('error', () => { if (n > 0) setTimeout(() => waitForVite(cb, n - 1), 500) })
      function retry() { if (n > 0) setTimeout(() => waitForVite(cb, n - 1), 500) }
    }
    waitForVite(() => mainWin.loadURL('http://localhost:5173'))
  } else {
    mainWin.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  app.on('before-quit', () => {
    saveState()
    globalShortcut.unregisterAll()
    if (rpcRetryTimer) { clearTimeout(rpcRetryTimer); rpcRetryTimer = null }
    clearDiscordPresence()
    if (rpc) { try { rpc.destroy().catch(() => {}) } catch {} rpc = null }
  })
}

function createMiniPlayer() {
  if (miniWin && !miniWin.isDestroyed()) { miniWin.focus(); return }
  miniWin = new BrowserWindow({
    width: 360, height: 108, minWidth: 320, maxWidth: 500,
    minHeight: 68, maxHeight: 108,
    frame: false, resizable: true, alwaysOnTop: true, backgroundColor: '#0d0d14',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  if (isDev) {
    miniWin.loadURL('http://localhost:5173?mini=1')
  } else {
    miniWin.loadFile(path.join(__dirname, 'dist', 'index.html'), { query: { mini: '1' } })
  }
  mainWin?.hide()
  miniWin.on('closed', () => { miniWin = null; showMainWin() })
}

function registerMediaKeys() {
  const send = ch => (miniWin && !miniWin.isDestroyed() ? miniWin : mainWin)?.webContents.send(ch)
  globalShortcut.register('MediaPlayPause',     () => send('tray-play-pause'))
  globalShortcut.register('MediaNextTrack',     () => send('tray-next'))
  globalShortcut.register('MediaPreviousTrack', () => send('tray-prev'))
}


// ── Secure session IPC handlers ───────────────────────────────────────────────
app.whenReady().then(() => {
  ipcMain.handle('session:save',  (_, session) => saveSessionSecure(session))
  ipcMain.handle('session:load',  ()           => loadSessionSecure())
  ipcMain.handle('session:clear', ()           => clearSessionSecure())

  ipcMain.handle('settings:load', () => loadFileSettings())
  ipcMain.handle('settings:save', (_, data) => saveFileSettings(data))

  ipcMain.handle('servers:load', async () => {
    migrateSessionEnc()
    return loadServers()
  })

  ipcMain.handle('servers:save', async (_, data) => {
    saveServers(data)
  })

  ipcMain.handle('startup:get', () => {
    if (process.platform === 'linux') return false
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.on('startup:set', (_, enabled) => {
    if (process.platform === 'linux') return
    app.setLoginItemSettings({ openAtLogin: enabled })
  })

  // ── Update IPC handlers ────────────────────────────────────────────────────
  setupAutoUpdater()

  ipcMain.handle('update:set-prefs', (_, { autoDownload }) => {
    if (autoUpdater) autoUpdater.autoDownload = !!autoDownload
  })

  ipcMain.handle('update:check', async () => {
    if (!autoUpdater || !app.isPackaged) {
      mainWin?.webContents.send('update-status', { type: 'not-available' })
      return
    }
    bindUpdaterEvents()
    try { await autoUpdater.checkForUpdates() } catch (e) {
      mainWin?.webContents.send('update-status', { type: 'error', message: e.message })
    }
  })

  ipcMain.handle('update:download', async () => {
    if (!autoUpdater || !app.isPackaged) return
    bindUpdaterEvents()
    try { await autoUpdater.downloadUpdate() } catch (e) {
      mainWin?.webContents.send('update-status', { type: 'error', message: e.message })
    }
  })

  ipcMain.handle('update:install', () => {
    if (!autoUpdater) return
    mainWin._forceQuit = true
    autoUpdater.quitAndInstall()
  })

  // ── System theme detection ─────────────────────────────────────────────────
  // Let Electron follow the OS light/dark setting (instead of forcing one).
  nativeTheme.themeSource = 'system'

  // Renderer can ask for the current value on startup …
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('theme:get', () => nativeTheme.shouldUseDarkColors)

  // … and will be notified whenever the OS setting changes.
  nativeTheme.on('updated', () => {
    mainWin?.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors)
    miniWin?.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors)
  })
})

app.whenReady().then(() => { createWindow(); createTray(); registerMediaKeys() })
app.on('window-all-closed', () => {})