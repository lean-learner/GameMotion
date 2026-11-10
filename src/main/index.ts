import { app, BrowserWindow, ipcMain, protocol, session } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { resolveAppPath, mimeFor, originOf, APP_SCHEME, APP_HOST } from './appProtocol'
import { setupSelfTest } from './selfTest'
import { CameraTuning } from './cameraTuning'
import { addScore, cleanName, Store } from './store'
import { isAutostartEnabled, setAutostart } from './autostart'

// Serve the production renderer from a privileged custom scheme instead of
// file://. It gives the page a real, secure origin, which module workers,
// fetch() of local models and WebAssembly streaming all need.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

// Explicit profile directory (~/.config/gamemotion), so it never collides
// with another Electron app's. Automated self-tests use their own folder so
// they never write test scores or reports into the player's real data.
// Must run before the app is ready.
const PROFILE_DIR = process.env['NEX_SELFTEST_SECONDS'] ? 'gamemotion-selftest' : 'gamemotion'
app.setPath('userData', join(app.getPath('appData'), PROFILE_DIR))

const RENDERER_ROOT = join(__dirname, '../renderer')
const DEV_URL = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
const APP_ORIGIN = DEV_URL ? originOf(DEV_URL) : `${APP_SCHEME}://${APP_HOST}`

// Production-only CSP (dev relies on the meta tag in index.html, since Vite
// injects its own client). Applied to the page and worker responses.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'"
].join('; ')

function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppPath(RENDERER_ROOT, request.url)
    if (!file) return new Response('Not found', { status: 404 })
    try {
      const body = await readFile(file)
      return new Response(body, {
        headers: { 'content-type': mimeFor(file), 'content-security-policy': CSP }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function isAppOrigin(url: string): boolean {
  return originOf(url) === APP_ORIGIN
}

// Only our own page may use the camera; microphone and every other permission
// are refused.
function restrictPermissions(): void {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details.requestingUrl ?? webContents.getURL()
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    const videoOnly = mediaTypes.length > 0 && mediaTypes.every((t) => t === 'video')
    callback(permission === 'media' && videoOnly && isAppOrigin(origin))
  })
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return permission === 'media' && isAppOrigin(requestingOrigin)
  })
}

// Offline guarantee: cancel every network request that isn't to the app
// itself (or the local Vite dev server). Besides catching mistakes, this stops
// MediaPipe's built-in usage telemetry, which tasks-vision posts to
// odml.pa.googleapis.com and which has no public opt-out.
function blockExternalRequests(): void {
  const reported = new Set<string>()
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const url = new URL(details.url)
    const host = url.host
    const isDevServer = DEV_URL !== undefined && host === new URL(DEV_URL).host
    if (isAppOrigin(details.url) || isDevServer) return callback({})
    if (!reported.has(host)) {
      reported.add(host)
      console.warn(`[main] blocked network request to ${host} (app is offline-only)`)
    }
    callback({ cancel: true })
  })
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: store.data.settings.startFullscreen,
    width: 1400,
    height: 860,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111318',
    title: 'GameMotion',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Keep tracking running at full rate if the window loses focus.
      backgroundThrottling: false,
      // Players stand away from the PC, so game sounds must not wait for a click.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  win.once('ready-to-show', () => win.show())

  // Game-only camera tuning must not outlive the page that requested it.
  win.webContents.on('render-process-gone', () => void cameraTuning.restore())
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) void cameraTuning.restore()
  })

  // No popups, no navigating away from the app.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppOrigin(url)) event.preventDefault()
  })

  // F11 toggles fullscreen; F12 opens DevTools in development.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    } else if (input.key === 'F12' && is.dev) {
      win.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  const query = setupSelfTest(win)
  if (DEV_URL) {
    win.loadURL(DEV_URL + query)
  } else {
    win.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html${query}`)
  }
  return win
}

let cameraTuning: CameraTuning
let store: Store

const fromApp = (e: Electron.IpcMainInvokeEvent): boolean =>
  !!e.senderFrame && isAppOrigin(e.senderFrame.url)

/** How to launch this app again (for auto-start). */
function launchCommand(): string[] {
  if (process.env['APPIMAGE']) return [process.env['APPIMAGE']]
  return app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()]
}

/** Profiles, scores and settings. Inputs are validated here, never trusted. */
function registerStoreIpc(): void {
  const guard = (e: Electron.IpcMainInvokeEvent): void => {
    if (!fromApp(e)) throw new Error('forbidden')
  }
  const view = (): unknown => ({ ...store.data, autostart: isAutostartEnabled() })
  ipcMain.handle('store:get', (e) => {
    guard(e)
    return view()
  })
  ipcMain.handle('store:set-active-slot', (e, slot: unknown) => {
    guard(e)
    if (!Number.isInteger(slot) || !store.data.slots[slot as number])
      throw new Error('invalid slot')
    store.update((d) => ({ ...d, activeSlot: slot as number }))
    return view()
  })
  ipcMain.handle('store:rename-slot', (e, slot: unknown, name: unknown) => {
    guard(e)
    if (!Number.isInteger(slot) || !store.data.slots[slot as number])
      throw new Error('invalid slot')
    if (typeof name !== 'string' || !cleanName(name)) throw new Error('invalid name')
    store.update((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.id === slot ? { ...s, name: cleanName(name) } : s))
    }))
    return view()
  })
  ipcMain.handle('store:record-score', (e, game: unknown, score: unknown, slot: unknown) => {
    guard(e)
    if (typeof game !== 'string' || typeof score !== 'number') throw new Error('invalid score')
    if (slot !== undefined && slot !== null && !Number.isInteger(slot))
      throw new Error('invalid slot')
    // addScore validates that the slot exists.
    const { data, result } = addScore(
      store.data,
      game,
      typeof slot === 'number' ? slot : store.data.activeSlot,
      score,
      new Date().toISOString()
    )
    store.update(() => data)
    return result
  })
  ipcMain.handle('settings:set', (e, change: unknown) => {
    guard(e)
    const c = (change ?? {}) as { startFullscreen?: unknown; autostart?: unknown }
    if (typeof c.startFullscreen === 'boolean') {
      const startFullscreen = c.startFullscreen
      store.update((d) => ({ ...d, settings: { ...d.settings, startFullscreen } }))
    }
    if (typeof c.autostart === 'boolean') setAutostart(c.autostart, launchCommand())
    return view()
  })
  ipcMain.handle('app:quit', (e) => {
    guard(e)
    app.quit()
  })
}

// Narrow IPC: the page may only ask to lock/restore the frame rate of the camera
// it opened, identified by its label. Device paths and commands are decided here.
function registerCameraTuningIpc(): void {
  ipcMain.handle('camera-tuning:lock', async (e, label: unknown) => {
    if (!fromApp(e)) throw new Error('forbidden')
    if (typeof label !== 'string' || label.length > 200) throw new Error('invalid label')
    return cameraTuning.lockFrameRate(label)
  })
  ipcMain.handle('camera-tuning:restore', async (e) => {
    if (!fromApp(e)) throw new Error('forbidden')
    await cameraTuning.restore()
  })
  // Guided test reports: numbers only, written to a fixed folder the page can't choose.
  ipcMain.handle('test-report:save', async (e, json: unknown) => {
    if (!fromApp(e)) throw new Error('forbidden')
    if (typeof json !== 'string' || json.length > 200_000) throw new Error('invalid report')
    JSON.parse(json) // must be valid JSON
    const dir = join(app.getPath('userData'), 'test-runs')
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = join(dir, `run-${stamp}.json`)
    await writeFile(file, json)
    console.log(`[test-run] report saved: ${file}`)
    return file
  })
}

app.whenReady().then(() => {
  cameraTuning = new CameraTuning(join(app.getPath('userData'), 'camera-tuning-restore.json'))
  cameraTuning.recoverFromCrash()
  store = new Store(join(app.getPath('userData'), 'gamemotion-data.json'))
  registerCameraTuningIpc()
  registerStoreIpc()
  registerAppProtocol()
  restrictPermissions()
  blockExternalRequests()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Put the camera back the way we found it, whatever way the app exits.
app.on('will-quit', () => cameraTuning?.restoreSync())
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    cameraTuning?.restoreSync()
    app.exit(0)
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
