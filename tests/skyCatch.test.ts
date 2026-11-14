import { describe, expect, it } from 'vitest'
import type { BodyInput } from '../src/renderer/src/games/poses'
import {
  fieldView,
  inBasket,
  LIVES,
  POINTS,
  ROUND_MS,
  SkyCatchLogic,
  TOP,
  type GameEvent
} from '../src/renderer/src/games/skyCatch/logic'
import { run, standing, SW } from './helpers/poseInput'

/** Stands under the lowest fruit still falling, and jumps as a comet passes. */
function catcher(logic: SkyCatchLogic, player: number, home: number): BodyInput {
  const body = standing(home)
  const mine = logic.items.filter((i) => i.player === player)
  const fruit = mine
    .filter((i) => !i.past && (i.kind === 'fruit' || i.kind === 'gold'))
    .sort((a, b) => b.y - a.y)[0]
  if (fruit) body.x = fruit.x
  const comet = mine.find((i) => i.kind === 'comet')
  if (comet && Math.abs(comet.x - body.x) < SW * 0.6) body.y -= 0.45 * SW
  return body
}

describe('sky catch field', () => {
  it('keeps each field in its own half, with room above the basket', () => {
    for (const player of [0, 1])
      for (const y of [80, 300, 600]) {
        const f = fieldView({ ...standing(player ? 900 : 300), y }, player, 2)
        expect(f.left).toBeGreaterThanOrEqual(player * 640)
        expect(f.right).toBeLessThanOrEqual((player + 1) * 640)
        expect(f.y).toBeGreaterThan(TOP + f.sw)
      }
  })

  it('catches only what lands in the basket at the chest', () => {
    const body = standing()
    expect(inBasket(body, { x: 640, y: 300 })).toBe(true)
    expect(inBasket(body, { x: 640 + SW * 0.6, y: 300 + SW * 0.3 })).toBe(true)
    expect(inBasket(body, { x: 640 + SW * 0.8, y: 300 })).toBe(false)
    expect(inBasket(body, { x: 640, y: 300 - SW * 0.5 })).toBe(false)
    expect(inBasket(body, { x: 640, y: 300 + SW * 0.6 })).toBe(false)
  })
})

describe('sky catch round', () => {
  it('makes the player move for every fruit, and grab comets with a jump', () => {
    const logic = new SkyCatchLogic(() => 0.5)
    logic.start(0, 1)
    const events: GameEvent[] = []
    run(0, ROUND_MS + 8000, (t) => events.push(...logic.update(t, [catcher(logic, 0, 640)])))
    const c = logic.catchers[0]
    const catches = events.flatMap((e) => (e.type === 'catch' ? [e] : []))
    expect(events.filter((e) => e.type === 'miss')).toEqual([])
    expect(c.lives).toBe(LIVES)
    expect(c.caught).toBeGreaterThan(60)
    expect(catches.filter((e) => e.kind === 'comet').length).toBeGreaterThanOrEqual(5)
    // No two fruit in a row land in the same place.
    const fruit = catches.filter((e) => e.kind === 'fruit')
    for (let i = 1; i < fruit.length; i++)
      expect(Math.abs(fruit[i].x - fruit[i - 1].x)).toBeGreaterThan(SW)
    expect(c.score).toBeGreaterThan(c.caught * POINTS.fruit)
    expect(events.filter((e) => e.type === 'level')).toHaveLength(4)
    expect(logic.flow.phase).toBe('gameover')
  })

  it('ends a run after three bombs caught, and spares a player who steps aside', () => {
    for (const [x, lives] of [
      [640, 0],
      [900, LIVES]
    ] as const) {
      const logic = new SkyCatchLogic(() => 0.9) // every drop is a bomb, on the spot
      logic.start(0, 1)
      const events: GameEvent[] = []
      run(0, 3100, (t) => logic.update(t, [standing(640)]))
      run(3100, 20_000, (t) => events.push(...logic.update(t, [standing(x)])))
      expect(logic.catchers[0].lives).toBe(lives)
      expect(events.filter((e) => e.type === 'boom')).toHaveLength(LIVES - lives)
      expect(events.filter((e) => e.type === 'miss')).toEqual([])
      expect(logic.flow.phase).toBe(lives ? 'playing' : 'gameover')
    }
  })

  it('breaks the streak when fruit is dropped, and does not count a comet without a jump', () => {
    const logic = new SkyCatchLogic(() => 0.5)
    logic.start(0, 1)
    const events: GameEvent[] = []
    let t = run(0, 12_000, (now) => events.push(...logic.update(now, [catcher(logic, 0, 640)])))
    expect(logic.catchers[0].streak).toBeGreaterThan(3)
    t = run(t, 4000, (now) => events.push(...logic.update(now, [standing(30)])))
    expect(logic.catchers[0].streak).toBe(0)
    expect(events.some((e) => e.type === 'miss')).toBe(true)
    // Stand right in a comet's path without jumping.
    const before = events.filter((e) => e.type === 'catch' && e.kind === 'comet').length
    run(t, 16_000, (now) => {
      const body = standing(640)
      events.push(...logic.update(now, [body]))
    })
    expect(events.filter((e) => e.type === 'comet').length).toBeGreaterThan(0)
    expect(events.filter((e) => e.type === 'catch' && e.kind === 'comet')).toHaveLength(before)
  })

  it('drops the same things for two players, each in their own half', () => {
    const logic = new SkyCatchLogic(() => 0.5)
    logic.start(0, 2)
    run(0, 3100, (t) => logic.update(t, [standing(320), standing(960)]))
    run(3100, 10_000, (t) => {
      logic.update(t, [catcher(logic, 0, 320), catcher(logic, 1, 960)])
      for (const item of logic.items) {
        expect(item.x).toBeGreaterThan(item.player * 640)
        expect(item.x).toBeLessThan((item.player + 1) * 640)
      }
    })
    expect(logic.catchers[0].caught).toBeGreaterThan(4)
    expect(logic.catchers[1].caught).toBe(logic.catchers[0].caught)
  })
})
