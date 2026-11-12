import { describe, expect, it } from 'vitest'
import type { BodyFrame } from '../src/renderer/src/input/body'
import {
  checkPosition,
  DUO_LANES,
  GOOD_SPOT,
  PositionMonitor
} from '../src/renderer/src/input/position'

const ASPECT = 16 / 9

/** A body whose shoulders are centred at (x, y) of the picture and `size` of its width wide. */
function body(x = 0.5, size = 0.15, y = 0.4): BodyFrame {
  const sw = size * ASPECT
  const cx = x * ASPECT
  return {
    leftShoulder: { x: cx - sw / 2, y },
    rightShoulder: { x: cx + sw / 2, y },
    shoulderMid: { x: cx, y },
    shoulderWidth: sw,
    hipMid: null,
    wrists: { left: null, right: null },
    hands: { left: null, right: null }
  }
}

describe('standing position', () => {
  it('approves a centred player at a normal distance', () => {
    const c = checkPosition(body(), ASPECT)
    expect(c.ok).toBe(true)
    expect(c.hint).toBe(GOOD_SPOT)
    expect(c.x).toBeCloseTo(0.5)
    expect(c.size).toBeCloseTo(0.15)
  })

  it('says what to do about distance, side and height', () => {
    expect(checkPosition(null, ASPECT).issue).toBe('not-seen')
    expect(checkPosition(body(0.5, 0.35), ASPECT).hint).toBe('Step back')
    expect(checkPosition(body(0.5, 0.06), ASPECT).hint).toBe('Come closer')
    // Mirrored picture: on the left of the screen means too far to the player's own left.
    expect(checkPosition(body(0.15), ASPECT).hint).toBe('Step to your right')
    expect(checkPosition(body(0.85), ASPECT).hint).toBe('Step to your left')
    expect(checkPosition(body(0.5, 0.15, 0.1), ASPECT).issue).toBe('too-high')
    expect(checkPosition(body(0.5, 0.15, 0.85), ASPECT).issue).toBe('too-low')
  })

  it('gives two players a lane each', () => {
    expect(checkPosition(body(0.25), ASPECT, DUO_LANES[0]).ok).toBe(true)
    expect(checkPosition(body(0.25), ASPECT, DUO_LANES[1]).hint).toBe('Step to your right')
    expect(checkPosition(body(0.75), ASPECT, DUO_LANES[1]).ok).toBe(true)
  })

  it('does not flicker: a new verdict must hold for a moment', () => {
    const m = new PositionMonitor()
    expect(m.update(checkPosition(body(), ASPECT), 0).ok).toBe(true)
    expect(m.update(checkPosition(body(0.5, 0.35), ASPECT), 100).ok).toBe(true)
    expect(m.update(checkPosition(body(), ASPECT), 200).ok).toBe(true)
    expect(m.update(checkPosition(body(0.5, 0.35), ASPECT), 300).ok).toBe(true)
    expect(m.update(checkPosition(body(0.5, 0.35), ASPECT), 800).hint).toBe('Step back')
  })
})
