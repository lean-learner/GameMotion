import { describe, expect, it, vi } from 'vitest'

// The scene module imports Phaser, which needs a browser; only the pure helper is tested.
vi.mock('phaser', () => ({ default: { Scene: class {} } }))

import type { Button } from '../src/renderer/src/games/ui'
import { nextTile } from '../src/renderer/src/games/launcher/LauncherScene'

const tile = (id: string, x: number, y: number, w = 0.2, h = 0.2): Button => ({
  id,
  label: id,
  x,
  y,
  w,
  h
})
const tiles = [
  tile('g1', 0.04, 0.18),
  tile('g2', 0.27, 0.18),
  tile('g3', 0.5, 0.18),
  tile('p1', 0.04, 0.6, 0.2, 0.14),
  tile('p2', 0.27, 0.6, 0.2, 0.14),
  tile('exit', 0.84, 0.02, 0.12, 0.08)
]

describe('launcher tile navigation', () => {
  it('starts on the first tile', () => {
    expect(nextTile(tiles, null, 'right')).toBe('g1')
  })

  it('moves along a row and between rows', () => {
    expect(nextTile(tiles, 'g1', 'right')).toBe('g2')
    expect(nextTile(tiles, 'g2', 'left')).toBe('g1')
    expect(nextTile(tiles, 'g2', 'down')).toBe('p2')
    expect(nextTile(tiles, 'p1', 'up')).toBe('g1')
  })

  it('stays put at an edge and can reach the corner tile', () => {
    expect(nextTile(tiles, 'g1', 'left')).toBe('g1')
    expect(nextTile(tiles, 'p1', 'down')).toBe('p1')
    expect(nextTile(tiles, 'g3', 'right')).toBe('exit')
  })
})
