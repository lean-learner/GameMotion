import { describe, expect, it } from 'vitest'
import {
  dedupeHands,
  dedupePoses,
  SPLIT_VIEWS,
  toFullFrame
} from '../src/renderer/src/tracking/splitView'
import type { HandResult, Point } from '../src/renderer/src/tracking/types'

const [LEFT, RIGHT] = SPLIT_VIEWS

/** A pose whose shoulders sit around (x, y) in whatever space is given. */
function poseAt(x: number, y = 0.4, width = 0.08): Point[] {
  const pts: Point[] = Array.from({ length: 33 }, () => ({ x, y, z: 0, visibility: 0.9 }))
  pts[11] = { x: x - width / 2, y, z: 0, visibility: 0.9 }
  pts[12] = { x: x + width / 2, y, z: 0, visibility: 0.9 }
  return pts
}

describe('split view', () => {
  it('overlaps the halves in the middle', () => {
    expect(LEFT.x1).toBeGreaterThan(RIGHT.x0)
    expect(LEFT.x0).toBe(0)
    expect(RIGHT.x1).toBe(1)
  })

  it('maps crop coordinates back to the full frame', () => {
    const [p] = toFullFrame([{ x: 0.5, y: 0.3, z: 0.2 }], RIGHT)
    expect(p.x).toBeCloseTo(0.45 + 0.5 * 0.55)
    expect(p.y).toBe(0.3)
    expect(p.z).toBeCloseTo(0.2 * 0.55)
    expect(toFullFrame([{ x: 1, y: 0, z: 0 }], LEFT)[0].x).toBeCloseTo(0.55)
  })

  it('keeps two different people', () => {
    expect(
      dedupePoses([
        { pose: poseAt(0.25), view: LEFT },
        { pose: poseAt(0.75), view: RIGHT }
      ])
    ).toHaveLength(2)
  })

  it('keeps one copy of a person in the overlap, from their own half', () => {
    const fromLeft = poseAt(0.52)
    const fromRight = poseAt(0.515)
    const kept = dedupePoses([
      { pose: fromLeft, view: LEFT },
      { pose: fromRight, view: RIGHT }
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0]).toBe(fromRight) // shoulders at x > 0.5: the right half's copy
  })

  it('drops duplicate hands from the overlap', () => {
    const hand = (x: number): HandResult => ({
      handedness: 'Right',
      score: 0.9,
      landmarks: Array(21).fill({ x, y: 0.5, z: 0 })
    })
    expect(dedupeHands([hand(0.5), hand(0.51), hand(0.8)])).toHaveLength(2)
  })
})
