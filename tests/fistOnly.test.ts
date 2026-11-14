import { describe, expect, it } from 'vitest'
import { DwellSelector, FIST_SPEED, OPEN_DRAIN } from '../src/renderer/src/input/dwell'

const targets = [
  { id: 'g', x: 0.1, y: 0.1, w: 0.2, h: 0.2, fistOnly: true, dwellMs: 1500 },
  { id: 'n', x: 0.6, y: 0.1, w: 0.2, h: 0.2 }
]
const onG = { x: 0.2, y: 0.2 }
const onN = { x: 0.7, y: 0.2 }
type C = { x: number; y: number; fist?: boolean }
function timeToSelect(s: DwellSelector, c: C, limit = 5000): number | null {
  for (let t = 0; t <= limit; t += 20) if (s.update([c], t).selected) return t
  return null
}

describe('fist-only targets', () => {
  it('an open or unknown hand never selects, but still hovers', () => {
    expect(timeToSelect(new DwellSelector(targets), { ...onG, fist: false })).toBeNull()
    expect(timeToSelect(new DwellSelector(targets), onG)).toBeNull()
    const s = new DwellSelector(targets)
    s.update([{ ...onG, fist: false }], 0)
    const st = s.update([{ ...onG, fist: false }], 900)
    expect(st.hover).toEqual({ id: 'g', progress: 0 })
    expect(st.selected).toBeNull()
  })

  it('a fist fills at normal speed and selects after the full hold', () => {
    expect(timeToSelect(new DwellSelector(targets), { ...onG, fist: true })).toBe(1500)
  })

  it('opening the hand drains the timer, never below zero', () => {
    expect(OPEN_DRAIN).toBe(2)
    const s = new DwellSelector(targets)
    s.update([{ ...onG, fist: true }], 0)
    expect(s.update([{ ...onG, fist: true }], 600).hover?.progress).toBeCloseTo(0.4)
    expect(s.update([{ ...onG, fist: false }], 700).hover?.progress).toBeCloseTo(400 / 1500)
    expect(s.update([{ ...onG, fist: false }], 2000).hover?.progress).toBe(0)
    expect(s.update([{ ...onG, fist: true }], 2300).hover?.progress).toBeCloseTo(0.2)
  })

  it('selects once, then the cursor must leave', () => {
    const s = new DwellSelector(targets)
    const fist = { ...onG, fist: true }
    expect(timeToSelect(s, fist)).toBe(1500)
    for (let t = 1520; t < 5000; t += 20) expect(s.update([fist], t).selected).toBeNull()
  })

  it('normal targets are unchanged', () => {
    expect(timeToSelect(new DwellSelector(targets), onN)).toBe(1000)
    expect(timeToSelect(new DwellSelector(targets), { ...onN, fist: true })).toBe(1000 / FIST_SPEED)
  })
})
