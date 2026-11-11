import type { HandCursor } from './types'

/** A selectable screen region, in the same 0..1 space as cursors. */
export interface DwellTarget {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Hold time for this target, if different from the selector's. */
  dwellMs?: number
}

export interface DwellState {
  /** Target currently being hovered, if any, with progress 0..1. */
  hover: { id: string; progress: number } | null
  /** Set on the frame a target is selected. */
  selected: string | null
}

/** A closed fist fills the timer this many times faster than an open hand. */
export const FIST_SPEED = 2

/**
 * "Hover to press": a cursor resting on a target starts a timer, shown filling
 * on the target, and selects it when the timer completes (`dwellMs`). Nothing
 * is ever selected without the timer. Closing the hand into a fist while
 * hovering fills the same timer faster.
 *
 * After a selection the cursor must leave the target before it can select again.
 */
export class DwellSelector {
  private current: { id: string; filledMs: number; last: number } | null = null
  private locked: string | null = null

  constructor(
    public targets: DwellTarget[],
    private readonly dwellMs = 1000
  ) {}

  update(cursors: (HandCursor | null)[], t: number): DwellState {
    let hit: DwellTarget | undefined
    let fist = false
    for (const tg of this.targets) {
      const on = cursors.filter(
        (c): c is HandCursor =>
          !!c && c.x >= tg.x && c.x <= tg.x + tg.w && c.y >= tg.y && c.y <= tg.y + tg.h
      )
      if (on.length) {
        hit = tg
        fist = on.some((c) => c.fist === true)
        break
      }
    }
    if (!hit) {
      this.current = null
      this.locked = null
      return { hover: null, selected: null }
    }
    if (hit.id === this.locked) return { hover: null, selected: null }
    if (this.current?.id !== hit.id) this.current = { id: hit.id, filledMs: 0, last: t }
    const cur = this.current
    const step = Math.max(t - cur.last, 0)
    cur.filledMs += step * (fist ? FIST_SPEED : 1)
    cur.last = t
    const progress = Math.min(1, cur.filledMs / (hit.dwellMs ?? this.dwellMs))
    if (progress >= 1) {
      this.locked = hit.id
      this.current = null
      return { hover: null, selected: hit.id }
    }
    return { hover: { id: hit.id, progress }, selected: null }
  }
}
