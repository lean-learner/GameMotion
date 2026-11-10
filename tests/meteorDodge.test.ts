import { describe, expect, it } from 'vitest'
import {
  BEAM_WARNING_MS,
  COUNTDOWN_MS,
  FIELD,
  GROUND_Y,
  LIVES,
  MeteorDodgeLogic,
  type PlayerInput
} from '../src/renderer/src/games/meteorDodge/logic'

const still: PlayerInput = { lean: 0, crouching: false }

/** A game in the playing phase; returns it and the time. */
function playing(players = 1): { g: MeteorDodgeLogic; t: number } {
  const g = new MeteorDodgeLogic(() => 0.5)
  g.start(0, players)
  g.update(COUNTDOWN_MS, [])
  expect(g.phase).toBe('playing')
  return { g, t: COUNTDOWN_MS }
}

function run(g: MeteorDodgeLogic, from: number, ms: number, inputs: PlayerInput[]): number {
  let t = from
  for (; t < from + ms; t += 16) g.update(t, inputs)
  return t
}

describe('Meteor Dodge', () => {
  it('moves the avatar by leaning, and reaches the edge without a full lean', () => {
    const { g, t } = playing()
    g.meteors = []
    run(g, t, 1000, [{ lean: 0.85, crouching: false }])
    expect(g.players[0].x).toBeGreaterThan(FIELD.width - 80)
    run(g, t + 1000, 1000, [{ lean: -0.85, crouching: false }])
    expect(g.players[0].x).toBeLessThan(80)
  })

  it('takes a life when a meteor lands on you, then protects you briefly', () => {
    const { g, t } = playing()
    const p = g.players[0]
    g.meteors = [
      { id: 1, x: p.x, y: GROUND_Y - 100, r: 30, vy: 0 },
      { id: 2, x: p.x, y: GROUND_Y - 100, r: 30, vy: 0 }
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
    const hitsDucking = ducking.update(COUNTDOWN_MS + BEAM_WARNING_MS + 16, [
      { lean: 0, crouching: true }
    ])
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
    g.stars = [{ id: 5, x: g.players[0].x, y: GROUND_Y - 60, vy: 0 }]
    const events = g.update(t + 16, [still])
    expect(events.some((e) => e.type === 'star')).toBe(true)
    expect(g.players[0].score - before).toBeGreaterThanOrEqual(50)
  })

  it('ends when every player is out, scoring survival time', () => {
    const { g, t } = playing()
    g.players[0].lives = 1
    g.meteors = [{ id: 1, x: g.players[0].x, y: GROUND_Y - 80, r: 30, vy: 0 }]
    run(g, t, 5000, [still]) // survive a little (the meteor hits on the first frame)
    expect(g.phase).toBe('gameover')
    expect(Number.isInteger(g.players[0].score)).toBe(true)
  })

  it('in versus, the survivor keeps scoring and wins', () => {
    const { g, t } = playing(2)
    expect(g.players.map((p) => Math.round(p.x))).toEqual([384, 896])
    g.players[0].lives = 1
    g.meteors = [{ id: 1, x: g.players[0].x, y: GROUND_Y - 80, r: 30, vy: 0 }]
    g.update(t + 16, [still, still])
    expect(g.players[0].alive).toBe(false)
    run(g, t + 32, 3000, [still, { lean: 0.3, crouching: false }])
    expect(g.players[1].score).toBeGreaterThan(g.players[0].score)
    expect(g.winner()).toBe(1)
  })

  it('lets players try moving on the menu before starting', () => {
    const g = new MeteorDodgeLogic(() => 0.5)
    g.prepare(1)
    let t = 0
    for (; t < 800; t += 16) g.update(t, [{ lean: 0.8, crouching: true }])
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
