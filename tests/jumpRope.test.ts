import { describe, expect, it } from 'vitest'
import {
  EARLY_MS,
  FIRST_MS,
  JumpRopeLogic,
  LIVES,
  periodAt,
  POINTS,
  TRIP_PAUSE_MS,
  TURNS_PER_LEVEL,
  type GameEvent
} from '../src/renderer/src/games/jumpRope/logic'
import type { BodyInput } from '../src/renderer/src/games/poses'
import { run, standing, SW } from './helpers/poseInput'

/** A player who is off the ground from `early` ms before the rope passes until `late` after. */
function jumper(logic: JumpRopeLogic, x = 640, early = 100, late = 100): BodyInput {
  const body = standing(x)
  const until = logic.at - logic.flow.elapsed
  if (until <= early && until >= -late) body.y -= 0.45 * SW
  return body
}

describe('jump rope', () => {
  it('turns faster every level, down to a limit', () => {
    expect(periodAt(1)).toBe(1500)
    for (let level = 2; level < 30; level++) {
      expect(periodAt(level)).toBeLessThanOrEqual(periodAt(level - 1))
      expect(periodAt(level)).toBeGreaterThanOrEqual(560)
    }
  })

  it('trips a player who stands still, slows for a moment, and ends after three trips', () => {
    const logic = new JumpRopeLogic(() => 0.5)
    logic.start(0, 1)
    const events: { e: GameEvent; at: number }[] = []
    run(0, 12_000, (t) => {
      for (const e of logic.update(t, [standing()])) events.push({ e, at: logic.flow.elapsed })
    })
    const trips = events.filter((x) => x.e.type === 'trip')
    expect(trips).toHaveLength(LIVES)
    expect(trips[0].at).toBeGreaterThanOrEqual(FIRST_MS)
    expect(trips[1].at - trips[0].at).toBeGreaterThanOrEqual(periodAt(1) + TRIP_PAUSE_MS - 20)
    expect(logic.flow.phase).toBe('gameover')
    expect(logic.scores()).toEqual([0])
  })

  it('counts a jump timed to the rope, builds a streak, and climbs the levels', () => {
    const logic = new JumpRopeLogic(() => 0.5)
    logic.start(0, 1)
    const events: GameEvent[] = []
    run(0, 60_000, (t) => events.push(...logic.update(t, [jumper(logic)])))
    const j = logic.jumpers[0]
    expect(j.lives).toBe(LIVES)
    expect(j.jumps).toBeGreaterThan(40)
    expect(j.best).toBe(j.jumps)
    expect(logic.level).toBe(1 + Math.floor(j.jumps / TURNS_PER_LEVEL))
    expect(events.filter((e) => e.type === 'level')).toHaveLength(logic.level - 1)
    expect(j.score).toBeGreaterThan(j.jumps * (POINTS.jump + POINTS.streakCap) - 300)
    expect(logic.turn()).toBeGreaterThanOrEqual(0)
  })

  it('does not count a jump that lands before the rope arrives', () => {
    const logic = new JumpRopeLogic(() => 0.5)
    logic.start(0, 1)
    run(0, 8000, (t) => logic.update(t, [jumper(logic, 640, EARLY_MS + 400, -(EARLY_MS + 100))]))
    expect(logic.jumpers[0].jumps).toBe(0)
    expect(logic.jumpers[0].lives).toBeLessThan(LIVES)
  })

  it('still clears quick and slow turns for a player who watches the rope', () => {
    let n = 0
    const rolls = [0.1, 0.3, 0.9]
    const logic = new JumpRopeLogic(() => rolls[n++ % rolls.length])
    logic.start(0, 1)
    run(0, 90_000, (t) => logic.update(t, [jumper(logic)]))
    expect(logic.jumpers[0].lives).toBe(LIVES)
    expect(logic.level).toBeGreaterThan(6)
  })

  it('swings one rope for two players; the round lasts until both are out', () => {
    const logic = new JumpRopeLogic(() => 0.5)
    logic.start(0, 2)
    const t = run(0, 20_000, (now) => logic.update(now, [jumper(logic, 320), standing(960)]))
    expect(logic.jumpers[1].lives).toBe(0)
    expect(logic.jumpers[0].lives).toBe(LIVES)
    expect(logic.flow.phase).toBe('playing')
    const jumps = logic.jumpers[0].jumps
    run(t, 12_000, (now) => logic.update(now, [standing(320), standing(960)]))
    expect(logic.flow.phase).toBe('gameover')
    // A jump already in the air when the first player stops still counts.
    expect(logic.jumpers[0].jumps).toBeLessThanOrEqual(jumps + 1)
    expect(logic.scores()[0]).toBeGreaterThan(logic.scores()[1])
  })
})
