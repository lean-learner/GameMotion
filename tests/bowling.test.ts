import { describe, expect, it } from 'vitest'
import {
  aimAt,
  BALL_SPEED,
  BowlingLogic,
  LANE,
  laneView,
  marks,
  project,
  rack,
  Roll,
  scoreGame,
  SETTLE_MS,
  SwingDetector,
  toThrow,
  type GameEvent
} from '../src/renderer/src/games/bowling/logic'
import type { BodyInput } from '../src/renderer/src/games/poses'
import { COUNTDOWN_MS } from '../src/renderer/src/games/roundFlow'
import { standing, SW } from './helpers/poseInput'

/** A seeded random, so pins fall the same way every run. */
function seeded(seed = 7): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const many = (n: number, roll: number): number[] => Array.from({ length: n }, () => roll)

describe('bowling scoring', () => {
  it('scores open frames, spares and strikes', () => {
    expect(scoreGame(many(20, 0)).total).toBe(0)
    expect(scoreGame(many(10, [9, 0]).flat()).total).toBe(90)
    expect(scoreGame(many(21, 5)).total).toBe(150)
    expect(scoreGame(many(12, 10)).total).toBe(300)
    // A strike counts the next two balls, a spare the next one.
    expect(scoreGame([10, 3, 4]).frames.map((f) => f.total)).toEqual([17, 24])
    expect(scoreGame([6, 4, 5, 0]).frames.map((f) => f.total)).toEqual([15, 20])
    // Bonuses still to come count as nothing yet.
    expect(scoreGame([10]).total).toBe(10)
    expect(scoreGame([10, 10, 10]).frames.map((f) => f.total)).toEqual([30, 50, 60])
  })

  it('knows whose turn is next and whether the pins are reset', () => {
    expect(scoreGame([]).next).toEqual({ frame: 0, ball: 0, fresh: true })
    expect(scoreGame([3]).next).toEqual({ frame: 0, ball: 1, fresh: false })
    expect(scoreGame([3, 4]).next).toEqual({ frame: 1, ball: 0, fresh: true })
    expect(scoreGame([10]).next).toEqual({ frame: 1, ball: 0, fresh: true })
    expect(scoreGame(many(20, 0)).next).toBeNull()
    expect(scoreGame(many(18, 0)).next).toEqual({ frame: 9, ball: 0, fresh: true })
  })

  it('gives a third ball in the last frame only after a strike or a spare', () => {
    const nine = many(18, 0)
    expect(scoreGame([...nine, 3, 4]).next).toBeNull()
    expect(scoreGame([...nine, 3, 7]).next).toEqual({ frame: 9, ball: 2, fresh: true })
    expect(scoreGame([...nine, 10]).next).toEqual({ frame: 9, ball: 1, fresh: true })
    expect(scoreGame([...nine, 10, 10]).next).toEqual({ frame: 9, ball: 2, fresh: true })
    expect(scoreGame([...nine, 10, 4]).next).toEqual({ frame: 9, ball: 2, fresh: false })
    expect(scoreGame([...nine, 10, 4, 5]).next).toBeNull()
    expect(scoreGame([...nine, 10, 4, 5]).total).toBe(19)
    expect(scoreGame([...nine, 3, 7, 10]).total).toBe(20)
  })

  it('writes frames the way a scorecard does', () => {
    const card = scoreGame([10, 7, 3, 0, 4, 9, 0, 0, 10])
    expect(card.frames.map((f) => marks(f))).toEqual(['X', '7/', '-4', '9-', '-/'])
    const last = scoreGame([...many(18, 0), 10, 10, 10]).frames[9]
    expect(marks(last)).toBe('XXX')
    expect(marks(scoreGame([...many(18, 0), 10, 6, 4]).frames[9])).toBe('X6/')
  })
})

/** Rolls one ball at a full rack; returns the pins knocked and the roll. */
function bowl(x: number, speed = 7.5, angle = 0, spin = 0, seed = 1): Roll {
  const roll = new Roll({ x, speed, angle, spin }, rack(seeded(seed)))
  for (let i = 0; i < 2000 && !roll.done; i++) roll.step(16)
  expect(roll.done).toBe(true)
  return roll
}

describe('bowling lane', () => {
  it('sets ten pins in a triangle on the lane', () => {
    const pins = rack()
    expect(pins.length).toBe(10)
    expect(pins[0]).toMatchObject({ x: 0, y: LANE.length, down: false })
    for (const p of pins) expect(Math.abs(p.x)).toBeLessThan(LANE.half)
  })

  it('a ball into the pocket is a strike, on either side', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      expect(bowl(0.05, 7.5, 0, 0, seed).knocked).toBe(10)
      expect(bowl(-0.05, 7.5, 0, 0, seed).knocked).toBe(10)
    }
  })

  it('dead centre and wide balls leave pins standing', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const centre = bowl(0, 7.5, 0, 0, seed).knocked
      expect(centre).toBeGreaterThanOrEqual(5)
      expect(centre).toBeLessThan(10)
      const wide = bowl(0.36, 7.5, 0, 0, seed).knocked
      expect(wide).toBeGreaterThan(0)
      expect(wide).toBeLessThan(6)
    }
  })

  it('a ball off the edge drops into the gutter and touches nothing', () => {
    const roll = new Roll({ x: 0.3, speed: 7, angle: 0.05, spin: 0 }, rack())
    const events = []
    for (let i = 0; i < 2000 && !roll.done; i++) events.push(...roll.step(16))
    expect(events).toEqual([{ type: 'gutter' }])
    expect(roll.ball.gutter).toBe(true)
    expect(roll.knocked).toBe(0)
  })

  it('spin curves the ball late, and more on a slow ball', () => {
    const xAtPins = (speed: number, spin: number): number => {
      const roll = new Roll({ x: 0.3, speed, angle: 0, spin }, [])
      let x = 0
      let half = 0
      while (!roll.done && roll.ball.y < LANE.length - 0.3) {
        roll.step(16)
        x = roll.ball.x
        if (roll.ball.y < LANE.length / 2) half = roll.ball.x
      }
      expect(half).toBeCloseTo(0.3) // straight over the oiled first half
      return x
    }
    expect(xAtPins(7, 0)).toBeCloseTo(0.3)
    const fast = xAtPins(9, -0.8)
    const slow = xAtPins(5.5, -0.8)
    expect(fast).toBeLessThan(0.28)
    expect(slow).toBeLessThan(fast - 0.05)
  })

  it('reports the crash and finishes with every pin at rest', () => {
    const roll = new Roll({ x: 0.05, speed: 7.5, angle: 0, spin: 0 }, rack(seeded(1)))
    const events = []
    for (let i = 0; i < 2000 && !roll.done; i++) events.push(...roll.step(16))
    const fell = events.reduce((n, e) => n + (e.type === 'crash' ? e.pins : 0), 0)
    expect(fell).toBe(10)
    for (const p of roll.pins) expect(Math.hypot(p.vx, p.vy)).toBe(0)
  })

  it('a second ball can pick up what the first left', () => {
    const first = bowl(0.2, 7.5, 0, 0, 3)
    const left = first.pins.filter((p) => !p.down)
    expect(left.length).toBeGreaterThan(0)
    const target = left[0]
    const second = new Roll({ x: target.x, speed: 7.5, angle: 0, spin: 0 }, left)
    for (let i = 0; i < 2000 && !second.done; i++) second.step(16)
    expect(second.knocked).toBeGreaterThan(0)
    expect(target.down).toBe(true)
  })
})

/** A player with the right hand `down` shoulder widths below the shoulders, `across` to the side. */
function arm(down: number, across = 0.6, x = 640): BodyInput {
  return {
    ...standing(x),
    hands: { left: null, right: { x: x + across * SW, y: 300 + down * SW } }
  }
}

describe('bowling swing', () => {
  it('a hand that drops and comes up fast is a throw', () => {
    const d = new SwingDetector()
    expect(d.update(0, arm(1.3))).toBeNull()
    expect(d.armed).toBe(true)
    expect(d.update(60, arm(0.8))).toBeNull()
    const swing = d.update(120, arm(0.2))
    expect(swing).not.toBeNull()
    // 1.1 shoulder widths in 120 ms is far past full power.
    expect(swing!.power).toBe(1)
    expect(swing!.slant).toBeCloseTo(0)
    expect(d.armed).toBe(false)
  })

  it('a slower swing has less power; a slow lift is no throw at all', () => {
    const medium = new SwingDetector()
    medium.update(0, arm(1.0))
    const swing = medium.update(200, arm(0.1))! // 4.5 shoulder widths a second
    expect(swing.power).toBeCloseTo(0.5)
    const slow = new SwingDetector()
    slow.update(0, arm(1.0))
    expect(slow.update(600, arm(0.1))).toBeNull() // 1.5 a second
    const late = new SwingDetector()
    late.update(0, arm(1.0))
    late.update(400, arm(0.6))
    expect(late.update(800, arm(0.1))).toBeNull() // took too long
  })

  it('needs the hand down first, and both hands work', () => {
    const d = new SwingDetector()
    expect(d.update(0, arm(0.5))).toBeNull()
    expect(d.update(50, arm(0.1))).toBeNull()
    expect(d.update(100, standing())).toBeNull()
    const left = (down: number): BodyInput => ({
      ...standing(),
      hands: { left: { x: 640 - 0.6 * SW, y: 300 + down * SW }, right: null }
    })
    d.update(200, left(1.2))
    expect(d.update(300, left(0.2))).not.toBeNull()
  })

  it('measures which way the swing leaned', () => {
    const d = new SwingDetector()
    d.update(0, arm(1.2, 0.6))
    expect(d.update(100, arm(0.2, 0.9))!.slant).toBeCloseTo(0.3)
    d.update(200, arm(1.2, 0.6))
    expect(d.update(300, arm(0.2, 0.4))!.slant).toBeCloseTo(-0.2)
  })

  it('turns a swing into a throw: speed from power, direction and hook from the lean', () => {
    expect(toThrow(0.1, { power: 0, slant: 0 })).toEqual({
      x: 0.1,
      speed: BALL_SPEED[0],
      angle: 0,
      spin: -0
    })
    expect(toThrow(0, { power: 1, slant: 0.03 })).toMatchObject({ speed: BALL_SPEED[1], angle: 0 })
    const right = toThrow(0, { power: 0.5, slant: 0.3 })
    expect(right.angle).toBeGreaterThan(0)
    expect(right.spin).toBeLessThan(0) // curves back to the left
    const wild = toThrow(0, { power: 0.5, slant: -5 })
    expect(wild.angle).toBeCloseTo(-toThrow(0, { power: 0.5, slant: 0.6 }).angle)
  })
})

describe('bowling view', () => {
  it('puts the foul line at the bottom and the pins small and far', () => {
    const v = laneView(0, 1)
    const near = project(v, 0, 0)
    const far = project(v, 0, LANE.length)
    expect(near).toMatchObject({ x: v.cx, y: v.bottom })
    expect(far.x).toBe(v.cx)
    expect(far.y).toBeCloseTo(v.farY)
    expect(far.scale).toBeCloseTo(near.scale * 0.42)
    expect(project(v, LANE.half, 0).x).toBeCloseTo(v.cx + v.nearHalf)
  })

  it('starts the ball under the player, inside the lane', () => {
    const v = laneView(0, 1)
    expect(aimAt(v, v.cx)).toBe(0)
    expect(aimAt(v, v.cx + v.nearHalf / 2)).toBeCloseTo(LANE.half / 2)
    expect(aimAt(v, 0)).toBe(-0.45)
    expect(aimAt(v, 1280)).toBe(0.45)
    expect(laneView(0, 2).cx).toBeLessThan(640)
    expect(laneView(1, 2).cx).toBeGreaterThan(640)
  })
})

describe('bowling game', () => {
  /** Runs frames with `input` until `done`, for at most `limit` ms. */
  function run(
    g: BowlingLogic,
    from: number,
    input: (t: number) => (BodyInput | null)[],
    done: (events: GameEvent[]) => boolean,
    limit = 20_000
  ): { t: number; events: GameEvent[] } {
    const events: GameEvent[] = []
    let t = from
    for (; t < from + limit && g.flow.phase === 'playing'; t += 16) {
      events.push(...g.update(t, input(t)))
      if (done(events)) break
    }
    return { t, events }
  }

  function playing(players = 1): BowlingLogic {
    const g = new BowlingLogic(seeded(3))
    g.start(0, players)
    g.update(COUNTDOWN_MS, [])
    expect(g.flow.phase).toBe('playing')
    return g
  }

  /** One player bowling over and over from screen x: arm down for a while, then up. */
  const bowler =
    (x: number) =>
    (t: number): BodyInput =>
      arm(Math.floor(t / 400) % 2 === 0 ? 1.2 : 0.1, 0.6, x)

  it('lines the ball up under the player and bowls on a swing', () => {
    const g = playing()
    const lane = g.lanes[0]
    let r = run(
      g,
      COUNTDOWN_MS + 16,
      () => [arm(1.2, 0.6, 740)],
      () => false,
      1000
    )
    expect(lane.phase).toBe('aim')
    expect(lane.swing.armed).toBe(true)
    expect(lane.aimX).toBeCloseTo(aimAt(laneView(0, 1), 740), 2)
    r = run(
      g,
      r.t,
      () => [arm(0.1, 0.6, 740)],
      (e) => e.length > 0
    )
    expect(r.events).toEqual([{ type: 'throw', player: 0, power: 1 }])
    expect(lane.phase).toBe('rolling')
    expect(lane.roll!.ball.x).toBeCloseTo(lane.aimX)
    // Standing still does nothing more until the ball has finished.
    r = run(
      g,
      r.t + 16,
      () => [standing(740)],
      (e) => e.some((x) => x.type === 'result')
    )
    const result = r.events.find((e) => e.type === 'result')!
    expect(result).toMatchObject({ player: 0, knocked: lane.rolls[0] })
    expect(lane.phase).toBe('settle')
    run(
      g,
      r.t + 16,
      () => [standing(740)],
      () => lane.phase === 'aim'
    )
    expect(g.flow.elapsed - lane.since).toBeLessThan(40)
    expect(lane.pins.every((p) => !p.down)).toBe(true)
    expect(lane.pins.length).toBe(lane.rolls[0] === 10 ? 10 : 10 - lane.rolls[0])
    expect(SETTLE_MS).toBeGreaterThan(500)
  })

  it('plays ten frames to the end and scores them', () => {
    const g = playing()
    // Just right of centre: the pocket.
    const x = laneView(0, 1).cx + (0.05 / LANE.half) * laneView(0, 1).nearHalf
    const r = run(
      g,
      COUNTDOWN_MS + 16,
      (t) => [bowler(x)(t)],
      () => false,
      400_000
    )
    expect(g.flow.phase).toBe('gameover')
    const lane = g.lanes[0]
    expect(lane.phase).toBe('done')
    expect(lane.rolls.length).toBeGreaterThanOrEqual(11)
    expect(lane.rolls.length).toBeLessThanOrEqual(21)
    expect(g.card(0).next).toBeNull()
    expect(g.card(0).frames.length).toBe(10)
    expect(g.scores()).toEqual([scoreGame(lane.rolls).total])
    expect(g.scores()[0]).toBeGreaterThan(150)
    const results = r.events.filter((e) => e.type === 'result')
    expect(results.length).toBe(lane.rolls.length)
    expect(results.some((e) => e.type === 'result' && e.kind === 'strike')).toBe(true)
    expect(g.winner()).toBeNull()
  })

  it('counts strikes in a row', () => {
    const g = playing()
    const x = laneView(0, 1).cx + (0.05 / LANE.half) * laneView(0, 1).nearHalf
    const r = run(
      g,
      COUNTDOWN_MS + 16,
      (t) => [bowler(x)(t)],
      () => g.lanes[0].rolls.length >= 3
    )
    const streaks = r.events.flatMap((e) =>
      e.type === 'result' ? [[e.kind, e.streak] as const] : []
    )
    let run_ = 0
    for (const [kind, streak] of streaks) {
      run_ = kind === 'strike' ? run_ + 1 : 0
      expect(streak).toBe(run_)
    }
  })

  it('a gutter ball scores nothing', () => {
    const g = playing()
    // Far to the side, swinging further out still.
    let low = true
    const r = run(
      g,
      COUNTDOWN_MS + 16,
      (t) => {
        low = t < COUNTDOWN_MS + 600
        return [arm(low ? 1.2 : 0.1, low ? 0.6 : 1.4, 1000)]
      },
      (e) => e.some((x) => x.type === 'result')
    )
    expect(r.events.some((e) => e.type === 'gutter')).toBe(true)
    expect(r.events.find((e) => e.type === 'result')).toMatchObject({ knocked: 0, kind: 'gutter' })
    expect(g.scores()).toEqual([0])
  })

  it('with two players, each bowls on their own lane at their own pace', () => {
    const g = playing(2)
    const cx = [laneView(0, 2).cx, laneView(1, 2).cx]
    // Player 1 bowls; player 2 just stands there.
    const r = run(
      g,
      COUNTDOWN_MS + 16,
      (t) => [bowler(cx[0])(t), standing(cx[1])],
      () => g.lanes[0].rolls.length >= 2
    )
    expect(g.lanes[1].rolls).toEqual([])
    expect(g.lanes[1].phase).toBe('aim')
    expect(r.events.every((e) => e.player === 0)).toBe(true)
    // Both bowl to the end; the round is over only when both lanes are done.
    run(
      g,
      r.t + 16,
      (t) => [bowler(cx[0] + 20)(t), bowler(cx[1])(t)],
      () => false,
      400_000
    )
    expect(g.flow.phase).toBe('gameover')
    expect(g.lanes.map((l) => l.phase)).toEqual(['done', 'done'])
    expect(g.scores()).toEqual(g.lanes.map((l) => scoreGame(l.rolls).total))
    const [a, b] = g.scores()
    expect(g.winner()).toBe(a === b ? null : a > b ? 0 : 1)
  })
})
