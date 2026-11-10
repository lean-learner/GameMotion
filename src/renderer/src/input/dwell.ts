import type { Vec2 } from './types'

/** A selectable screen region, in the same 0..1 space as cursors. */
export interface DwellTarget {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface DwellState {
  /** Target currently being hovered, if any, with progress 0..1. */
  hover: { id: string; progress: number } | null
  /** Set on the frame a target is selected. */
  selected: string | null
}

/**
 * "Hover to press": a cursor resting on a target for `dwellMs` selects it.
 * After a selection the cursor must leave the target before it can select again.
 */
export class DwellSelector {
  private current: { id: string; since: number } | null = null
  private locked: string | null = null

  constructor(
    public targets: DwellTarget[],
    private readonly dwellMs = 1000
  ) {}

  update(cursors: (Vec2 | null)[], t: number): DwellState {
    const hit = this.targets.find((tg) =>
      cursors.some(
        (c) => c && c.x >= tg.x && c.x <= tg.x + tg.w && c.y >= tg.y && c.y <= tg.y + tg.h
      )
    )
    if (!hit) {
      this.current = null
      this.locked = null
      return { hover: null, selected: null }
    }
    if (hit.id === this.locked) return { hover: null, selected: null }
    if (this.current?.id !== hit.id) this.current = { id: hit.id, since: t }
    const progress = Math.min(1, (t - this.current.since) / this.dwellMs)
    if (progress >= 1) {
      this.locked = hit.id
      this.current = null
      return { hover: null, selected: hit.id }
    }
    return { hover: { id: hit.id, progress }, selected: null }
  }
}
