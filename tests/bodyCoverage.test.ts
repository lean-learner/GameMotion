import { describe, expect, it } from 'vitest'
import { bodyExtent } from '../src/renderer/src/tracking/bodyCoverage'
import type { Point } from '../src/renderer/src/tracking/types'

/** Pose where landmarks at or above `lastIndex` row are visible, everything else hidden/out of frame. */
function pose(visible: number[], outOfFrame: number[] = []): Point[] {
  return Array.from({ length: 33 }, (_, i) => ({
    x: 0.5,
    y: outOfFrame.includes(i) ? 1.2 : 0.5,
    z: 0,
    visibility: visible.includes(i) || outOfFrame.includes(i) ? 0.95 : 0.1
  }))
}

describe('bodyExtent', () => {
  it('reports none without a pose', () => {
    expect(bodyExtent(null)).toBe('none')
  })

  it('finds the lowest fully visible level', () => {
    expect(bodyExtent(pose([0, 11, 12]))).toBe('shoulders')
    expect(bodyExtent(pose([0, 11, 12, 23, 24]))).toBe('hips')
    expect(bodyExtent(pose([0, 11, 12, 23, 24, 25, 26, 27, 28]))).toBe('ankles')
  })

  it('accepts one side of a pair (player turned slightly)', () => {
    expect(bodyExtent(pose([0, 11, 23, 25]))).toBe('knees')
  })

  it('treats landmarks guessed outside the frame as not in view', () => {
    // MediaPipe extrapolates off-screen knees with high visibility sometimes.
    expect(bodyExtent(pose([0, 11, 12, 23, 24], [25, 26]))).toBe('hips')
  })

  it('stops at the first gap', () => {
    expect(bodyExtent(pose([0, 23, 24, 25, 26]))).toBe('head')
  })
})
