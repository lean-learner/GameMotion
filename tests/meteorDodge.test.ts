import { describe, expect, it } from 'vitest'
import {
  BEAM_WARNING_MS,
  COUNTDOWN_MS,
  DEFAULT_BODY,
  FIELD,
  LIVES,
  MeteorDodgeLogic,
  type PlayerInput
} from '../src/renderer/src/games/meteorDodge/logic'

/** A player standing at `x` (default: where a single player starts). */
const at = (x = FIELD.width / 2, crouching = false): PlayerInput => ({
  x,
  top: DEFAULT_BODY.top,
  half: DEFAULT_BODY.half,
  crouching
})
const still = at()
const BODY_Y = DEFAULT_BODY.top + 100

/** A game in the playing phase; returns it and the time. */
function playing(players = 1): { g: MeteorDodgeLogic; t: number } {
  const g = new MeteorDodgeLogic(() => 0.5)
  g.start(0, players)
  g.update(COUNTDOWN_MS, [])
  expect(g.phase).toBe('playing')
  return { g, t: COUNTDOWN_MS }
}

function run(
  g: MeteorDodgeLogic,
  from: number,
  ms: number,
  inputs: (PlayerInput | null)[]
): number {
  let t = from
  for (; t < from + ms; t += 16) g.update(t, inputs)
  return t
}

describe('Meteor Dodge', () => {
  it('follows the player across the frame, and stays put while they are not seen', () => {
    const { g, t } = playing()
    g.meteors = []
    const t2 = run(g, t, 500, [at(900)])
    expect(g.players[0].x).toBeCloseTo(900, 0)
    run(g, t2, 500, [null])
    expect(g.players[0].x).toBeCloseTo(900, 0)
  })

  it('drops meteors on or near the player, starting above the frame', () => {
    const { g, t } = playing()
    run(g, t, 4000, [at(300)])
    expect(g.meteors.length).toBeGreaterThan(0)
    for (const m of g.meteors)
      expect(Math.abs(m.x - 300)).toBeLessThanOrEqual(DEFAULT_BODY.half * 4.5)
    const fresh = new MeteorDodgeLogic(() => 0.5)
    fresh.start(0, 1)
    fresh.update(COUNTDOWN_MS, [])
    run(fresh, COUNTDOWN_MS, 1250, [still])
    expect(fresh.meteors[0].y).toBeLessThan(-fresh.meteors[0].r)
  })

  it('a meteor beside the player misses', () => {
    const { g, t } = playing()
    const p = g.players[0]
    g.meteors = [{ id: 1, x: p.x + p.half + 60, y: BODY_Y, r: 30, vy: 0 }]
    expect(g.update(t + 16, [still]).some((e) => e.type === 'hit')).toBe(false)
  })

  it('takes a life when a meteor lands on you, then protects you briefly', () => {
    const { g, t } = playing()
    const p = g.players[0]
    g.meteors = [
      { id: 1, x: p.x, y: BODY_Y, r: 30, vy: 0 },
      { id: 2, x: p.x, y: BODY_Y, r: 30, vy: 0 }
    ]
    const events = g.update(t + 16, [still])
    expect(events).toContainEqual({ type: 'hit', player: 0, by: 'meteor', livesLeft: LIVES - 1 })
    expect(g.update(t + 32, [still]).filter((e) => e.type === 'hit')).toHaveLength(0) // invulnerable
  })

  it('a beam hits a standing player but passes over a crouching one', () => {
    const make = (): MeteorDodgeLogic => {
      const { g } = playing()
      g.meteors = []
      g.beams = [{ id: 9, x: g.players[0].x + 10, dir: 1, length: 380, speed: 0, warnedAt: 0 }]
      return g
    }
    const standing = make()
    const hitsStanding = standing.update(COUNTDOWN_MS + BEAM_WARNING_MS + 16, [still])
    expect(hitsStanding.some((e) => e.type === 'hit' && e.by === 'beam')).toBe(true)

    const ducking = make()
    const hitsDucking = ducking.update(COUNTDOWN_MS + BEAM_WARNING_MS + 16, [at(undefined, true)])
    expect(hitsDucking.some((e) => e.type === 'hit')).toBe(false)
  })

  it('does not hit during the beam warning', () => {
    const { g, t } = playing()
    g.meteors = []
    g.beams = [{ id: 9, x: g.players[0].x + 10, dir: 1, length: 380, speed: 0, warnedAt: t }]
    expect(g.update(t + 100, [still]).some((e) => e.type === 'hit')).toBe(false)
  })

  it('collects stars for points', () => {
    const { g, t } = playing()
    const before = g.players[0].score
    g.stars = [{ id: 5, x: g.players[0].x, y: BODY_Y, vy: 0 }]
    const events = g.update(t + 16, [still])
    expect(events.some((e) => e.type === 'star')).toBe(true)
    expect(g.players[0].score - before).toBeGreaterThanOrEqual(50)
  })

  it('ends when every player is out, scoring survival time', () => {
    const { g, t } = playing()
    g.players[0].lives = 1
    g.meteors = [{ id: 1, x: g.players[0].x, y: BODY_Y, r: 30, vy: 0 }]
    run(g, t, 5000, [still]) // survive a little (the meteor hits on the first frame)
    expect(g.phase).toBe('gameover')
    expect(Number.isInteger(g.players[0].score)).toBe(true)
  })

  it('in versus, the survivor keeps scoring and wins', () => {
    const { g, t } = playing(2)
    expect(g.players.map((p) => Math.round(p.x))).toEqual([384, 896])
    g.players[0].lives = 1
    g.meteors = [{ id: 1, x: g.players[0].x, y: BODY_Y, r: 30, vy: 0 }]
    g.update(t + 16, [null, null])
    expect(g.players[0].alive).toBe(false)
    run(g, t + 32, 3000, [null, at(1100)])
    expect(g.players[1].score).toBeGreaterThan(g.players[0].score)
    expect(g.winner()).toBe(1)
  })

  it('lets players try moving on the menu before starting', () => {
    const g = new MeteorDodgeLogic(() => 0.5)
    g.prepare(1)
    let t = 0
    for (; t < 800; t += 16) g.update(t, [at(1100, true)])
    expect(g.phase).toBe('menu')
    expect(g.players[0].x).toBeGreaterThan(FIELD.width * 0.8)
    expect(g.players[0].crouching).toBe(true)
  })

  it('pauses and resumes with a countdown', () => {
    const { g, t } = playing()
    g.pause(t, 'out-of-view')
    expect(g.phase).toBe('paused')
    g.resume(t + 100)
    expect(g.countdown(t + 200)).toBe(3)
  })
})
