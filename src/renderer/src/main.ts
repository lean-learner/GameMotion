import { DisplayBrightener } from './camera/brightness'
import { DwellSelector, type DwellState } from './input/dwell'
import { MotionInput } from './input/MotionInput'
import { PlayerTracker } from './input/players'
import type { InputEvent, MotionSnapshot, Vec2 } from './input/types'
import { describe, InputOverlay } from './overlay/InputOverlay'
import { GuidedTest } from './testrun/GuidedTest'
import { balloonPop } from './games/balloonPop'
import { mountLauncher } from './games/launcher'
import type { GameModule, GameServices, LauncherServices, Player, ScoreRow } from './games/types'
import type { StoreView } from '../../preload/index.d'
import { CameraService, type CameraSettings } from './camera/CameraService'
import { OverlayRenderer } from './overlay/OverlayRenderer'
import { bodyExtent } from './tracking/bodyCoverage'
import { TrackingService } from './tracking/TrackingService'
import type { DelegatePreference, PoseModel, TrackerConfig, TrackingFrame } from './tracking/types'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} missing`)
  return el as T
}

const ui = {
  stage: $<HTMLDivElement>('stage'),
  video: $<HTMLVideoElement>('video'),
  canvas: $<HTMLCanvasElement>('overlay'),
  inputCanvas: $<HTMLCanvasElement>('input-layer'),
  inputTest: $<HTMLInputElement>('input-test'),
  guided: $<HTMLButtonElement>('guided'),
  play: $<HTMLButtonElement>('play'),
  gameRoot: $<HTMLDivElement>('game-root'),
  playerNames: $<HTMLDivElement>('player-names'),
  startFullscreen: $<HTMLInputElement>('start-fullscreen'),
  autostart: $<HTMLInputElement>('autostart'),
  toggle: $<HTMLButtonElement>('toggle'),
  cameraSelect: $<HTMLSelectElement>('camera-select'),
  poseModel: $<HTMLSelectElement>('pose-model'),
  delegate: $<HTMLSelectElement>('delegate'),
  maxHz: $<HTMLSelectElement>('max-hz'),
  holdFps: $<HTMLInputElement>('hold-fps'),
  brighten: $<HTMLInputElement>('brighten'),
  message: $<HTMLDivElement>('message'),
  d: {
    status: $('d-status'),
    camera: $('d-camera'),
    cameraFps: $('d-camera-fps'),
    trackingFps: $('d-tracking-fps'),
    inference: $('d-inference'),
    latency: $('d-latency'),
    delegate: $('d-delegate'),
    detected: $('d-detected'),
    skipped: $('d-skipped'),
    tuning: $('d-tuning'),
    brightness: $('d-brightness'),
    body: $('d-body'),
    calibration: $('d-calibration'),
    posture: $('d-posture'),
    versions: $('d-versions')
  }
}

const overlay = new OverlayRenderer(ui.canvas)

// ---- Motion input (Milestone 2) ------------------------------------------------
const motion = new MotionInput(16 / 9) // player 1 (also drives the diagnostics view)
/** One MotionInput per player; index 0 is `motion`. */
const motions = [motion, new MotionInput(16 / 9)]
let snapshots: (MotionSnapshot | null)[] = [null, null]
let playerCount = 1
let playerTracker = new PlayerTracker(1, 16 / 9)
/** The right-hand player's slot in 2-player mode (not persisted). */
let secondSlot: number | null = null
const inputOverlay = new InputOverlay(ui.inputCanvas)
const DWELL_TARGETS = [
  { id: 'recalibrate', x: 0.74, y: 0.06, w: 0.22, h: 0.12 },
  { id: 'test', x: 0.74, y: 0.22, w: 0.22, h: 0.12 }
]
const dwell = new DwellSelector(DWELL_TARGETS)
let snapshot: MotionSnapshot | null = null
let dwellState: DwellState = { hover: null, selected: null }
let testPresses = 0
const eventLog: { event: InputEvent; at: number }[] = []
let rafHandle: number | null = null

// ---- Shell: launcher, games, settings (Milestones 3-4) ---------------------------
const GAMES: GameModule[] = [balloonPop]
type Mode = 'settings' | 'launcher' | 'game'
let mode: Mode = 'settings'
let unmount: (() => void) | null = null
let storeView: StoreView | null = null
const gameListeners = new Set<(e: InputEvent, player: number) => void>()

const toPlayer = (id: number): Player => {
  const slot = storeView?.slots[id]
  return slot
    ? { slot: slot.id, name: slot.name, color: slot.color }
    : { slot: id, name: `Player ${id + 1}`, color: '#ffffff' }
}
/** Who plays this session, left to right. */
function sessionPlayers(): Player[] {
  const first = storeView?.activeSlot ?? 0
  if (playerCount === 1) return [toPlayer(first)]
  const second = secondSlot !== null && secondSlot !== first ? secondSlot : (first + 1) % 4
  return [toPlayer(first), toPlayer(second)]
}
const rowsFor = (entries: { slot: number; score: number }[]): ScoreRow[] =>
  entries.map((e) => {
    const slot = storeView?.slots[e.slot]
    return {
      name: slot?.name ?? `Player ${e.slot + 1}`,
      color: slot?.color ?? '#ffffff',
      score: e.score
    }
  })

/**
 * Self-test only (`demo` URL option): scripted cursors that slice back and forth
 * across the screen, so game effects can be checked without a person moving.
 */
const DEMO_INPUT = new URLSearchParams(location.search).has('demo')
function demoCursors(now: number, player: number): { left: Vec2 | null; right: Vec2 | null } {
  const t = now / 1000 + player * 1.3
  return {
    left: null,
    // Fast horizontal strokes (about 1.6 screen widths per second) drifting up and down.
    right: { x: 0.5 + 0.48 * Math.sin(t * 3.4), y: 0.45 + 0.3 * Math.sin(t * 0.7) }
  }
}

const gameServices: GameServices = {
  input: {
    cursors: (now, player = 0) =>
      DEMO_INPUT
        ? demoCursors(now, player)
        : {
            left: motions[player]?.predictCursor('left', now) ?? null,
            right: motions[player]?.predictCursor('right', now) ?? null
          },
    snapshot: (player = 0) => snapshots[player] ?? null,
    onEvent: (listener) => {
      gameListeners.add(listener)
      return () => gameListeners.delete(listener)
    }
  },
  players: sessionPlayers,
  saveScore: async (gameId, score, player = 0) => {
    try {
      const slot = sessionPlayers()[player]?.slot
      const r = await window.gameMotion.store.recordScore(gameId, score, slot)
      storeView = await window.gameMotion.store.get()
      return {
        rank: r.rank,
        personalBest: r.personalBest,
        isPersonalBest: r.isPersonalBest,
        top: rowsFor(r.top)
      }
    } catch (err) {
      console.error('[store] could not save score:', err)
      return null
    }
  },
  exit: () => void enterLauncher()
}

const launcherServices: LauncherServices = {
  ...gameServices,
  games: GAMES.map((g) => ({ id: g.id, title: g.title })),
  slots: () => (storeView?.slots ?? []).map((s) => toPlayer(s.id)),
  setPlayer: async (slot, right = false) => {
    if (right) {
      secondSlot = slot
      return
    }
    storeView = await window.gameMotion.store.setActiveSlot(slot)
    if (secondSlot === slot) secondSlot = null
  },
  playerCount: () => playerCount,
  setPlayerCount: (count) => setPlayerCount(count),
  topScores: (gameId) => rowsFor(storeView?.scores[gameId] ?? []),
  launch: (gameId) => {
    const game = GAMES.find((g) => g.id === gameId)
    if (game) void enterGame(game)
  },
  openSettings: () => enterSettings(),
  quit: () => void window.gameMotion.quit()
}

/**
 * 1- or 2-player mode. Two players need MediaPipe to look for two bodies (and
 * four hands), so the tracker is reloaded; the camera stays open.
 */
async function setPlayerCount(count: number): Promise<void> {
  if (count === playerCount || (count !== 1 && count !== 2)) return
  playerCount = count
  console.info(`[players] switching to ${count} player(s)`)
  if (tracker.stats.status === 'running' && cameraSettings) {
    tracker.stop()
    await tracker.load(readConfig())
    startInput(cameraSettings.width / cameraSettings.height) // fresh per-player input
    tracker.start(ui.video)
  } else {
    playerTracker = new PlayerTracker(count, motion.aspect)
  }
}

function unmountCurrent(): void {
  const stop = unmount
  unmount = null
  gameListeners.clear()
  if (stop) stop()
  ui.gameRoot.replaceChildren()
}

/** Shows a full-window Phaser view (launcher or game). Starts tracking if needed. */
async function mountFullscreen(
  next: Mode,
  mount: () => Promise<() => void>,
  label: string
): Promise<boolean> {
  abortGuidedTest()
  unmountCurrent()
  if (tracker.stats.status !== 'running') await startTracking()
  if (tracker.stats.status !== 'running') {
    enterSettings() // camera/tracking failed: its message is shown there
    return false
  }
  mode = next
  document.body.classList.add('game-mode')
  ui.gameRoot.hidden = false
  try {
    unmount = await mount()
    console.info(`[shell] ${label}`)
    return true
  } catch (err) {
    console.error(`[shell] could not open ${label}:`, err)
    enterSettings()
    showMessage(
      `Could not open ${label}: ${err instanceof Error ? err.message : String(err)}`,
      true
    )
    return false
  }
}

async function enterLauncher(): Promise<void> {
  storeView = await window.gameMotion.store.get().catch(() => storeView)
  await mountFullscreen('launcher', () => mountLauncher(ui.gameRoot, launcherServices), 'launcher')
}

async function enterGame(game: GameModule, options: { autostart?: boolean } = {}): Promise<void> {
  await mountFullscreen(
    'game',
    () => game.mount(ui.gameRoot, gameServices, options),
    `game ${game.id}`
  )
}

/** The desktop view: camera, diagnostics, test tools and settings. */
function enterSettings(): void {
  unmountCurrent()
  mode = 'settings'
  ui.gameRoot.hidden = true
  document.body.classList.remove('game-mode')
  void renderSettings()
  renderControls()
}

// ---- Settings panel ---------------------------------------------------------------

async function renderSettings(): Promise<void> {
  try {
    storeView = await window.gameMotion.store.get()
  } catch (err) {
    console.warn('[store] unavailable:', err)
    return
  }
  ui.startFullscreen.checked = storeView.settings.startFullscreen
  ui.autostart.checked = storeView.autostart
  ui.playerNames.replaceChildren(
    ...storeView.slots.map((slot) => {
      const input = document.createElement('input')
      input.type = 'text'
      input.maxLength = 20
      input.value = slot.name
      input.style.borderColor = slot.color
      input.title = `Name for ${slot.color} player`
      input.addEventListener('change', () => {
        void window.gameMotion.store
          .renameSlot(slot.id, input.value)
          .then((v) => (storeView = v))
          .catch(() => (input.value = slot.name))
      })
      return input
    })
  )
}

// ---- Guided test run -----------------------------------------------------------
let guided: GuidedTest | null = null
let guidedSummary: string[] = []
let guidedReported = false

async function startGuidedTest(): Promise<void> {
  if (tracker.stats.status !== 'running') await startTracking()
  if (tracker.stats.status !== 'running') return // camera/tracking failed; message shown
  guided = new GuidedTest()
  guidedSummary = []
  guidedReported = false
  guided.start(performance.now())
  console.info('[test-run] started')
  renderControls()
}

function abortGuidedTest(): void {
  if (guided && !guided.finished) console.info('[test-run] aborted')
  guided = null
  dwell.targets = DWELL_TARGETS
  renderControls()
}

async function finishGuidedTest(run: GuidedTest): Promise<void> {
  const passed = run.results.filter((r) => r.status === 'pass').length
  guidedSummary = [
    `Test run complete: ${passed}/${run.results.length} passed`,
    ...run.results.map(
      (r) =>
        `${r.status === 'pass' ? 'PASS' : r.status === 'timeout' ? 'MISS' : 'FAIL'}  ${r.title}` +
        (r.detectMs !== null ? `  (${(r.detectMs / 1000).toFixed(1)} s)` : '')
    ),
    'Saving report...'
  ]
  const now = performance.now()
  const s = tracker.sample(now)
  const report = {
    kind: 'gamemotion-guided-test',
    version: 1,
    createdAt: new Date().toISOString(),
    note: 'Numbers only; no images or video are recorded.',
    app: {
      electron: window.gameMotion.versions.electron,
      chrome: window.gameMotion.versions.chrome
    },
    camera: cameraSettings && {
      label: cameraSettings.label,
      width: cameraSettings.width,
      height: cameraSettings.height,
      reportedFps: cameraSettings.frameRate,
      observedFps: +fmt(camera.observedFps(now)),
      tuning: tuningText,
      meanLuma: lastLuma === null ? null : Math.round(lastLuma)
    },
    tracking: {
      delegate: s.delegate,
      poseModel: ui.poseModel.value,
      trackingFps: +fmt(s.trackingFps),
      poseMs: +fmt(s.poseMs),
      handsMs: +fmt(s.handsMs),
      latencyMs: +fmt(s.latencyMs)
    },
    summary: { passed, total: run.results.length },
    steps: run.results
  }
  try {
    const file = await window.gameMotion.testReport.save(JSON.stringify(report, null, 2))
    guidedSummary[guidedSummary.length - 1] = `Report saved: ${file.split('/').slice(-2).join('/')}`
  } catch (err) {
    guidedSummary[guidedSummary.length - 1] = `Could not save report: ${String(err)}`
    console.error('[test-run] save failed:', err)
  }
  console.info(`[test-run] finished: ${passed}/${run.results.length} passed`)
  renderControls()
}

/** Guided-test bookkeeping for each tracking result. */
function guidedOnFrame(snap: MotionSnapshot): void {
  if (!guided || guided.finished) return
  const now = performance.now()
  for (const e of snap.events) {
    if (e.type === 'calibrated') {
      const ref = motion.calibrationReference
      if (ref) {
        // Shoulder width as a share of the frame width: how big the player is in view.
        guided.extra.shoulderWidthPctOfFrame = +fmt((100 * ref.shoulderWidth) / motion.aspect)
        guided.extra.shoulderHeightPctFromTop = +fmt(100 * ref.shoulderMid.y)
        guided.extra.hipsVisible = ref.hipMid !== null
      }
      guided.extra.bodyInView = bodyExtent(lastFrame?.pose ?? null)
    }
    guided.onEvent(e, now)
  }
  guided.onFrame(snap, { left: motion.cursorRaw('left'), right: motion.cursorRaw('right') }, now)
}

function logInput(event: InputEvent, at: number): void {
  eventLog.push({ event, at })
  if (eventLog.length > 12) eventLog.shift()
  console.info(`[input] ${describe(event)}`)
}

/** Display-rate loop: predicted cursors, dwell selection, test layer. */
function inputLoop(now: number): void {
  rafHandle = requestAnimationFrame(inputLoop)
  if (mode !== 'settings') {
    // The launcher or a game is showing: it reads cursors itself; the test layer stays out of the way.
    inputOverlay.clear()
    return
  }
  const cursors = {
    left: motion.predictCursor('left', now),
    right: motion.predictCursor('right', now)
  }
  if (guided && !guided.finished) {
    if (guided.tick(now) === 'recalibrate') motion.recalibrate()
    const allowed = guided.activeDwellTargets
    dwell.targets = DWELL_TARGETS.filter((t) => allowed.includes(t.id))
  }
  // Report once, however the last step ended (timeout, gesture or dwell).
  if (guided?.finished && !guidedReported) {
    guidedReported = true
    dwell.targets = DWELL_TARGETS
    void finishGuidedTest(guided)
  }
  dwellState = dwell.update([cursors.left, cursors.right], now)
  if (dwellState.selected && guided && !guided.finished) {
    guided.onDwellSelect(dwellState.selected, now)
  }
  if (dwellState.selected === 'recalibrate') {
    motion.recalibrate()
    console.info('[input] recalibrate requested')
  } else if (dwellState.selected === 'test') {
    testPresses++
    console.info(`[input] test button pressed (${testPresses})`)
  }
  if (!ui.inputTest.checked) {
    inputOverlay.clear()
    return
  }
  inputOverlay.draw(now, {
    snapshot,
    cursors,
    targets: dwell.targets,
    labels: { recalibrate: 'Recalibrate', test: `Test button (${testPresses})` },
    dwell: dwellState,
    log: eventLog,
    test: guided ? { prompt: guided.prompt(now), summary: guidedSummary } : null
  })
}

function startInput(aspect: number): void {
  for (const m of motions) {
    m.aspect = aspect
    m.reset()
  }
  playerTracker = new PlayerTracker(playerCount, aspect)
  snapshot = null
  snapshots = [null, null]
  if (rafHandle === null) rafHandle = requestAnimationFrame(inputLoop)
}

function stopInput(): void {
  if (mode !== 'settings') enterSettings()
  abortGuidedTest()
  if (rafHandle !== null) cancelAnimationFrame(rafHandle)
  rafHandle = null
  for (const m of motions) m.reset()
  playerTracker.reset()
  snapshot = null
  snapshots = [null, null]
  eventLog.length = 0
  inputOverlay.clear()
}
let lastFrame: TrackingFrame | null = null
let cameraSettings: CameraSettings | null = null
let busy = false
let tuningText = 'off'
let lastLuma: number | null = null
const brightener = new DisplayBrightener(ui.video)

/** Game-only: hold the camera at full frame rate while we use it. */
async function applyCameraTuning(label: string): Promise<void> {
  if (!ui.holdFps.checked) {
    tuningText = 'off'
    return
  }
  try {
    const r = await window.gameMotion.cameraTuning.lockFrameRate(label)
    tuningText = r.applied ? `30 fps hold on ${r.device}` : `not applied: ${r.reason}`
  } catch (err) {
    tuningText = `not applied: ${err instanceof Error ? err.message : String(err)}`
  }
  console.info(`[camera-tuning] ${tuningText}`)
}

/** Puts the camera back the way it was before GameMotion used it. */
function releaseCameraTuning(): void {
  if (tuningText === 'off') return
  tuningText = 'off'
  void window.gameMotion.cameraTuning.restore().catch((err) => {
    console.warn('[camera-tuning] restore failed:', err)
  })
}

function resetBrightness(): void {
  lastLuma = null
  brightener.reset()
}

const camera = new CameraService(ui.video, {
  onDisconnected: (reason) => {
    stopInput()
    tracker.stop()
    releaseCameraTuning()
    resetBrightness()
    overlay.clear()
    cameraSettings = null
    showMessage(reason, true)
    renderControls()
  }
})

const tracker = new TrackingService({
  maxHz: Number(ui.maxHz.value),
  onFrame: (frame) => {
    lastFrame = frame
    overlay.draw(frame)
    // Split the frame into one per player, each driving its own MotionInput.
    const frames = playerTracker.split(frame)
    const updated = frames.map((f, i) => motions[i].update(f))
    snapshots = updated
    snapshot = updated[0]
    updated.forEach((snap, player) => {
      for (const e of snap.events) {
        if (player === 0) logInput(e, performance.now())
        for (const l of gameListeners) l(e, player)
      }
    })
    guidedOnFrame(updated[0])
    if (frame.luma !== undefined) {
      lastLuma = frame.luma
      brightener.update(frame.luma, ui.brighten.checked)
    }
  },
  onStatus: () => renderControls()
})

function readConfig(): TrackerConfig {
  return {
    delegate: ui.delegate.value as DelegatePreference,
    poseModel: ui.poseModel.value as PoseModel,
    // Two players: each half of the frame is tracked separately (one person each).
    views: playerCount === 2 ? 2 : 1,
    numPoses: 1,
    numHands: 2
  }
}

function showMessage(text: string | null, isError = false): void {
  ui.message.hidden = !text
  ui.message.textContent = text ?? ''
  ui.message.classList.toggle('error', isError)
}

async function refreshCameraList(): Promise<void> {
  const selected = ui.cameraSelect.value
  const cams = await camera.listCameras()
  ui.cameraSelect.replaceChildren(
    ...cams.map((c) => new Option(c.label, c.deviceId, false, c.deviceId === selected))
  )
  if (cams.length === 0) ui.cameraSelect.append(new Option('No camera found', ''))
}

async function startTracking(): Promise<void> {
  busy = true
  renderControls()
  try {
    showMessage('Opening camera...')
    cameraSettings = await camera.open(ui.cameraSelect.value || undefined)
    ui.stage.style.setProperty('--ar', `${cameraSettings.width} / ${cameraSettings.height}`)
    overlay.resize(cameraSettings.width, cameraSettings.height)
    console.info('[camera] opened', JSON.stringify(cameraSettings))
    await refreshCameraList() // labels become available after permission
    await applyCameraTuning(cameraSettings.label)

    showMessage('Loading tracking models...')
    await tracker.load(readConfig())
    startInput(cameraSettings.width / cameraSettings.height)
    tracker.start(ui.video)
    showMessage(null)
  } catch (err) {
    tracker.stop()
    camera.close()
    releaseCameraTuning()
    resetBrightness()
    cameraSettings = null
    showMessage(err instanceof Error ? err.message : String(err), true)
  } finally {
    busy = false
    renderControls()
  }
}

function stopTracking(): void {
  tracker.stop()
  stopInput()
  camera.close()
  releaseCameraTuning()
  resetBrightness()
  overlay.clear()
  lastFrame = null
  cameraSettings = null
  showMessage('Tracking stopped. Camera released.')
  renderControls()
}

function renderControls(): void {
  const running = tracker.stats.status === 'running'
  ui.toggle.textContent = busy ? 'Starting...' : running ? 'Stop tracking' : 'Start tracking'
  ui.toggle.classList.toggle('stop', running)
  ui.toggle.disabled = busy
  const testing = !!guided && !guided.finished
  ui.guided.textContent = testing ? 'Stop guided test' : 'Run guided test'
  ui.guided.disabled = busy
  for (const el of [ui.cameraSelect, ui.poseModel, ui.delegate, ui.holdFps]) {
    el.disabled = busy || running
  }
}

ui.play.addEventListener('click', () => void enterLauncher())
// Esc steps back: game -> launcher -> settings.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (mode === 'game') void enterLauncher()
  else if (mode === 'launcher') enterSettings()
})
ui.startFullscreen.addEventListener('change', () => {
  void window.gameMotion.store.setSettings({ startFullscreen: ui.startFullscreen.checked })
})
ui.autostart.addEventListener('change', () => {
  void window.gameMotion.store
    .setSettings({ autostart: ui.autostart.checked })
    .then((v) => (ui.autostart.checked = v.autostart))
    .catch((err) => {
      ui.autostart.checked = !ui.autostart.checked
      showMessage(`Could not change auto-start: ${String(err)}`, true)
    })
})
ui.guided.addEventListener('click', () => {
  if (guided && !guided.finished) abortGuidedTest()
  else void startGuidedTest()
})
ui.toggle.addEventListener('click', () => {
  if (tracker.stats.status === 'running') stopTracking()
  else void startTracking()
})
ui.maxHz.addEventListener('change', () => {
  tracker.setMaxHz(Number(ui.maxHz.value))
})
ui.brighten.addEventListener('change', () => {
  if (!ui.brighten.checked) brightener.reset()
})
navigator.mediaDevices.addEventListener('devicechange', () => void refreshCameraList())

// ---- Diagnostics -------------------------------------------------------------

const fmt = (n: number, digits = 1): string => n.toFixed(digits)

function renderDiagnostics(): void {
  const now = performance.now()
  const s = tracker.sample(now)
  const d = ui.d
  const statusText = s.status === 'error' ? `Error: ${s.error}` : s.status
  d.status.textContent = statusText
  d.status.className =
    s.status === 'error' ? 'status-error' : s.status === 'running' ? 'status-running' : ''

  if (cameraSettings && camera.isOpen) {
    const fr = cameraSettings.frameRate ? ` @ ${fmt(cameraSettings.frameRate, 0)} fps` : ''
    d.camera.textContent = `${cameraSettings.width}x${cameraSettings.height}${fr}`
    d.cameraFps.textContent = fmt(camera.observedFps(now))
  } else {
    d.camera.textContent = 'closed'
    d.cameraFps.textContent = '-'
  }
  const running = s.status === 'running'
  d.trackingFps.textContent = running ? fmt(s.trackingFps) : '-'
  d.inference.textContent = running ? `pose ${fmt(s.poseMs)} ms + hands ${fmt(s.handsMs)} ms` : '-'
  d.latency.textContent = running ? `${fmt(s.latencyMs)} ms (max ${fmt(s.latencyMaxMs)})` : '-'
  d.delegate.textContent = s.delegate
    ? s.fallbackReason
      ? `${s.delegate} (GPU failed)`
      : s.delegate
    : '-'
  d.delegate.title = s.fallbackReason ?? ''
  if (running && lastFrame) {
    const hands = lastFrame.hands.map((h) => h.handedness[0]).join('+') || 'none'
    d.detected.textContent = `body ${lastFrame.pose ? 'yes' : 'no'}, hands ${hands}`
  } else {
    d.detected.textContent = '-'
  }
  d.skipped.textContent = running
    ? `${s.framesSkippedBusy} busy, ${s.framesSkippedRate} rate cap / ${s.framesSent} sent`
    : '-'
  d.tuning.textContent = running ? tuningText : '-'
  d.body.textContent = running && lastFrame ? bodyLabel(bodyExtent(lastFrame.pose)) : '-'
  d.calibration.textContent =
    running && snapshot
      ? snapshot.calibration.status === 'calibrated'
        ? 'calibrated'
        : `${snapshot.calibration.status} ${Math.round(snapshot.calibration.progress * 100)}%`
      : '-'
  d.posture.textContent =
    running && snapshot
      ? `lean ${fmt(snapshot.lean, 2)}, crouch ${fmt(snapshot.crouchAmount, 2)}${snapshot.crouching ? ' (crouching)' : ''}`
      : '-'
  d.brightness.textContent =
    running && lastLuma !== null
      ? `luma ${fmt(lastLuma, 0)}/255, display ×${fmt(brightener.currentGain, 2)}`
      : '-'
}

function bodyLabel(extent: ReturnType<typeof bodyExtent>): string {
  return extent === 'none' ? 'no body' : extent === 'head' ? 'head only' : `head to ${extent}`
}

function logMetrics(): void {
  const now = performance.now()
  const s = tracker.sample(now)
  if (s.status !== 'running') return
  console.info(
    '[metrics] ' +
      JSON.stringify({
        cameraFps: +fmt(camera.observedFps(now)),
        trackingFps: +fmt(s.trackingFps),
        poseMs: +fmt(s.poseMs),
        handsMs: +fmt(s.handsMs),
        latencyMs: +fmt(s.latencyMs),
        latencyMaxMs: +fmt(s.latencyMaxMs),
        delegate: s.delegate,
        sent: s.framesSent,
        skippedBusy: s.framesSkippedBusy,
        skippedRate: s.framesSkippedRate,
        body: !!lastFrame?.pose,
        hands: lastFrame?.hands.length ?? 0,
        luma: lastLuma === null ? null : +fmt(lastLuma, 0),
        displayGain: +fmt(brightener.currentGain, 2),
        tuning: tuningText,
        bodyInView: bodyExtent(lastFrame?.pose ?? null),
        playersInView: snapshots.filter((s) => s?.tracked).length,
        bodiesDetected: lastFrame?.poses.length ?? 0,
        calibration: snapshot?.calibration.status ?? null,
        lean: snapshot ? +fmt(snapshot.lean, 2) : null,
        crouching: snapshot?.crouching ?? null,
        cursors: snapshot
          ? [snapshot.cursors.left, snapshot.cursors.right].filter(Boolean).length
          : 0
      })
  )
}

ui.d.versions.textContent = `Electron ${window.gameMotion.versions.electron} · Chromium ${window.gameMotion.versions.chrome}`
setInterval(renderDiagnostics, 250)
setInterval(logMetrics, 5000)
window.addEventListener('beforeunload', () => {
  tracker.dispose()
  camera.close()
  releaseCameraTuning() // main process also restores on quit/crash
})

renderControls()
void refreshCameraList().catch((err) => console.warn('[camera] enumerate failed:', err))
// Settings can be preset from the URL (used by the automated self-test).
const params = new URLSearchParams(location.search)
const preset = (el: HTMLSelectElement, key: string): void => {
  const v = params.get(key)
  if (v !== null && [...el.options].some((o) => o.value === v)) el.value = v
}
preset(ui.delegate, 'delegate')
preset(ui.poseModel, 'pose')
preset(ui.maxHz, 'hz')
if (params.get('hold') === '0') ui.holdFps.checked = false
if (params.get('brighten') === '0') ui.brighten.checked = false
tracker.setMaxHz(Number(ui.maxHz.value))
if (params.get('players') === '2') playerCount = 2
if (params.has('autostart') && params.get('game') === 'balloon-pop') {
  void enterGame(balloonPop, { autostart: params.has('play') })
} else if (params.has('autostart') && params.has('launcher')) {
  void enterLauncher()
} else if (params.has('autostart') && params.has('guided')) {
  void startGuidedTest()
} else if (params.has('autostart')) {
  void startTracking().then(() => {
    // Self-test: exercise stop -> restart once to verify release and reuse.
    if (!params.has('cycle')) return
    setTimeout(() => {
      stopTracking()
      setTimeout(() => void startTracking(), 2000)
    }, 8000)
  })
} else {
  // Normal start: straight into the gesture launcher (tracking starts automatically).
  void enterLauncher()
}
void renderSettings()
