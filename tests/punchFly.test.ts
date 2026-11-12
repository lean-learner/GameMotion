import { describe, expect, it } from 'vitest'
import {
  LATE_MS,
  POINTS,
  PunchFlyLogic,
  ROUND_MS,
  TOGETHER_BONUS,
  type Fly,
  type GameEvent
} from '../src/renderer/src/games/punchFly/logic'
import type { BodyInput } from '../src/renderer/src/games/poses'
import { COUNTDOWN_MS } from '../src/renderer/src/games/roundFlow'
import { run, standing } from './helpers/poseInput'

/** Random 0.5: every beat sends a fly, to the right at shoulder height (mirrored for player 2). */
function playing(players = 1): { g: PunchFlyLogic; t: number } {
  const g = new PunchFlyLogic(() => 0.5)
  g.start(0, players)
  g.update(COUNTDOWN_MS, players > 1 ? [standing(350), standing(930)] : [standing()])
  expect(g.flow.phase).toBe('playing')
  return { g, t: COUNTDOWN_MS }
}

/** The player with a hand on a fly's spot. */
function punching(g: PunchFlyLogic, fly: Fly, x = 640): BodyInput {
  const spot = g.spot(fly)!
  return { ...standing(x), hands: { left: null, right: { x: spot.x, y: spot.y } } }
}

/** Runs until the first fly is `ms` from arriving (negative: after it arrived). */
function untilFirstFly(
  g: PunchFlyLogic,
  from: number,
  ms: number,
  inputs: () => BodyInput[]
): { t: number; events: GameEvent[] } {
  let t = from
  const events: GameEvent[] = []
  for (; t < from + 10_000; t += 16) {
    events.push(...g.update(t, inputs()))
    const fly = g.flies[0]
    if (fly && g.flow.elapsed >= fly.arrives - ms) break
  }
  return { t: t + 16, events }
}

describe('Punch Fly', () => {
  it('sends flies on the beat, to a spot beside the player', () => {
    const { g, t } = playing()
    const { events } = untilFirstFly(g, t, 500, () => [standing()])
    expect(events.some((e) => e.type === 'beat')).toBe(true)
    const spot = g.spot(g.flies[0])!
    expect(spot.x).toBeGreaterThan(640)
    expect(spot.r).toBeGreaterThan(0)
    expect(g.progress(g.flies[0])).toBeGreaterThan(0)
    expect(g.progress(g.flies[0])).toBeLessThan(1)
  })

  it('scores a perfect hit for a punch that lands on the beat', () => {
    const { g, t } = playing()
    const a = untilFirstFly(g, t, 0, () => [standing()])
    const fly = g.flies[0]
    const events = g.update(a.t, [punching(g, fly)])
    expect(events.find((e) => e.type === 'hit')).toMatchObject({
      player: 0,
      quality: 'perfect',
      points: POINTS.perfect
    })
    expect(g.players[0].combo).toBe(1)
    expect(g.flies).not.toContain(fly)
  })

  it('scores a good hit for a late punch, and a miss for none', () => {
    const { g, t } = playing()
    const a = untilFirstFly(g, t, -(LATE_MS - 60), () => [standing()])
    const late = g.update(a.t, [punching(g, g.flies[0])])
    expect(late.find((e) => e.type === 'hit')).toMatchObject({
      quality: 'good',
      points: POINTS.good + 0
    })
    // Let the next fly go by.
    const events: GameEvent[] = []
    run(a.t + 16, 2500, (now) => events.push(...g.update(now, [standing()])))
    expect(events.some((e) => e.type === 'miss')).toBe(true)
    expect(g.players[0].combo).toBe(0)
    expect(g.players[0].misses).toBeGreaterThan(0)
  })

  it('does not reward parking a hand on the spot', () => {
    const { g, t } = playing()
    const a = untilFirstFly(g, t, 1000, () => [standing()])
    const fly = g.flies[0]
    const events: GameEvent[] = []
    // The hand sits on the spot from long before the fly arrives until it leaves.
    let now = a.t
    for (; g.flies.includes(fly); now += 16) events.push(...g.update(now, [punching(g, fly)]))
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(0)
    expect(g.players[0].score).toBe(0)
  })

  it('builds a combo that is worth more', () => {
    const { g, t } = playing()
    const events: GameEvent[] = []
    let now = t
    // Punch every fly the moment it arrives, pulling the hand back in between.
    for (; now < t + 8000; now += 16) {
      const due = g.flies.find((f) => g.flow.elapsed >= f.arrives - 16)
      events.push(...g.update(now, [due ? punching(g, due) : standing()]))
    }
    const hits = events.filter((e) => e.type === 'hit')
    expect(hits.length).toBeGreaterThan(3)
    expect(g.players[0].misses).toBe(0)
    expect(g.players[0].bestCombo).toBe(hits.length)
    const last = hits[hits.length - 1]
    expect(last.type === 'hit' && last.points).toBeGreaterThan(POINTS.perfect)
  })

  it('pays both players a bonus for landing the same beat', () => {
    const { g, t } = playing(2)
    const a = untilFirstFly(g, t, 0, () => [standing(350), standing(930)])
    const [f0, f1] = g.flies
    expect(f0.side).not.toBe(f1.side)
    const events = g.update(a.t, [punching(g, f0, 350), punching(g, f1, 930)])
    expect(events.some((e) => e.type === 'together')).toBe(true)
    expect(g.scores()).toEqual([POINTS.perfect + TOGETHER_BONUS, POINTS.perfect + TOGETHER_BONUS])
  })

  it('ends when the time is up, with no fly left hanging', () => {
    const { g, t } = playing()
    run(t, ROUND_MS + 200, (now) => g.update(now, [standing()]))
    expect(g.flow.phase).toBe('gameover')
    expect(g.flies).toHaveLength(0)
    expect(g.winner()).toBeNull()
  })
})
