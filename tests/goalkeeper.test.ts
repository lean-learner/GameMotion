import { describe, expect, it } from 'vitest'
import {
  ballPosition,
  canSave,
  goalSpot,
  goalView,
  GoalkeeperLogic,
  levelAt,
  ROUND_MS,
  SAVE_WINDOW_MS,
  type GameEvent
} from '../src/renderer/src/games/goalkeeper/logic'
import { standing, run } from './helpers/poseInput'

describe('goalkeeper geometry', () => {
  it('fits each goal within its own half, clear of the score plates', () => {
    for (const player of [0, 1]) {
      for (const x of [0, 320, 640, 960, 1280]) {
        const goal = goalView(standing(x), player, 2)
        expect(goal.left).toBeGreaterThanOrEqual(player * 640)
        expect(goal.right).toBeLessThanOrEqual((player + 1) * 640)
        expect(goal.top).toBeGreaterThanOrEqual(90)
        expect(goal.bottom).toBeLessThanOrEqual(720)
      }
    }
  })
  it('saves by either hand or torso, but not unseen bodies or low standing reach', () => {
    const body = standing()
    expect(canSave(body, { x: body.x, y: body.y + body.sw * 0.6 })).toBe(true)
    const low = { x: body.x, y: body.y + body.sw * 1.7 }
    expect(canSave(body, low)).toBe(false)
    expect(canSave({ ...body, y: body.y + body.sw, crouching: true }, low)).toBe(true)
    for (const side of ['left', 'right'] as const) {
      expect(canSave({ ...body, hands: { ...body.hands, [side]: low } }, low)).toBe(true)
    }
    expect(canSave(null, low)).toBe(false)
  })
  it('curves during flight and arrives at exactly the target spot', () => {
    const goal = goalView(standing(), 0, 1)
    const shot = { from: 100, duration: 1600, offset: { x: 1.8, y: -0.9 }, curve: 1 }
    const midpoint = ballPosition(goal, shot, 900)
    const straight = ballPosition(goal, { ...shot, curve: 0 }, 900)
    expect(midpoint.x - straight.x).toBeCloseTo(goal.sw)
    const arrived = ballPosition(goal, shot, 1700)
    expect(arrived).toMatchObject({ ...goalSpot(goal, shot.offset), progress: 1 })
    expect(arrived.r).toBeGreaterThan(ballPosition(goal, shot, 100).r)
  })
})

function started(count = 1): GoalkeeperLogic {
  const logic = new GoalkeeperLogic(() => 0.75)
  logic.start(0, count)
  logic.update(
    3000,
    Array.from({ length: count }, (_, i) => standing(i ? 960 : 320))
  )
  return logic
}

describe('goalkeeper round', () => {
  it('ends after three goals and never judges a shot twice', () => {
    const logic = started()
    const events: GameEvent[] = []
    run(3016, 14000, (t) => events.push(...logic.update(t, [null])))
    // Supply an anchor first, otherwise no shots should spawn without a player.
    expect(events).toEqual([])
    run(17016, 18000, (t) => events.push(...logic.update(t, [standing()])))
    expect(events.filter((e) => e.type === 'goal')).toHaveLength(3)
    expect(logic.keepers[0].lives).toBe(0)
    expect(logic.flow.phase).toBe('gameover')
  })
  it('keeps the goal fixed when the keeper moves, counts saves and a streak', () => {
    const logic = started()
    const events: GameEvent[] = []
    run(3016, 11000, (t) => {
      const body = standing()
      const keeper = logic.keepers[0]
      const shot = logic.shots[0]
      if (keeper.goal && shot) body.hands.left = goalSpot(keeper.goal, shot.offset)
      events.push(...logic.update(t, [body]))
    })
    expect(logic.keepers[0].saves).toBeGreaterThanOrEqual(3)
    expect(logic.scores()[0]).toBeGreaterThan(50 * logic.keepers[0].saves)
    const anchor = { ...logic.keepers[0].goal! }
    logic.update(14032, [{ ...standing(900), y: 500, crouching: true }])
    expect(logic.keepers[0].goal).toEqual(anchor)
    expect(events.some((e) => e.type === 'save')).toBe(true)
  })
  it('accepts a hand within the tracking grace window, not an earlier touch', () => {
    for (const early of [false, true]) {
      const logic = started()
      run(3016, 1200, (t) => logic.update(t, [standing()]))
      const shot = logic.shots[0]
      const arrival = shot.from + shot.duration
      let touched = false
      run(4216, 1800, (t) => {
        const body = standing()
        const until = arrival - logic.flow.elapsed
        if (!touched && until <= (early ? SAVE_WINDOW_MS + 200 : 100)) {
          body.hands.right = goalSpot(logic.keepers[0].goal!, shot.offset)
          touched = true
        }
        logic.update(t, [body])
      })
      expect(logic.keepers[0].saves).toBe(early ? 0 : 1)
    }
  })
  it('gives both players the same shots and allows a survivor to continue', () => {
    const logic = started(2)
    const events: GameEvent[] = []
    run(3016, ROUND_MS + 4000, (t) => {
      const left = standing(320)
      left.sw = 100
      const right = standing(960)
      right.sw = 100
      const k = logic.keepers[0]
      const shots = logic.shots.filter((s) => !s.judged[0])
      for (const [i, shot] of shots.slice(0, 2).entries()) {
        if (k.goal) left.hands[i ? 'right' : 'left'] = goalSpot(k.goal, shot.offset)
      }
      events.push(...logic.update(t, [left, right]))
    })
    expect(logic.keepers[1].lives).toBe(0)
    expect(logic.keepers[0].lives).toBe(3)
    expect(logic.flow.phase).toBe('gameover')
    expect(events.filter((e) => e.type === 'level')).toHaveLength(4)
    expect(logic.keepers[0].saves).toBeGreaterThan(30)
    expect(levelAt(ROUND_MS)).toBe(5)
  })
  it('freezes active flight and spawning while paused', () => {
    const logic = started()
    run(3016, 1800, (t) => logic.update(t, [standing()]))
    logic.flow.pause(4816, 'player')
    const state = JSON.stringify(logic.shots)
    const elapsed = logic.flow.elapsed
    expect(logic.update(100000, [standing()])).toEqual([])
    expect(logic.flow.elapsed).toBe(elapsed)
    expect(JSON.stringify(logic.shots)).toBe(state)
  })
})
