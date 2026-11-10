import { describe, expect, it } from 'vitest'
import { FrameScheduler } from '../src/renderer/src/tracking/frameScheduler'

/** Feeds frame times through a scheduler (worker always idle); returns frames sent. */
function run(s: FrameScheduler, times: number[]): number {
  return times.filter((t) => s.decide(t, false) === 'send').length
}

const steady = (fps: number, seconds: number): number[] =>
  Array.from({ length: fps * seconds }, (_, i) => (i * 1000) / fps)

/** 30 fps camera seen through a 60 Hz display: alternating 16.7 / 50 ms gaps. */
const jittered30 = (seconds: number): number[] => {
  const out: number[] = []
  let t = 0
  for (let i = 0; i < 30 * seconds; i++) {
    out.push(t)
    t += i % 2 === 0 ? 1000 / 60 : 3000 / 60
  }
  return out
}

describe('FrameScheduler', () => {
  it('sends the first frame', () => {
    expect(new FrameScheduler(30).decide(0, false)).toBe('send')
  })

  it('never sends while a frame is in flight (no stale queue)', () => {
    expect(new FrameScheduler(0).decide(1000, true)).toBe('skip-busy')
    expect(new FrameScheduler(30).decide(1000, true)).toBe('skip-busy')
  })

  it('passes every frame of a steady 30 fps camera at a 30 Hz cap', () => {
    expect(run(new FrameScheduler(30), steady(30, 10))).toBe(300)
  })

  it('passes every frame of a display-jittered 30 fps camera at a 30 Hz cap', () => {
    expect(run(new FrameScheduler(30), jittered30(10))).toBe(300)
  })

  it('halves the rate at a 15 Hz cap on a 30 fps camera', () => {
    const sent = run(new FrameScheduler(15), steady(30, 10))
    expect(sent).toBeGreaterThanOrEqual(150)
    expect(sent).toBeLessThanOrEqual(152)
  })

  it('caps a 60 fps source at 30 Hz', () => {
    const sent = run(new FrameScheduler(30), steady(60, 10))
    expect(sent).toBeGreaterThanOrEqual(300)
    expect(sent).toBeLessThanOrEqual(302)
  })

  it('treats maxHz 0 as uncapped', () => {
    expect(run(new FrameScheduler(0), steady(60, 1))).toBe(60)
  })
})
