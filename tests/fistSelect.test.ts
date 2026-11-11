import { describe, expect, it } from 'vitest'
import { isFist } from '../src/renderer/src/input/body'
import { DwellSelector, FIST_SPEED } from '../src/renderer/src/input/dwell'
import type { Point } from '../src/renderer/src/tracking/types'

/** A hand pointing up from a wrist at (0.5, 0.8); `curl` folds the fingertips back to the palm. */
function hand(curled: boolean[]): Point[] {
  const pts: Point[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }))
  ;[5, 9, 13, 17].forEach((base, f) => {
    const x = 0.47 + f * 0.02
    pts[base] = { x, y: 0.7, z: 0 } // knuckle
    pts[base + 1] = { x, y: 0.65, z: 0 } // middle joint
    pts[base + 2] = { x, y: curled[f] ? 0.68 : 0.61, z: 0 }
    pts[base + 3] = { x, y: curled[f] ? 0.72 : 0.57, z: 0 } // tip
  })
  return pts
}

describe('fist detection', () => {
  it('tells an open hand from a fist', () => {
    expect(isFist(hand([false, false, false, false]), 16 / 9)).toBe(false)
    expect(isFist(hand([true, true, true, true]), 16 / 9)).toBe(true)
  })

  it('needs most fingers curled (pointing with one finger is still a fist-like grab)', () => {
    expect(isFist(hand([false, true, true, true]), 16 / 9)).toBe(true)
    expect(isFist(hand([false, false, true, true]), 16 / 9)).toBe(false)
  })

  it('is unknown when landmarks are missing', () => {
    expect(isFist([], 16 / 9)).toBeNull()
  })
})

describe('hover timer', () => {
  const targets = [
    { id: 'a', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    { id: 'slow', x: 0.6, y: 0.1, w: 0.2, h: 0.2, dwellMs: 2000 }
  ]
  const on = { x: 0.2, y: 0.2 }
  const onSlow = { x: 0.7, y: 0.2 }

  /** Hovers until something is selected; returns when, or null after `limit` ms. */
  function timeToSelect(
    s: DwellSelector,
    cursor: { x: number; y: number; fist?: boolean },
    limit = 5000
  ): number | null {
    for (let t = 0; t <= limit; t += 20) {
      if (s.update([cursor], t).selected) return t
    }
    return null
  }

  it('hovering starts the timer whatever the hand is doing', () => {
    expect(timeToSelect(new DwellSelector(targets), on)).toBe(1000)
    expect(timeToSelect(new DwellSelector(targets), { ...on, fist: false })).toBe(1000)
  })

  it('a fist never selects instantly: it fills the same timer faster', () => {
    const s = new DwellSelector(targets)
    expect(s.update([{ ...on, fist: true }], 0).selected).toBeNull()
    const st = s.update([{ ...on, fist: true }], 100)
    expect(st.selected).toBeNull()
    expect(st.hover?.progress).toBeCloseTo((100 * FIST_SPEED) / 1000)
    expect(timeToSelect(new DwellSelector(targets), { ...on, fist: true })).toBe(1000 / FIST_SPEED)
  })

  it('deliberate targets take longer', () => {
    expect(timeToSelect(new DwellSelector(targets), onSlow)).toBe(2000)
  })

  it('selects once: the cursor must leave before it can press again', () => {
    const s = new DwellSelector(targets)
    expect(timeToSelect(s, on)).toBe(1000)
    for (let t = 1020; t < 4000; t += 20) expect(s.update([on], t).selected).toBeNull()
    s.update([null], 4000)
    let again: number | null = null
    for (let t = 4020; t < 6000 && again === null; t += 20) {
      if (s.update([on], t).selected) again = t
    }
    expect(again).toBe(5020)
  })
})
