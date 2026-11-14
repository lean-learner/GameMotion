import { describe, expect, it } from 'vitest'
import { Vertical } from '../src/renderer/src/games/vertical'
import { run, standing, SW } from './helpers/poseInput'

const at = (dy: number): ReturnType<typeof standing> => ({ ...standing(), y: 300 + dy * SW })

describe('jump and duck from shoulder height', () => {
  it('reports a jump once, when the shoulders go clearly above standing height', () => {
    const v = new Vertical()
    let t = run(0, 500, (now) => v.update(now, at(0)))
    expect(v.air).toBe(false)
    // A shrug or a raised arm is not a jump.
    t = run(t, 200, (now) => expect(v.update(now, at(-0.15))).toBe(false))
    let takeoffs = 0
    t = run(t, 300, (now) => (takeoffs += v.update(now, at(-0.4)) ? 1 : 0))
    expect(takeoffs).toBe(1)
    expect(v.air).toBe(true)
    run(t, 100, (now) => v.update(now, at(0)))
    expect(v.air).toBe(false)
  })

  it('reports a duck, and holds its state while the player is not seen', () => {
    const v = new Vertical()
    let t = run(0, 500, (now) => v.update(now, at(0)))
    t = run(t, 200, (now) => v.update(now, at(0.6)))
    expect(v.low).toBe(true)
    expect(v.air).toBe(false)
    t = run(t, 200, (now) => v.update(now, null))
    expect(v.low).toBe(true)
    run(t, 100, (now) => v.update(now, at(0.1)))
    expect(v.low).toBe(false)
  })

  it('follows slow drift, and takes a new steady height as standing', () => {
    const v = new Vertical()
    let t = run(0, 3000, (now) => v.update(now, at((0.1 * now) / 3000)))
    expect(v.base).toBeGreaterThan(300 + 0.05 * SW)
    // The player steps towards the camera: shoulders settle much lower in the picture.
    t = run(t, 3200, (now) => v.update(now, at(0.8)))
    expect(v.low).toBe(false)
    expect(v.base).toBeCloseTo(300 + 0.8 * SW)
    run(t, 100, (now) => v.update(now, at(0.4)))
    expect(v.air).toBe(true)
  })
})
