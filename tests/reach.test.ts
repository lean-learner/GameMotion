import { describe, expect, it } from 'vitest'
import { measureBody } from '../src/renderer/src/input/body'
import {
  DEFAULT_REACH,
  handRelative,
  zoneMap,
  type HandRelative
} from '../src/renderer/src/input/cursor'
import { fitReach, MIN_SAMPLES, validReach } from '../src/renderer/src/input/reach'
import { ASPECT, synthFrame } from './helpers/synthPose'

/** Points around an ellipse: centre (out, down), radii (rOut, rDown). */
function circle(n: number, out: number, down: number, rOut: number, rDown: number): HandRelative[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { out: out + rOut * Math.cos(a), down: down + rDown * Math.sin(a) }
  })
}

describe('reach fitting', () => {
  it('fits the extent of the traced circles, a little inside for comfort', () => {
    // Hand traced from 0.4 across the body to 1.6 out, and 1.0 above to 0.6 below the shoulder.
    const z = fitReach(circle(200, 0.6, -0.2, 1.0, 0.8))!
    expect(z.outward).toBeGreaterThan(1.3)
    expect(z.outward).toBeLessThan(1.6)
    expect(z.inward).toBeGreaterThan(0.25)
    expect(z.inward).toBeLessThan(0.45)
    expect(z.up).toBeGreaterThan(0.75)
    expect(z.down).toBeGreaterThan(0.4)
  })

  it('needs enough samples', () => {
    expect(fitReach(circle(MIN_SAMPLES - 1, 0.5, 0, 1, 1))).toBeNull()
  })

  it('ignores a few wild tracking jumps', () => {
    const samples = [...circle(200, 0.6, -0.2, 1.0, 0.8), { out: 9, down: -9 }, { out: 8, down: 9 }]
    expect(fitReach(samples)!.outward).toBeLessThan(1.6)
  })

  it('clamps to sane limits', () => {
    const z = fitReach(circle(200, 0, 0, 0.05, 0.05))! // barely moved
    expect(z.outward).toBe(0.5)
    expect(z.up).toBe(0.3)
  })

  it('validates stored zones', () => {
    expect(validReach(DEFAULT_REACH)).toEqual(DEFAULT_REACH)
    expect(validReach({ ...DEFAULT_REACH, up: 50 })).toBeNull()
    expect(validReach({ inward: 1 })).toBeNull()
    expect(validReach('junk')).toBeNull()
  })
})

describe('reach zone in cursor mapping', () => {
  const body = measureBody(synthFrame({}, 0).pose, [], ASPECT)!
  const sw = body.shoulderWidth

  it('measures a hand relative to its own shoulder (outward positive for both hands)', () => {
    const r = handRelative(
      'right',
      { x: body.rightShoulder.x + 0.5 * sw, y: body.rightShoulder.y + 0.25 * sw },
      body
    )
    const l = handRelative(
      'left',
      { x: body.leftShoulder.x - 0.5 * sw, y: body.leftShoulder.y },
      body
    )
    expect(r.out).toBeCloseTo(0.5)
    expect(r.down).toBeCloseTo(0.25)
    expect(l.out).toBeCloseTo(0.5)
  })

  it('a smaller personal zone moves the cursor further for the same hand position', () => {
    const hand = { x: body.rightShoulder.x + 0.6 * sw, y: body.rightShoulder.y }
    const normal = zoneMap('right', hand, body)
    const small = zoneMap('right', hand, body, { inward: 0.4, outward: 0.6, up: 0.4, down: 0.4 })
    expect(small.x).toBeCloseTo(1) // right edge with the small zone
    expect(normal.x).toBeLessThan(0.8)
  })
})
