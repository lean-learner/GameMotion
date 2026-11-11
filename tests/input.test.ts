import { describe, expect, it } from 'vitest'
import { measureBody } from '../src/renderer/src/input/body'
import { CursorTracker, playMap, zoneMap } from '../src/renderer/src/input/cursor'
import { DwellSelector } from '../src/renderer/src/input/dwell'
import { MotionInput } from '../src/renderer/src/input/MotionInput'
import { OneEuroFilter } from '../src/renderer/src/input/oneEuro'
import type { InputEvent, MotionSnapshot } from '../src/renderer/src/input/types'
import { ASPECT, sequence, synthFrame, type PoseSpec } from './helpers/synthPose'

/** Feeds frames, returns all events and the last snapshot. */
function run(
  input: MotionInput,
  frames: ReturnType<typeof sequence>
): { events: InputEvent[]; last: MotionSnapshot } {
  const events: InputEvent[] = []
  let last: MotionSnapshot | null = null
  for (const f of frames) {
    last = input.update(f)
    events.push(...last.events)
  }
  return { events, last: last! }
}

/** A MotionInput that has been calibrated standing still. Returns it and the end time. */
function calibrated(spec: PoseSpec = {}): { input: MotionInput; t: number } {
  const input = new MotionInput(ASPECT)
  const { events } = run(
    input,
    sequence(0, 1700, () => spec)
  )
  expect(events.filter((e) => e.type === 'calibrated')).toHaveLength(1)
  return { input, t: 1700 }
}

const ofType = <T extends InputEvent['type']>(
  events: InputEvent[],
  type: T
): Extract<InputEvent, { type: T }>[] =>
  events.filter((e): e is Extract<InputEvent, { type: T }> => e.type === type)

describe('OneEuroFilter', () => {
  it('removes most jitter from a still signal', () => {
    const f = new OneEuroFilter(1.2, 4)
    let maxDev = 0
    for (let i = 0; i < 300; i++) {
      const noisy = 0.5 + (i % 2 ? 0.01 : -0.01)
      const out = f.filter(noisy, i * 33.3)
      if (i > 30) maxDev = Math.max(maxDev, Math.abs(out - 0.5))
    }
    expect(maxDev).toBeLessThan(0.003) // 1% jitter -> under 0.3%
  })

  it('follows a fast move with little lag', () => {
    const f = new OneEuroFilter(1.2, 4)
    let out = 0
    for (let i = 0; i <= 10; i++) out = f.filter(i * 0.05, i * 33.3) // 1.5 units/s
    expect(out).toBeGreaterThan(0.4) // target 0.5
  })
})

describe('body measurement', () => {
  it('mirrors into player space: the left shoulder is on the left', () => {
    const body = measureBody(synthFrame({}, 0).pose, [], ASPECT)!
    expect(body.leftShoulder.x).toBeLessThan(body.rightShoulder.x)
    expect(body.shoulderWidth).toBeCloseTo(0.25)
  })

  it('needs both shoulders', () => {
    const f = synthFrame({}, 0)
    f.pose![12].visibility = 0.1
    expect(measureBody(f.pose, [], ASPECT)).toBeNull()
  })
})

describe('calibration', () => {
  it('calibrates after holding still for 1.5 s', () => {
    const input = new MotionInput(ASPECT)
    const mid = run(
      input,
      sequence(0, 1000, () => ({}))
    )
    expect(mid.last.calibration.status).toBe('holding')
    expect(mid.last.calibration.progress).toBeGreaterThan(0.6)
    const done = run(
      input,
      sequence(1033, 600, () => ({}))
    )
    expect(done.last.calibration.status).toBe('calibrated')
  })

  it('does not calibrate while the player keeps moving', () => {
    const input = new MotionInput(ASPECT)
    const { last } = run(
      input,
      sequence(0, 3000, (t) => ({ cx: 0.89 + 0.1 * Math.sin(t / 150) }))
    )
    expect(last.calibration.status).not.toBe('calibrated')
  })

  it('recalibrates when the player steps much closer', () => {
    const { input, t } = calibrated()
    const { last } = run(
      input,
      sequence(t, 1200, () => ({ sw: 0.36 }))
    )
    expect(last.calibration.status).not.toBe('calibrated')
    const again = run(
      input,
      sequence(t + 1233, 1700, () => ({ sw: 0.36 }))
    )
    expect(ofType(again.events, 'calibrated')).toHaveLength(1)
  })

  it('recalibrates if it was taken while crouched (player then stands taller)', () => {
    const { input, t } = calibrated({ cy: 0.35 + 0.6 * 0.25 }) // calibrated low
    const up = run(
      input,
      sequence(t, 1200, () => ({}))
    )
    expect(up.last.calibration.status).not.toBe('calibrated')
    run(
      input,
      sequence(t + 1233, 1700, () => ({}))
    ) // recalibrates standing
    const down = run(
      input,
      sequence(t + 2966, 300, () => ({ cy: 0.35 + 0.6 * 0.25 }))
    )
    expect(down.last.crouching).toBe(true)
  })

  it('does not recalibrate on a short stretch or tiptoe', () => {
    const { input, t } = calibrated()
    const { last } = run(
      input,
      sequence(t, 600, () => ({ cy: 0.35 - 0.4 * 0.25 }))
    )
    expect(last.calibration.status).toBe('calibrated')
  })

  it('keeps the calibration through a short tracking drop-out', () => {
    const { input, t } = calibrated()
    const f = synthFrame({}, t + 33)
    f.pose = null
    expect(input.update(f).calibration.status).toBe('calibrated')
  })
})

describe('crouch', () => {
  it('detects a crouch from the shoulders dropping, and standing up again', () => {
    const { input, t } = calibrated()
    const down = run(
      input,
      sequence(t, 300, () => ({ cy: 0.35 + 0.6 * 0.25 }))
    )
    expect(ofType(down.events, 'crouch')).toEqual([expect.objectContaining({ active: true })])
    expect(down.last.crouching).toBe(true)
    const up = run(
      input,
      sequence(t + 333, 300, () => ({}))
    )
    expect(ofType(up.events, 'crouch')).toEqual([expect.objectContaining({ active: false })])
  })

  it('works with the legs and hips out of frame', () => {
    const { input, t } = calibrated({ hips: false })
    const { last } = run(
      input,
      sequence(t, 300, () => ({ hips: false, cy: 0.35 + 0.6 * 0.25 }))
    )
    expect(last.crouching).toBe(true)
  })

  it('ignores a small dip (e.g. a nod or a breath)', () => {
    const { input, t } = calibrated()
    const { events } = run(
      input,
      sequence(t, 500, () => ({ cy: 0.35 + 0.2 * 0.25 }))
    )
    expect(ofType(events, 'crouch')).toHaveLength(0)
  })
})

describe('lean', () => {
  it("reports a lean to the player's right and back to centre", () => {
    const input = new MotionInput(ASPECT) // lean needs no calibration
    const right = run(
      input,
      sequence(0, 500, () => ({ tiltDeg: 22, hipOffset: 0.5 }))
    )
    expect(ofType(right.events, 'lean').map((e) => e.direction)).toEqual(['right'])
    expect(right.last.lean).toBeGreaterThan(0.8)
    const back = run(
      input,
      sequence(533, 500, () => ({}))
    )
    expect(ofType(back.events, 'lean').map((e) => e.direction)).toEqual(['center'])
  })

  it('reports a left lean from shoulder tilt alone (hips out of frame)', () => {
    const input = new MotionInput(ASPECT)
    const { events } = run(
      input,
      sequence(0, 500, () => ({ hips: false, tiltDeg: -20 }))
    )
    expect(ofType(events, 'lean').map((e) => e.direction)).toEqual(['left'])
  })

  it('does not fire a stream of events for a body jittering around the threshold', () => {
    const input = new MotionInput(ASPECT)
    // Tilt flips between a full lean and upright on every frame.
    const { events } = run(
      input,
      sequence(0, 2000, (t) => ({ hips: false, tiltDeg: Math.round(t / 33.3) % 2 ? -24 : 0 }))
    )
    expect(ofType(events, 'lean').length).toBeLessThanOrEqual(2)
  })

  it('ignores a slight tilt', () => {
    const input = new MotionInput(ASPECT)
    const { events } = run(
      input,
      sequence(0, 800, () => ({ tiltDeg: 6 }))
    )
    expect(ofType(events, 'lean')).toHaveLength(0)
  })
})

describe('swipes', () => {
  const sw = 0.25
  const shoulderY = 0.35

  it('detects a quick right-hand swipe to the right, once', () => {
    const { input, t } = calibrated()
    // Hand moves 1.6 shoulder widths in 250 ms, then rests there.
    const { events } = run(
      input,
      sequence(t, 800, (tt) => {
        const k = Math.min(1, (tt - t) / 250)
        return { rightWrist: { x: 0.95 + k * 1.6 * sw, y: shoulderY + 0.3 * sw } }
      })
    )
    expect(ofType(events, 'swipe')).toEqual([
      expect.objectContaining({ hand: 'right', direction: 'right' })
    ])
  })

  it('detects an upward swipe with the left hand', () => {
    const { input, t } = calibrated()
    const { events } = run(
      input,
      sequence(t, 400, (tt) => {
        const k = Math.min(1, (tt - t) / 250)
        return { leftWrist: { x: 0.7, y: shoulderY + 0.5 * sw - k * 1.4 * sw } } // chest -> above head
      })
    )
    expect(ofType(events, 'swipe')).toEqual([
      expect.objectContaining({ hand: 'left', direction: 'up' })
    ])
  })

  it('ignores the same distance done slowly (pointing, not swiping)', () => {
    const { input, t } = calibrated()
    const { events } = run(
      input,
      sequence(t, 1600, (tt) => {
        const k = Math.min(1, (tt - t) / 1500)
        return { rightWrist: { x: 0.95 + k * 1.6 * sw, y: shoulderY } }
      })
    )
    expect(ofType(events, 'swipe')).toHaveLength(0)
  })

  it('does not count quickly raising a hand to shoulder height as a swipe up', () => {
    const { input, t } = calibrated()
    const { events } = run(
      input,
      sequence(t, 500, (tt) => {
        const k = Math.min(1, (tt - t) / 150) // hanging -> shoulder height in 150 ms
        return { rightWrist: { x: 1.05, y: shoulderY + 1.4 * sw - k * 1.4 * sw } }
      })
    )
    expect(ofType(events, 'swipe')).toHaveLength(0)
  })

  it('ignores a one-frame tracking jump', () => {
    const { input, t } = calibrated()
    const { events } = run(
      input,
      sequence(t, 400, (tt) => ({
        rightWrist: { x: tt - t < 100 ? 0.95 : 0.95 + 1.6 * sw, y: shoulderY }
      }))
    )
    expect(ofType(events, 'swipe')).toHaveLength(0)
  })

  it('ignores a fast diagonal that is neither horizontal nor vertical', () => {
    const { input, t } = calibrated()
    const { events } = run(
      input,
      sequence(t, 400, (tt) => {
        const k = Math.min(1, (tt - t) / 250)
        return { rightWrist: { x: 0.95 + k * 1.2 * sw, y: shoulderY - k * 1.2 * sw } }
      })
    )
    expect(ofType(events, 'swipe')).toHaveLength(0)
  })
})

describe('cursors', () => {
  it('maps the reach zone onto the whole screen', () => {
    const body = measureBody(synthFrame({}, 0).pose, [], ASPECT)!
    const rs = body.rightShoulder
    const sw = body.shoulderWidth
    expect(zoneMap('right', { x: rs.x - 0.8 * sw, y: rs.y - 0.7 * sw }, body)).toEqual({
      x: 0,
      y: 0
    })
    const br = zoneMap('right', { x: rs.x + 1.2 * sw, y: rs.y + 0.8 * sw }, body)
    expect(br.x).toBeCloseTo(1)
    expect(br.y).toBeCloseTo(1)
  })

  it('game mapping is a mirror: centred on the body, even both ways, and unclamped', () => {
    const body = measureBody(synthFrame({}, 0).pose, [], ASPECT)!
    const sw = body.shoulderWidth
    const mid = body.shoulderMid
    const at = (dx: number): { x: number; y: number } => ({ x: mid.x + dx * sw, y: mid.y })
    expect(playMap('left', at(0), body).x).toBeCloseTo(0.5)
    // A hand in front of its own shoulder is on its own side of the screen.
    expect(playMap('left', body.leftShoulder, body).x).toBeLessThan(0.5)
    expect(playMap('right', body.rightShoulder, body).x).toBeGreaterThan(0.5)
    // The same hand travel moves the same distance on screen in both directions.
    const l = playMap('left', at(-1), body).x
    const r = playMap('left', at(1), body).x
    expect(0.5 - l).toBeCloseTo(r - 0.5)
    // Arm's length (0.5 + 1.2 shoulder widths from the centre) is the screen edge; further is off screen.
    expect(playMap('left', at(-1.7), body).x).toBeCloseTo(0)
    expect(playMap('left', at(-2.2), body).x).toBeLessThan(0)
  })

  it('keeps the game position moving past the screen edge', () => {
    const tracker = new CursorTracker('right')
    let t = 0
    let last = 0
    for (let i = 0; i < 40; i++, t += 33.3) {
      const f = synthFrame({ rightWrist: { x: 1.0 + i * 0.03, y: 0.35 } }, t)
      tracker.update(measureBody(f.pose, [], ASPECT), t)
      const c = tracker.predict(t)
      if (!c?.play) continue
      expect(c.play.x).toBeGreaterThanOrEqual(last)
      last = c.play.x
      expect(c.x).toBeLessThanOrEqual(1)
    }
    expect(last).toBeGreaterThan(1)
  })

  it('hides a cursor while the arm hangs down, shows it when raised', () => {
    const { input, t } = calibrated()
    expect(input.update(synthFrame({}, t + 33)).cursors.right).toBeNull()
    const raised = input.update(synthFrame({ rightWrist: { x: 1.1, y: 0.35 } }, t + 66))
    expect(raised.cursors.right).not.toBeNull()
    expect(raised.cursors.left).toBeNull()
  })

  it('prefers hand-tracking palms over the pose wrist', () => {
    const frame = synthFrame({ rightWrist: { x: 1.1, y: 0.35 } }, 0)
    const palmRaw = { x: 1 - 1.12 / ASPECT, y: 0.33, z: 0 }
    frame.hands = [{ handedness: 'Right', score: 0.9, landmarks: Array(21).fill(palmRaw) }]
    const c = new CursorTracker('right').update(measureBody(frame.pose, frame.hands, ASPECT), 0)
    expect(c?.source).toBe('hand')
  })

  it('predicts ahead along the motion, capped at 60 ms', () => {
    const tracker = new CursorTracker('right')
    let t = 0
    for (let i = 0; i < 15; i++, t += 33.3) {
      const f = synthFrame({ rightWrist: { x: 0.9 + i * 0.01, y: 0.35 } }, t)
      tracker.update(measureBody(f.pose, [], ASPECT), t)
    }
    const now = tracker.state!.x
    const p30 = tracker.predict(t - 33.3 + 30)!.x
    const p500 = tracker.predict(t - 33.3 + 500)!.x
    const p60 = tracker.predict(t - 33.3 + 60)!.x
    expect(p30).toBeGreaterThan(now)
    expect(p500).toBeCloseTo(p60) // capped
  })
})

describe('dwell selection', () => {
  const target = { id: 'play', x: 0.4, y: 0.4, w: 0.2, h: 0.2 }

  it('selects after hovering for the dwell time, once', () => {
    const d = new DwellSelector([target], 1000)
    const c = { x: 0.5, y: 0.5 }
    expect(d.update([c], 0).hover).toEqual({ id: 'play', progress: 0 })
    expect(d.update([c], 500).hover?.progress).toBeCloseTo(0.5)
    expect(d.update([c], 1000).selected).toBe('play')
    expect(d.update([c], 2500).selected).toBeNull() // must leave first
    d.update([null], 2600)
    d.update([c], 2700)
    expect(d.update([c], 3700).selected).toBe('play')
  })

  it('resets progress when the cursor leaves', () => {
    const d = new DwellSelector([target], 1000)
    d.update([{ x: 0.5, y: 0.5 }], 0)
    d.update([{ x: 0.9, y: 0.9 }], 600)
    expect(d.update([{ x: 0.5, y: 0.5 }], 700).hover?.progress).toBe(0)
  })

  it('works with either hand', () => {
    const d = new DwellSelector([target], 100)
    d.update([null, { x: 0.5, y: 0.5 }], 0)
    expect(d.update([null, { x: 0.5, y: 0.5 }], 100).selected).toBe('play')
  })
})
