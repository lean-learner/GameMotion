/**
 * The flow every round shares (no Phaser): menu, 3-2-1 countdown, playing,
 * paused, game over. A game's rules own one of these and ask it each frame
 * how much play time has passed. Time in ms.
 */
export type Phase = 'menu' | 'countdown' | 'playing' | 'paused' | 'gameover'
export type PauseReason = 'player' | 'out-of-view'

export const COUNTDOWN_MS = 3000
/** A frame longer than this (a hitch, a hidden window) counts as this much play time. */
const MAX_STEP_MS = 100

export class RoundFlow {
  phase: Phase = 'menu'
  pauseReason: PauseReason | null = null
  /** Play time so far this round: stops while paused or counting down. */
  elapsed = 0
  private phaseStart = 0
  private last = 0

  /** The number to show during the countdown (3, 2, 1), or 0 outside it. */
  countdown(now: number): number {
    return this.phase === 'countdown'
      ? Math.ceil((COUNTDOWN_MS - (now - this.phaseStart)) / 1000)
      : 0
  }

  start(now: number): void {
    this.elapsed = 0
    this.pauseReason = null
    this.set('countdown', now)
  }

  pause(now: number, reason: PauseReason): void {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return
    this.pauseReason = reason
    this.set('paused', now)
  }

  /** Back into the round, through a fresh countdown so nobody is caught off guard. */
  resume(now: number): void {
    if (this.phase !== 'paused') return
    this.pauseReason = null
    this.set('countdown', now)
  }

  toMenu(now: number): void {
    this.set('menu', now)
  }

  finish(now: number): void {
    this.set('gameover', now)
  }

  /** Call once per frame. Returns the play time that passed (0 unless playing). */
  tick(now: number): number {
    const dt = Math.max(0, Math.min(now - this.last, MAX_STEP_MS))
    this.last = now
    if (this.phase === 'countdown' && now - this.phaseStart >= COUNTDOWN_MS) {
      this.set('playing', now)
      return 0
    }
    if (this.phase !== 'playing') return 0
    this.elapsed += dt
    return dt
  }

  private set(phase: Phase, now: number): void {
    this.phase = phase
    this.phaseStart = now
    this.last = now
  }
}

/** Index of the highest score, or null for one player or a tie. */
export function leader(scores: readonly number[]): number | null {
  if (scores.length < 2) return null
  const best = Math.max(...scores)
  return scores.filter((s) => s === best).length > 1 ? null : scores.indexOf(best)
}
