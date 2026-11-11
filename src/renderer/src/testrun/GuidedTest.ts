import type { InputEvent, MotionSnapshot, Side, Vec2 } from '../input/types'

/**
 * Guided test run: prompts the player through each motion input, detects the
 * result, and records numbers only (no images). Time is passed in, so the
 * whole run can be unit-tested with synthetic input.
 */

type Expectation =
  | { kind: 'event'; match: (e: InputEvent) => boolean }
  | { kind: 'dwell'; target: string }
  | { kind: 'timed'; analyse: 'reach-left' | 'reach-right' | 'steady' | 'idle' }

export interface StepDef {
  id: string
  title: string
  instruction: string
  timeoutMs: number
  expect: Expectation
  /** Recalibrate when this step starts (calibration step). */
  recalibrate?: boolean
  /** Which dwell buttons work during this step (all others are disabled). */
  dwellTargets?: string[]
}

export type StepStatus = 'pass' | 'fail' | 'timeout'

export interface StepResult {
  id: string
  title: string
  status: StepStatus
  /** Time from step start to detection (event/dwell steps). */
  detectMs: number | null
  /** Gestures detected during the step other than the expected one. */
  otherEvents: string[]
  /** Share of frames in which the shoulders were not tracked (camera framing). */
  trackingLostPct: number
  metrics: Record<string, number | string | boolean | null>
}

const swipe = (hand: Side | 'any', direction: string) => (e: InputEvent) =>
  e.type === 'swipe' && e.direction === direction && (hand === 'any' || e.hand === hand)

export const DEFAULT_STEPS: StepDef[] = [
  {
    id: 'calibrate',
    title: 'Calibration',
    instruction: 'Stand at your play spot, arms down, and hold still',
    timeoutMs: 20000,
    expect: { kind: 'event', match: (e) => e.type === 'calibrated' },
    recalibrate: true
  },
  {
    id: 'reach-right',
    title: 'Right-hand reach',
    instruction: 'Raise your RIGHT hand and slowly trace all four corners of the screen',
    timeoutMs: 12000,
    expect: { kind: 'timed', analyse: 'reach-right' }
  },
  {
    id: 'reach-left',
    title: 'Left-hand reach',
    instruction: 'Now your LEFT hand: slowly trace all four corners',
    timeoutMs: 12000,
    expect: { kind: 'timed', analyse: 'reach-left' }
  },
  {
    id: 'steady',
    title: 'Steady hand',
    instruction: 'Hold your RIGHT hand still at chest height',
    timeoutMs: 5000,
    expect: { kind: 'timed', analyse: 'steady' }
  },
  {
    id: 'dwell',
    title: 'Select a button',
    instruction: 'Point at the TEST button and hold until it fills',
    timeoutMs: 15000,
    expect: { kind: 'dwell', target: 'test' },
    dwellTargets: ['test']
  },
  {
    id: 'swipe-right',
    title: 'Swipe right',
    instruction: 'Quick swipe to the RIGHT with your right hand (start at chest height)',
    timeoutMs: 10000,
    expect: { kind: 'event', match: swipe('right', 'right') }
  },
  {
    id: 'swipe-left',
    title: 'Swipe left',
    instruction: 'Quick swipe to the LEFT with your left hand',
    timeoutMs: 10000,
    expect: { kind: 'event', match: swipe('left', 'left') }
  },
  {
    id: 'swipe-up',
    title: 'Swipe up',
    instruction: 'Quick swipe UP with either hand, from chest to above your head',
    timeoutMs: 10000,
    expect: { kind: 'event', match: swipe('any', 'up') }
  },
  {
    id: 'swipe-down',
    title: 'Swipe down',
    instruction: 'Quick swipe DOWN with either hand, from above your head to your chest',
    timeoutMs: 10000,
    expect: { kind: 'event', match: swipe('any', 'down') }
  },
  {
    id: 'lean-left',
    title: 'Lean left',
    instruction: 'Lean your upper body to your LEFT',
    timeoutMs: 10000,
    expect: { kind: 'event', match: (e) => e.type === 'lean' && e.direction === 'left' }
  },
  {
    id: 'lean-right',
    title: 'Lean right',
    instruction: 'Lean your upper body to your RIGHT',
    timeoutMs: 10000,
    expect: { kind: 'event', match: (e) => e.type === 'lean' && e.direction === 'right' }
  },
  {
    id: 'crouch',
    title: 'Crouch',
    instruction: 'Stand straight, then CROUCH down',
    timeoutMs: 10000,
    expect: { kind: 'event', match: (e) => e.type === 'crouch' && e.active }
  },
  {
    id: 'stand',
    title: 'Stand up',
    instruction: 'Now STAND UP straight',
    timeoutMs: 10000,
    expect: { kind: 'event', match: (e) => e.type === 'crouch' && !e.active }
  },
  {
    id: 'idle',
    title: 'Idle (false gestures)',
    instruction: 'Stand naturally and move a little for 12 s - no gestures, arms down',
    timeoutMs: 12000,
    expect: { kind: 'timed', analyse: 'idle' }
  }
]

/** Time to read the next instruction before a step starts counting. */
export const INTRO_MS = 3000
/** Steady-hand: ignore the first second while the player settles. */
const STEADY_SETTLE_MS = 1000
/** Reach: a hand "reaches" an edge when its raw zone position gets this close. */
const EDGE_MARGIN = 0.03

export type Phase = 'intro' | 'step' | 'done'

export interface TestPrompt {
  phase: Phase
  index: number
  total: number
  step: StepDef | null
  /** 0..1 through the intro or the step's time limit. */
  progress: number
}

interface Accumulator {
  frames: number
  untracked: number
  other: string[]
  minX: number
  maxX: number
  minY: number
  maxY: number
  activeFrames: number
  points: Vec2[]
  peakLean: number
  peakCrouch: number
  idleEvents: number
}

const freshAcc = (): Accumulator => ({
  frames: 0,
  untracked: 0,
  other: [],
  minX: Infinity,
  maxX: -Infinity,
  minY: Infinity,
  maxY: -Infinity,
  activeFrames: 0,
  points: [],
  peakLean: 0,
  peakCrouch: 0,
  idleEvents: 0
})

const round = (v: number, d = 3): number => Math.round(v * 10 ** d) / 10 ** d

export function describeEvent(e: InputEvent): string {
  switch (e.type) {
    case 'calibrated':
      return 'calibrated'
    case 'swipe':
      return `swipe-${e.direction}(${e.hand})`
    case 'crouch':
      return e.active ? 'crouch' : 'stand'
    case 'lean':
      return `lean-${e.direction}`
  }
}

export class GuidedTest {
  readonly results: StepResult[] = []
  private index = -1
  private phase: Phase = 'intro'
  private phaseStart = 0
  private acc = freshAcc()

  constructor(readonly steps: StepDef[] = DEFAULT_STEPS) {}

  get finished(): boolean {
    return this.phase === 'done'
  }

  /** Dwell buttons enabled right now (only during the step that uses them). */
  get activeDwellTargets(): string[] {
    return this.phase === 'step' ? (this.steps[this.index]?.dwellTargets ?? []) : []
  }

  start(now: number): void {
    this.results.length = 0
    this.index = 0
    this.enter('intro', now)
  }

  prompt(now: number): TestPrompt {
    const step = this.steps[this.index] ?? null
    const span = this.phase === 'intro' ? INTRO_MS : (step?.timeoutMs ?? 1)
    return {
      phase: this.phase,
      index: this.index,
      total: this.steps.length,
      step: this.phase === 'done' ? null : step,
      progress: this.phase === 'done' ? 1 : Math.min(1, (now - this.phaseStart) / span)
    }
  }

  /**
   * Advances the run. Returns 'recalibrate' when the caller should reset
   * calibration (at the start of the calibration step).
   */
  tick(now: number): 'recalibrate' | null {
    if (this.phase === 'done' || this.index < 0) return null
    const step = this.steps[this.index]
    if (this.phase === 'intro') {
      if (now - this.phaseStart < INTRO_MS) return null
      this.enter('step', now)
      return step.recalibrate ? 'recalibrate' : null
    }
    if (now - this.phaseStart >= step.timeoutMs) {
      this.finish(step.expect.kind === 'timed' ? this.analyse(step) : 'timeout', now, null)
    }
    return null
  }

  onFrame(snap: MotionSnapshot, raw: Record<Side, Vec2 | null>, now: number): void {
    if (this.phase !== 'step') return
    const step = this.steps[this.index]
    const a = this.acc
    a.frames++
    if (!snap.tracked) a.untracked++
    a.peakLean = Math.max(a.peakLean, Math.abs(snap.lean))
    a.peakCrouch = Math.max(a.peakCrouch, snap.crouchAmount)
    if (step.expect.kind !== 'timed') return
    const kind = step.expect.analyse
    if (kind === 'reach-left' || kind === 'reach-right') {
      const r = raw[kind === 'reach-left' ? 'left' : 'right']
      if (r) {
        a.activeFrames++
        a.minX = Math.min(a.minX, r.x)
        a.maxX = Math.max(a.maxX, r.x)
        a.minY = Math.min(a.minY, r.y)
        a.maxY = Math.max(a.maxY, r.y)
      }
    } else if (kind === 'steady' && now - this.phaseStart >= STEADY_SETTLE_MS) {
      const c = snap.cursors.right
      if (c) a.points.push({ x: c.x, y: c.y })
    }
  }

  onEvent(e: InputEvent, now: number): void {
    if (this.phase !== 'step') return
    const step = this.steps[this.index]
    if (step.expect.kind === 'event' && step.expect.match(e)) {
      this.finish('pass', now, now - this.phaseStart)
      return
    }
    if (step.expect.kind === 'timed' && step.expect.analyse === 'idle' && e.type !== 'calibrated') {
      this.acc.idleEvents++
    }
    this.acc.other.push(describeEvent(e))
  }

  onDwellSelect(id: string, now: number): void {
    if (this.phase !== 'step') return
    const step = this.steps[this.index]
    if (step.expect.kind === 'dwell' && step.expect.target === id) {
      this.finish('pass', now, now - this.phaseStart)
    }
  }

  /**
   * Extra metrics for the current step, filled in by the caller before it
   * reports the event that completes the step (e.g. calibration values).
   */
  readonly extra: Record<string, number | string | boolean | null> = {}

  private analyse(step: StepDef): StepStatus {
    const a = this.acc
    if (step.expect.kind !== 'timed') return 'fail'
    switch (step.expect.analyse) {
      case 'reach-left':
      case 'reach-right': {
        if (a.activeFrames === 0) return 'fail'
        return a.minX <= EDGE_MARGIN &&
          a.maxX >= 1 - EDGE_MARGIN &&
          a.minY <= EDGE_MARGIN &&
          a.maxY >= 1 - EDGE_MARGIN
          ? 'pass'
          : 'fail'
      }
      case 'steady': {
        if (a.points.length < 10) return 'fail'
        return stdDev(a.points) < 0.01 ? 'pass' : 'fail'
      }
      case 'idle':
        return a.idleEvents === 0 ? 'pass' : 'fail'
    }
  }

  private finish(status: StepStatus, now: number, detectMs: number | null): void {
    const step = this.steps[this.index]
    const a = this.acc
    const metrics: StepResult['metrics'] = { ...this.extra }
    if (step.expect.kind === 'timed') {
      const kind = step.expect.analyse
      if (kind === 'reach-left' || kind === 'reach-right') {
        const any = a.activeFrames > 0
        Object.assign(metrics, {
          reachMinX: any ? round(a.minX) : null,
          reachMaxX: any ? round(a.maxX) : null,
          reachMinY: any ? round(a.minY) : null,
          reachMaxY: any ? round(a.maxY) : null,
          cursorVisiblePct: a.frames ? round((100 * a.activeFrames) / a.frames, 1) : 0
        })
      } else if (kind === 'steady') {
        metrics.jitterStd = a.points.length ? round(stdDev(a.points), 4) : null
        metrics.jitterPxAt1080p = a.points.length ? round(stdDev(a.points) * 1080, 1) : null
        metrics.samples = a.points.length
      } else {
        metrics.falseGestures = a.idleEvents
      }
    }
    if (step.id.startsWith('lean')) metrics.peakLean = round(a.peakLean, 2)
    if (step.id === 'crouch') metrics.peakCrouchAmount = round(a.peakCrouch, 2)
    this.results.push({
      id: step.id,
      title: step.title,
      status,
      detectMs: detectMs === null ? null : Math.round(detectMs),
      otherEvents: a.other,
      trackingLostPct: a.frames ? round((100 * a.untracked) / a.frames, 1) : 0,
      metrics
    })
    this.index++
    this.enter(this.index >= this.steps.length ? 'done' : 'intro', now)
  }

  private enter(phase: Phase, now: number): void {
    this.phase = phase
    this.phaseStart = now
    this.acc = freshAcc()
    for (const k of Object.keys(this.extra)) delete this.extra[k]
  }
}

/** Combined standard deviation of x and y (distance from the mean point). */
function stdDev(points: Vec2[]): number {
  const n = points.length
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  const v = points.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / n
  return Math.sqrt(v)
}
