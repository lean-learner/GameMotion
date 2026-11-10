import { describe, expect, it } from 'vitest'
import { RateMeter, RollingStat } from '../src/renderer/src/util/metrics'

describe('RateMeter', () => {
  it('reports events per second over the window', () => {
    const m = new RateMeter(1000)
    for (let t = 0; t < 1000; t += 1000 / 30) m.tick(t)
    expect(m.rate(999)).toBe(30)
  })

  it('forgets events older than the window', () => {
    const m = new RateMeter(1000)
    m.tick(0)
    m.tick(100)
    expect(m.rate(1050)).toBe(1)
    expect(m.rate(5000)).toBe(0)
  })
})

describe('RollingStat', () => {
  it('keeps mean and max of the last N samples', () => {
    const s = new RollingStat(3)
    ;[10, 20, 30, 40].forEach((v) => s.add(v))
    expect(s.mean).toBe(30)
    expect(s.max).toBe(40)
    expect(s.count).toBe(3)
  })
})
