import { describe, expect, it } from 'vitest'
import type { InputEvent, MotionSnapshot, Side, Vec2 } from '../src/renderer/src/input/types'
import { DEFAULT_STEPS, GuidedTest, INTRO_MS } from '../src/renderer/src/testrun/GuidedTest'

const snap = (over: Partial<MotionSnapshot> = {}): MotionSnapshot => ({
  time: 0,
  tracked: true,
  calibration: { status: 'calibrated', progress: 1 },
  cursors: { left: null, right: null },
  lean: 0,
  crouching: false,
  crouchAmount: 0,
  events: [],
  ...over
})
const noRaw: Record<Side, Vec2 | null> = { left: null, right: null }

/** Moves a run past the current intro; returns the step start time. */
function beginStep(g: GuidedTest, now: number): number {
  g.tick(now + INTRO_MS)
  return now + INTRO_MS
}

describe('GuidedTest', () => {
  it('walks every step, recording a timeout when nothing happens', () => {
    const g = new GuidedTest()
    let t = 0
    g.start(t)
    for (const step of DEFAULT_STEPS) {
      t = beginStep(g, t)
      t += step.timeoutMs
      g.tick(t)
    }
    expect(g.finished).toBe(true)
    expect(g.results).toHaveLength(DEFAULT_STEPS.length)
    expect(g.results.find((r) => r.id === 'swipe-right')?.status).toBe('timeout')
    // Timed steps are analysed, not timed out: an idle run with no events passes.
    expect(g.results.find((r) => r.id === 'idle')?.status).toBe('pass')
  })

  it('asks for a recalibration when the calibration step starts', () => {
    const g = new GuidedTest()
    g.start(0)
    expect(g.tick(100)).toBeNull() // still reading the instruction
    expect(g.tick(INTRO_MS)).toBe('recalibrate')
  })

  it('passes an event step on the expected gesture and records others', () => {
    const g = new GuidedTest(DEFAULT_STEPS.filter((s) => s.id === 'swipe-right'))
    g.start(0)
    const t = beginStep(g, 0)
    const wrong: InputEvent = { type: 'swipe', hand: 'right', direction: 'up', time: t }
    const right: InputEvent = { type: 'swipe', hand: 'right', direction: 'right', time: t }
    g.onEvent(wrong, t + 500)
    g.onEvent(right, t + 1200)
    expect(g.results[0]).toMatchObject({
      status: 'pass',
      detectMs: 1200,
      otherEvents: ['swipe-up(right)']
    })
  })

  it('ignores gestures made while the instruction is still showing', () => {
    const g = new GuidedTest(DEFAULT_STEPS.filter((s) => s.id === 'lean-left'))
    g.start(0)
    g.onEvent({ type: 'lean', direction: 'left', time: 100 }, 100)
    expect(g.results).toHaveLength(0)
  })

  it('measures reach and fails when a hand cannot reach every edge', () => {
    const g = new GuidedTest(DEFAULT_STEPS.filter((s) => s.id === 'reach-right'))
    g.start(0)
    let t = beginStep(g, 0)
    // The hand reaches left/right/top but never the bottom edge.
    for (const raw of [
      { x: -0.1, y: 0.5 },
      { x: 1.2, y: 0.5 },
      { x: 0.5, y: -0.05 },
      { x: 0.5, y: 0.8 }
    ]) {
      g.onFrame(snap(), { left: null, right: raw }, (t += 33))
    }
    g.tick(t + 12000)
    expect(g.results[0].status).toBe('fail')
    expect(g.results[0].metrics).toMatchObject({ reachMinX: -0.1, reachMaxX: 1.2, reachMaxY: 0.8 })
  })

  it('measures cursor jitter on the steady step', () => {
    const g = new GuidedTest(DEFAULT_STEPS.filter((s) => s.id === 'steady'))
    g.start(0)
    const start = beginStep(g, 0)
    for (let t = start; t < start + 5000; t += 33) {
      const wobble = ((t / 33) % 2) * 0.004
      g.onFrame(
        snap({ cursors: { left: null, right: { x: 0.5 + wobble, y: 0.5, source: 'hand' } } }),
        noRaw,
        t
      )
    }
    g.tick(start + 5000)
    expect(g.results[0].status).toBe('pass')
    expect(g.results[0].metrics.jitterStd).toBeLessThan(0.01)
  })

  it('fails the idle step on a false gesture and reports lost tracking', () => {
    const g = new GuidedTest(DEFAULT_STEPS.filter((s) => s.id === 'idle'))
    g.start(0)
    const t = beginStep(g, 0)
    g.onFrame(snap({ tracked: false }), noRaw, t + 10)
    g.onFrame(snap(), noRaw, t + 40)
    g.onEvent({ type: 'swipe', hand: 'left', direction: 'down', time: t + 50 }, t + 50)
    g.tick(t + 12000)
    expect(g.results[0]).toMatchObject({
      status: 'fail',
      trackingLostPct: 50,
      metrics: { falseGestures: 1 }
    })
  })

  it('enables dwell buttons only during the dwell step', () => {
    const g = new GuidedTest(DEFAULT_STEPS.filter((s) => ['steady', 'dwell'].includes(s.id)))
    g.start(0)
    let t = beginStep(g, 0)
    expect(g.activeDwellTargets).toEqual([])
    g.tick((t += 5000))
    expect(g.activeDwellTargets).toEqual([]) // intro of the dwell step
    t = beginStep(g, t)
    expect(g.activeDwellTargets).toEqual(['test'])
    g.onDwellSelect('test', t + 2000)
    expect(g.results[1]).toMatchObject({ status: 'pass', detectMs: 2000 })
  })

  it('attaches caller-provided metrics to the step that completes', () => {
    const g = new GuidedTest(DEFAULT_STEPS.filter((s) => s.id === 'calibrate'))
    g.start(0)
    const t = beginStep(g, 0)
    g.extra.shoulderWidth = 0.25
    g.onEvent({ type: 'calibrated', time: t + 1600 }, t + 1600)
    expect(g.results[0].metrics.shoulderWidth).toBe(0.25)
  })
})
