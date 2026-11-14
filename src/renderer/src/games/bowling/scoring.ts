/** Ten-pin scoring (no Phaser): strikes and spares earn the next rolls as a bonus. */
export const FRAMES = 10
export const PINS = 10

export interface FrameScore {
  /** Pins knocked by each roll of this frame. */
  rolls: number[]
  /** Running total up to and including this frame; bonuses still to come count as 0. */
  total: number
}

/** The throw that comes next. */
export interface Turn {
  /** 0..9 */
  frame: number
  /** 0..2 (a third ball only in the last frame). */
  ball: number
  /** All ten pins are set up for it. */
  fresh: boolean
}

export interface Card {
  frames: FrameScore[]
  total: number
  /** Null once the game is over. */
  next: Turn | null
}

/** Scores a game from its rolls so far (pins knocked by each, in order). */
export function scoreGame(rolls: readonly number[]): Card {
  const frames: FrameScore[] = []
  const at = (i: number): number => rolls[i] ?? 0
  let next: Turn | null = null
  let total = 0
  let i = 0
  for (let frame = 0; frame < FRAMES; frame++) {
    if (i >= rolls.length) {
      next = { frame, ball: 0, fresh: true }
      break
    }
    const first = at(i)
    if (frame < FRAMES - 1) {
      if (first === PINS) {
        total += PINS + at(i + 1) + at(i + 2)
        frames.push({ rolls: [first], total })
        i += 1
        continue
      }
      if (i + 1 >= rolls.length) {
        total += first
        frames.push({ rolls: [first], total })
        next = { frame, ball: 1, fresh: false }
        break
      }
      const second = at(i + 1)
      total += first + second + (first + second === PINS ? at(i + 2) : 0)
      frames.push({ rolls: [first, second], total })
      i += 2
      continue
    }
    // The last frame: a strike or a spare earns a third ball.
    const mine = rolls.slice(i, i + 3)
    const second = at(i + 1)
    const bonus = first === PINS || first + second === PINS
    const needed = mine.length < 2 ? 2 : bonus ? 3 : 2
    total += mine.slice(0, needed).reduce((a, b) => a + b, 0)
    frames.push({ rolls: mine.slice(0, needed), total })
    if (mine.length === 1) next = { frame, ball: 1, fresh: first === PINS }
    else if (mine.length === 2 && bonus)
      next = { frame, ball: 2, fresh: second === PINS || first + second === PINS }
  }
  return { frames, total, next }
}

/** A frame as written on a scorecard: X strike, / spare, - nothing. */
export function marks(frame: FrameScore): string {
  let out = ''
  let standing = PINS
  // The first ball at a full rack: only that one can be a strike.
  let fresh = true
  for (const r of frame.rolls) {
    if (r === standing) {
      out += fresh ? 'X' : '/'
      standing = PINS
      fresh = true
      continue
    }
    out += r === 0 ? '-' : String(r)
    standing -= r
    fresh = false
  }
  return out
}
