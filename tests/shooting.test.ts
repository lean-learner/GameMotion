import { describe, expect, it } from 'vitest'
import {
  ShootingLogic,
  READY_MS,
  HOLD_MS,
  rangeView,
  TRACKING_GRACE_MS,
  AimDetector,
  ringScore,
  targetAt,
  type ShooterInput,
  type GameEvent
} from '../src/renderer/src/games/shooting/logic'
import { standing, run } from './helpers/poseInput'

function input(lowered = false, leftHanded = false, aimX = 0, aimY = 0): ShooterInput {
  const body = standing()
  const side = leftHanded ? 'left' : 'right'
  body.hands[side] = {
    x: body.x + ((leftHanded ? -0.2 : 0.2) + aimX) * body.sw,
    y: body.y + (lowered ? 0.9 : aimY) * body.sw
  }
  return { body }
}

function ready(draw: AimDetector, left = false): number {
  return run(16, READY_MS + 64, (t) => expect(draw.update(t, input(false, left))).toBeNull())
}

describe('shooting face-forward aiming', () => {
  it('readies with either hand and the other arm completely unseen', () => {
    for (const left of [false, true]) {
      const draw = new AimDetector()
      ready(draw, left)
      expect(draw.ready).toBe(true)
      expect(draw.side).toBe(left ? 'left' : 'right')
      expect(draw.aim).toEqual({ x: 0, y: 0 })
    }
  })
  it('does not ready while the hands are resting', () => {
    const draw = new AimDetector()
    run(16, 2000, (t) => expect(draw.update(t, input(true))).toBeNull())
    expect(draw.ready).toBe(false)
    expect(draw.side).toBeNull()
  })
  it('fires once after a steady hold, then requires a visible lowering before the next shot', () => {
    const draw = new AimDetector()
    const t = ready(draw)
    let releases = 0
    run(t, HOLD_MS + 3000, (now) => {
      if (draw.update(now, input())) releases++
    })
    expect(releases).toBe(1)
    expect(draw.mustLower).toBe(true)
    run(t + HOLD_MS + 3000, 500, (now) => expect(draw.update(now, { body: null })).toBeNull())
    expect(draw.mustLower).toBe(true)
    draw.update(6000, input(true))
    expect(draw.mustLower).toBe(false)
    run(6016, READY_MS + HOLD_MS + 500, (now) => {
      if (draw.update(now, input())) releases++
    })
    expect(releases).toBe(2)
  })
  it('smooths hand motion while shoulder position and width changes cannot shift the sight', () => {
    const draw = new AimDetector()
    let t = ready(draw)
    const unstable = input()
    unstable.body!.x += 150
    unstable.body!.y += 80
    unstable.body!.sw /= 3
    run(t, 300, (now) => draw.update(now, unstable))
    expect(draw.aim).toEqual({ x: 0, y: 0 })
    t += 304
    draw.update(t, input(false, false, 0.3, -0.2))
    expect(draw.aim.x).toBeGreaterThan(0)
    expect(draw.aim.x).toBeLessThan(0.54)
    run(t + 16, 600, (now) => draw.update(now, input(false, false, 0.3, -0.2)))
    expect(draw.aim.x).toBeCloseTo(0.54, 1)
    expect(draw.aim.y).toBeCloseTo(-0.36, 1)
  })
  it('tolerates small wrist jitter but moving to a new aim restarts the shot timer', () => {
    const draw = new AimDetector()
    const t = ready(draw)
    run(t, 800, (now) =>
      expect(draw.update(now, input(false, false, Math.sin(now) * 0.025))).toBeNull()
    )
    expect(draw.hold).toBeGreaterThan(0.5)
    draw.update(t + 800, input(false, false, 0.3))
    expect(draw.hold).toBe(0)
    run(t + 816, 700, (now) => expect(draw.update(now, input(false, false, 0.3))).toBeNull())
    expect(draw.ready).toBe(true)
  })
  it('freezes the sight over short wrist loss, resets the hold, and cancels after long loss', () => {
    const draw = new AimDetector()
    const t = ready(draw)
    run(t, 600, (now) => draw.update(now, input()))
    expect(draw.hold).toBeGreaterThan(0)
    const aim = { ...draw.aim }
    run(t + 608, 160, (now) => expect(draw.update(now, { body: null })).toBeNull())
    expect(draw.ready).toBe(true)
    expect(draw.trackingLost).toBe(true)
    expect(draw.hold).toBe(0)
    expect(draw.aim).toEqual(aim)
    draw.update(t + 768, input())
    expect(draw.ready).toBe(true)
    expect(draw.trackingLost).toBe(false)
    run(t + 784, TRACKING_GRACE_MS + 100, (now) =>
      expect(draw.update(now, { body: null })).toBeNull()
    )
    expect(draw.ready).toBe(false)
  })
  it('can use a hand with the saved reference when current shoulders are unavailable', () => {
    const draw = new AimDetector()
    const t = ready(draw)
    const hands = input(false, false, 0.3).body!.hands
    run(t, 600, (now) => draw.update(now, { body: null, hands }))
    expect(draw.ready).toBe(true)
    expect(draw.trackingLost).toBe(false)
    expect(draw.aim.x).toBeCloseTo(0.54, 1)
  })
  it('pauses the steady-shot timer when the game clock is paused', () => {
    const logic = new ShootingLogic()
    logic.start(0, 1)
    logic.update(3000, [input()])
    run(3016, 1000, (t) => logic.update(t, [input()]))
    const draw = logic.shooters[0].aiming
    const hold = draw.hold
    expect(hold).toBeGreaterThan(0)
    logic.flow.pause(4016, 'player')
    run(4032, 5000, (t) => expect(logic.update(t, [input()])).toEqual([]))
    expect(draw.hold).toBe(hold)
    expect(logic.shooters[0].phase).toBe('aim')
  })
})

describe('shooting targets', () => {
  it('keeps target faces in the corners and leaves the centre of each camera lane clear', () => {
    for (const count of [1, 2]) {
      for (let player = 0; player < count; player++) {
        const view = rangeView(player, count)
        const playerX = count === 1 ? 640 : 320 + 640 * player
        for (const round of [0, 6, 9]) {
          for (const t of [0, 1000, 3000, 6000]) {
            const target = targetAt(round, t)
            const x = view.x + target.x * view.scale
            const radius = target.r * view.scale
            expect(x - radius).toBeGreaterThanOrEqual(0)
            expect(x + radius).toBeLessThanOrEqual(1280)
            expect(Math.abs(x - playerX)).toBeGreaterThan(radius + 40)
          }
        }
      }
    }
  })
  it('scores ten rings and misses, including the outer edge', () => {
    const target = { x: 0, y: 0, r: 1 }
    expect(ringScore({ x: 0, y: 0 }, target)).toBe(10)
    for (let score = 1; score <= 10; score++) {
      expect(ringScore({ x: (10 - score + 0.5) / 10, y: 0 }, target)).toBe(score)
    }
    expect(ringScore({ x: 1, y: 0 }, target)).toBe(1)
    expect(ringScore({ x: 1.001, y: 0 }, target)).toBe(0)
  })
  it('shrinks and moves targets in later rounds', () => {
    expect(targetAt(0, 1000)).toEqual({ x: 0, y: 0, r: 1 })
    expect(targetAt(8, 1000).r).toBeLessThan(1)
    expect(targetAt(8, 1000).x).not.toBe(targetAt(8, 2000).x)
  })
})

describe('shooting round', () => {
  it('accepts lowering during shot feedback without readying another shot too early', () => {
    const logic = new ShootingLogic()
    logic.start(0, 1)
    logic.update(3000, [input()])
    run(3016, 1800, (t) => logic.update(t, [input()]))
    const shooter = logic.shooters[0]
    expect(shooter.phase).toBe('settle')
    expect(shooter.aiming.mustLower).toBe(true)
    logic.update(4816, [input(true)])
    expect(shooter.aiming.mustLower).toBe(false)
    run(4832, 200, (t) => logic.update(t, [input()]))
    expect(shooter.aiming.ready).toBe(false)
    expect(shooter.results).toHaveLength(1)
  })
  it('shoots thirty shots per player at their own pace and finishes after both', () => {
    const logic = new ShootingLogic()
    logic.start(0, 2)
    logic.update(3000, [input(), input()])
    const events: GameEvent[] = []
    run(3016, 130000, (t) => {
      const inputs = logic.shooters.map((a, i) => {
        if (i === 1 && t < 9000) return { body: null }
        return input(a.aiming.mustLower)
      })
      events.push(...logic.update(t, inputs))
      if (logic.shooters[0].phase === 'done' && logic.shooters[1].phase !== 'done')
        expect(logic.flow.phase).toBe('playing')
    })
    expect(logic.flow.phase).toBe('gameover')
    expect(events.filter((e) => e.type === 'fire')).toHaveLength(60)
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(60)
    expect(events.filter((e) => e.type === 'round')).toHaveLength(18)
    expect(logic.shooters.map((a) => a.results.length)).toEqual([30, 30])
    for (const a of logic.shooters) {
      expect(a.results.slice(0, 18)).toEqual(Array(18).fill(10))
      expect(a.score).toBe(a.results.reduce((sum, s) => sum + s, 0))
      expect(a.score).toBeLessThanOrEqual(300)
    }
  })
  it('scores at the crosshair immediately when firing, with no flight or wind offset', () => {
    const logic = new ShootingLogic()
    logic.start(0, 1)
    logic.shooters[0].round = 8
    logic.update(3000, [input()])
    let hits = 0
    run(3016, 1800, (t) => {
      const events = logic.update(t, [input()])
      const fired = events.some((e) => e.type === 'fire')
      const hit = events.find((e) => e.type === 'hit')
      expect(fired).toBe(!!hit)
      if (hit?.type === 'hit') {
        hits++
        expect(hit.hit).toEqual({ x: 0, y: 0 })
        expect(hit.score).toBe(ringScore(hit.hit, targetAt(8, logic.flow.elapsed)))
        expect(logic.scores()).toEqual([hit.score])
      }
    })
    expect(hits).toBe(1)
    const shooter = logic.shooters[0]
    const mark = shooter.shots[0]
    expect(mark.offset).not.toBeNull()
    const later = targetAt(8, logic.flow.elapsed + 500)
    expect(ringScore({ x: later.x + mark.offset!.x, y: later.y + mark.offset!.y }, later)).toBe(
      mark.score
    )
    logic.flow.pause(4816, 'player')
    const elapsed = logic.flow.elapsed
    expect(logic.update(100000, [input(true)])).toEqual([])
    expect(logic.flow.elapsed).toBe(elapsed)
    expect(shooter.results).toHaveLength(1)
  })
})
