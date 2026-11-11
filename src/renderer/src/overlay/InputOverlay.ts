import type { DwellState, DwellTarget } from '../input/dwell'
import type { InputEvent, MotionSnapshot, Side, Vec2 } from '../input/types'
import type { TestPrompt } from '../testrun/GuidedTest'

const COLORS: Record<Side, string> = { left: '#ffb02e', right: '#7cff6b' }
const LOG_MS = 4000

export interface InputOverlayState {
  snapshot: MotionSnapshot | null
  cursors: Record<Side, Vec2 | null>
  targets: DwellTarget[]
  labels: Record<string, string>
  dwell: DwellState
  log: { event: InputEvent; at: number }[]
  /** Guided test run in progress (or its summary), if any. */
  test: { prompt: TestPrompt; summary: string[] } | null
}

/**
 * Test view for the Motion Input layer, drawn at display rate on its own
 * canvas above the camera view. Everything is in game-screen space (0..1),
 * which here is mapped onto the stage.
 */
export class InputOverlay {
  private readonly ctx: CanvasRenderingContext2D

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas not available')
    this.ctx = ctx
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  draw(now: number, s: InputOverlayState): void {
    this.fitToElement()
    this.clear()
    const ctx = this.ctx
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const w = this.canvas.width / dpr
    const h = this.canvas.height / dpr
    const u = Math.min(w, h) / 100 // size unit

    // Dwell targets
    for (const tg of s.targets) {
      const hover = s.dwell.hover?.id === tg.id ? s.dwell.hover.progress : 0
      const x = tg.x * w
      const y = tg.y * h
      ctx.fillStyle = hover ? 'rgba(54, 209, 255, 0.35)' : 'rgba(20, 24, 32, 0.7)'
      ctx.strokeStyle = '#36d1ff'
      ctx.lineWidth = 0.4 * u
      ctx.beginPath()
      ctx.roundRect(x, y, tg.w * w, tg.h * h, 1.5 * u)
      ctx.fill()
      ctx.stroke()
      if (hover) {
        ctx.fillStyle = 'rgba(54, 209, 255, 0.6)'
        ctx.fillRect(x, y + tg.h * h - 1.2 * u, tg.w * w * hover, 1.2 * u)
      }
      this.text(s.labels[tg.id] ?? tg.id, x + (tg.w * w) / 2, y + (tg.h * h) / 2, 3.2 * u)
    }

    const snap = s.snapshot
    if (snap) {
      // Calibration prompt (the guided test gives its own instructions)
      if (snap.calibration.status !== 'calibrated' && !s.test) {
        const cx = w / 2
        const cy = h * 0.42
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.beginPath()
        ctx.roundRect(cx - 32 * u, cy - 14 * u, 64 * u, 26 * u, 2 * u)
        ctx.fill()
        this.text(
          snap.calibration.status === 'waiting'
            ? 'Step into view'
            : 'Stand straight and hold still',
          cx,
          cy - 6 * u,
          3.4 * u
        )
        ctx.lineWidth = 1.2 * u
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'
        ctx.beginPath()
        ctx.arc(cx, cy + 4 * u, 5 * u, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = '#36d1ff'
        ctx.beginPath()
        ctx.arc(
          cx,
          cy + 4 * u,
          5 * u,
          -Math.PI / 2,
          -Math.PI / 2 + snap.calibration.progress * Math.PI * 2
        )
        ctx.stroke()
      }

      // Lean meter (bottom centre) and crouch badge
      const mx = w / 2
      const my = h - 8 * u
      const mw = 40 * u
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(mx - mw / 2, my - 1 * u, mw, 2 * u)
      ctx.fillStyle = Math.abs(snap.lean) > 0.5 ? '#36d1ff' : '#ffffff'
      ctx.beginPath()
      ctx.arc(mx + (snap.lean * mw) / 2, my, 2 * u, 0, Math.PI * 2)
      ctx.fill()
      this.text('lean', mx, my - 4 * u, 2.4 * u)
      ctx.fillStyle = snap.crouching ? '#ff5c6c' : 'rgba(0,0,0,0.55)'
      ctx.fillRect(
        mx + mw / 2 + 4 * u,
        my - 3 * u,
        16 * u * Math.max(snap.crouchAmount, 0.02),
        6 * u
      )
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 0.3 * u
      ctx.strokeRect(mx + mw / 2 + 4 * u, my - 3 * u, 16 * u, 6 * u)
      this.text(snap.crouching ? 'CROUCH' : 'crouch', mx + mw / 2 + 12 * u, my, 2.4 * u)
    }

    // Recent gestures (bottom right)
    let ly = h - 6 * u
    for (const { event, at } of [...s.log].reverse()) {
      const age = now - at
      if (age > LOG_MS) continue
      ctx.globalAlpha = 1 - age / LOG_MS
      this.text(describe(event), w - 22 * u, ly, 2.8 * u)
      ly -= 4 * u
    }
    ctx.globalAlpha = 1

    if (s.test) this.drawTest(s.test, w, h, u)

    // Cursors (predicted, display rate)
    for (const side of ['left', 'right'] as const) {
      const c = s.cursors[side]
      if (!c) continue
      const x = c.x * w
      const y = c.y * h
      ctx.fillStyle = COLORS[side]
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.arc(x, y, 4 * u, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineWidth = 0.6 * u
      ctx.strokeStyle = COLORS[side]
      ctx.beginPath()
      ctx.arc(x, y, 4 * u, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  private drawTest(
    test: { prompt: TestPrompt; summary: string[] },
    w: number,
    h: number,
    u: number
  ): void {
    const ctx = this.ctx
    const { prompt, summary } = test
    const pw = Math.min(w * 0.62, 110 * u)
    const px = (w - pw) / 2
    const lines = prompt.phase === 'done' ? summary : []
    const ph = prompt.phase === 'done' ? (8 + lines.length * 4.2) * u : 24 * u
    const py = h * 0.05
    ctx.fillStyle = 'rgba(8, 10, 14, 0.82)'
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 2 * u)
    ctx.fill()
    if (prompt.phase === 'done') {
      lines.forEach((line, i) => this.text(line, w / 2, py + (5 + i * 4.2) * u, 2.8 * u))
      return
    }
    const step = prompt.step
    if (!step) return
    const head =
      prompt.phase === 'intro'
        ? `Next (${prompt.index + 1}/${prompt.total}): ${step.title}`
        : `${prompt.index + 1}/${prompt.total}  ${step.title}`
    this.text(head, w / 2, py + 6 * u, 3.6 * u)
    this.text(step.instruction, w / 2, py + 13 * u, 2.9 * u)
    // Progress: intro countdown (blue) or time left for the step (amber).
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(px + 4 * u, py + 19 * u, pw - 8 * u, 1.4 * u)
    ctx.fillStyle = prompt.phase === 'intro' ? '#36d1ff' : '#ffb02e'
    ctx.fillRect(px + 4 * u, py + 19 * u, (pw - 8 * u) * prompt.progress, 1.4 * u)
    if (prompt.phase === 'intro') {
      ctx.fillStyle = 'rgba(54, 209, 255, 0.9)'
      this.text('get ready...', w / 2, py + 22.4 * u, 2.2 * u)
    }
  }

  private text(str: string, x: number, y: number, size: number): void {
    const ctx = this.ctx
    ctx.font = `600 ${size}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = size / 4
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.strokeText(str, x, y)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(str, x, y)
  }

  private fitToElement(): void {
    const dpr = window.devicePixelRatio || 1
    const r = this.canvas.getBoundingClientRect()
    const w = Math.round(r.width * dpr)
    const h = Math.round(r.height * dpr)
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
  }
}

export function describe(e: InputEvent): string {
  switch (e.type) {
    case 'calibrated':
      return 'calibrated'
    case 'swipe':
      return `${e.hand} hand swipe ${e.direction}`
    case 'crouch':
      return e.active ? 'crouch' : 'stand up'
    case 'lean':
      return e.direction === 'center' ? 'lean centre' : `lean ${e.direction}`
  }
}
