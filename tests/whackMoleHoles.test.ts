import { describe, expect, it } from 'vitest'
import {
  GAP_MS,
  GOLD_CHANCE,
  HOLES,
  MAX_UP,
  MOLE_REACH,
  POINTS,
  RISE_MS,
  ROUND_MS,
  UP_MS,
  allowedHoles,
  holeSpot
} from '../src/renderer/src/games/whackMole/holes'

const body = { x: 640, y: 300, sw: 180, hands: { left: null, right: null }, crouching: false }

describe('Whack-a-Mole holes', () => {
  it('has the agreed numbers', () => {
    expect(ROUND_MS).toBe(60_000)
    expect(UP_MS).toEqual([1700, 900])
    expect(GAP_MS).toEqual([1100, 480])
    expect(RISE_MS).toBe(220)
    expect(POINTS).toEqual({ mole: 50, gold: 150 })
    expect(GOLD_CHANCE).toBe(0.12)
    expect(MOLE_REACH).toBe(0.5)
    expect(MAX_UP).toBe(3)
  })
  it('lists six holes: left, right and bottom, never top', () => {
    expect(HOLES).toEqual([
      { edge: 'left', lane: -1 },
      { edge: 'left', lane: 1 },
      { edge: 'right', lane: -1 },
      { edge: 'right', lane: 1 },
      { edge: 'bottom', lane: -1 },
      { edge: 'bottom', lane: 1 }
    ])
  })
  it('places holes around the body in shoulder widths', () => {
    const at = (edge: 'left' | 'right' | 'bottom', lane: -1 | 1): number[] => {
      const s = holeSpot(body, edge, lane)
      expect(s.r).toBeCloseTo(90)
      return [Math.round(s.x), Math.round(s.y)]
    }
    expect(at('left', -1)).toEqual([370, 180]) // y 174 is kept below the score plates (90 + r)
    expect(at('left', 1)).toEqual([334, 354])
    expect(at('right', -1)).toEqual([910, 180])
    expect(at('right', 1)).toEqual([946, 354])
    expect(at('bottom', -1)).toEqual([469, 588])
    expect(at('bottom', 1)).toEqual([811, 588])
  })
  it('keeps holes inside the picture', () => {
    const corner = { ...body, x: 100, y: 600 }
    for (const h of HOLES) {
      const s = holeSpot(corner, h.edge, h.lane)
      expect(s.x).toBeGreaterThanOrEqual(90)
      expect(s.x).toBeLessThanOrEqual(1280 - 90)
      expect(s.y).toBeGreaterThanOrEqual(180)
      expect(s.y).toBeLessThanOrEqual(720 - 90)
    }
    expect(holeSpot({ ...body, x: 1250 }, 'right', 1).x).toBe(1190)
  })
  it('keeps two players out of the space between them', () => {
    expect(allowedHoles(0, 1)).toEqual(HOLES)
    expect(allowedHoles(0, 2).map((h) => h.edge)).toEqual(['left', 'left', 'bottom', 'bottom'])
    expect(allowedHoles(1, 2).map((h) => h.edge)).toEqual(['right', 'right', 'bottom', 'bottom'])
  })
})
