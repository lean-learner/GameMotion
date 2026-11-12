import { describe, expect, it } from 'vitest'
import { leader, RoundFlow, COUNTDOWN_MS } from '../src/renderer/src/games/roundFlow'
import { MotionMeter } from '../src/renderer/src/games/motion'
import { matchesPose, POSES, randomPose } from '../src/renderer/src/games/poses'
import { holding, run, standing, SW } from './helpers/poseInput'

describe('poses', () => {
  it('recognises each pose from where it is drawn, and only that pose', () => {
    for (const pose of POSES) {
      for (const other of POSES) {
        expect(matchesPose(other, holding(pose)), `${pose} seen as ${other}`).toBe(pose === other)
      }
    }
  })

  it('matches nothing but standing when the hands are out of sight', () => {
    for (const pose of POSES) expect(matchesPose(pose, standing())).toBe(false)
    expect(matchesPose('hands-up', null)).toBe(false)
  })

  it('works at any distance from the camera', () => {
    const far = holding('wide')
    const k = 0.4
    const scaled = {
      ...far,
      sw: far.sw * k,
      hands: {
        left: {
          x: far.x + (far.hands.left!.x - far.x) * k,
          y: far.y + (far.hands.left!.y - far.y) * k
        },
        right: {
          x: far.x + (far.hands.right!.x - far.x) * k,
          y: far.y + (far.hands.right!.y - far.y) * k
        }
      }
    }
    expect(matchesPose('wide', scaled)).toBe(true)
  })

  it('never picks the same pose twice in a row', () => {
    let seed = 1
    const random = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    let last = randomPose(random)
    for (let i = 0; i < 200; i++) {
      const next = randomPose(random, last)
      expect(next).not.toBe(last)
      last = next
    }
  })
})

describe('round flow', () => {
  it('counts down, then counts play time only while playing', () => {
    const f = new RoundFlow()
    f.start(0)
    expect(f.countdown(100)).toBe(3)
    expect(f.tick(COUNTDOWN_MS - 1)).toBe(0)
    f.tick(COUNTDOWN_MS)
    expect(f.phase).toBe('playing')
    expect(f.tick(COUNTDOWN_MS + 16)).toBe(16)
    f.pause(COUNTDOWN_MS + 16, 'player')
    expect(f.tick(COUNTDOWN_MS + 5000)).toBe(0)
    f.resume(COUNTDOWN_MS + 5000)
    expect(f.phase).toBe('countdown')
    expect(f.elapsed).toBe(16)
  })

  it('caps a long frame, so a hitch cannot skip the game ahead', () => {
    const f = new RoundFlow()
    f.start(0)
    f.tick(COUNTDOWN_MS)
    expect(f.tick(COUNTDOWN_MS + 4000)).toBe(100)
  })

  it('names the leader, or nobody on a tie or with one player', () => {
    expect(leader([10, 30])).toBe(1)
    expect(leader([30, 30])).toBeNull()
    expect(leader([30])).toBeNull()
  })
})

describe('motion meter', () => {
  it('reads a still player as still, even with camera shake', () => {
    const m = new MotionMeter()
    let speed = 0
    let i = 0
    run(0, 1000, (t) => {
      speed = m.update(t, [{ x: 500 + (i++ % 2 ? 2 : -2), y: 300 }], SW)
    })
    expect(speed).toBeLessThan(0.3)
  })

  it('measures steady movement in shoulder widths per second', () => {
    const m = new MotionMeter()
    let speed = 0
    run(0, 1000, (t) => {
      speed = m.update(t, [{ x: (2 * SW * t) / 1000, y: 300 }], SW)
    })
    expect(speed).toBeCloseTo(2, 1)
  })

  it('uses the fastest point, and ignores one that has only just appeared', () => {
    const m = new MotionMeter()
    let speed = 0
    const end = run(0, 600, (t) => {
      speed = m.update(t, [{ x: 100, y: 100 }, { x: 100, y: 100 + (3 * SW * t) / 1000 }, null], SW)
    })
    expect(speed).toBeCloseTo(3, 1)
    const m2 = new MotionMeter()
    run(0, 600, (t) => m2.update(t, [{ x: 100, y: 100 }, null], SW))
    expect(
      m2.update(
        end,
        [
          { x: 100, y: 100 },
          { x: 900, y: 600 }
        ],
        SW
      )
    ).toBe(0)
  })
})
