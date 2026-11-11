import type { HandCursor, InputEvent, MotionSnapshot, Side } from '../input/types'

export interface Player {
  slot: number
  name: string
  color: string
}

/** A score table row, with the player's name resolved. */
export interface ScoreRow {
  name: string
  color: string
  score: number
}

export interface SavedScore {
  rank: number | null
  personalBest: number
  isPersonalBest: boolean
  top: ScoreRow[]
}

/**
 * What a game gets from the platform. Games never touch the camera, MediaPipe
 * or the DOM outside their own container.
 */
export interface GameServices {
  input: {
    /**
     * A player's hand cursors (0..1 screen space) predicted to `now`; call once
     * per rendered frame. `player` defaults to 0 (the only player in 1-player mode).
     */
    cursors(now: number, player?: number): Record<Side, HandCursor | null>
    /** A player's latest motion state (calibration, tracked, lean, crouch). */
    snapshot(player?: number): MotionSnapshot | null
    /** Subscribe to gesture events of every player; returns an unsubscribe function. */
    onEvent(listener: (e: InputEvent, player: number) => void): () => void
  }
  /** Who is playing this session, left to right (index = player number). */
  players(): Player[]
  /** Saves a finished round's score for a player (null if saving failed). */
  saveScore(gameId: string, score: number, player?: number): Promise<SavedScore | null>
  /** Ask the platform to close the game and return to the launcher. */
  exit(): void
}

/** Extra services for Reach setup. */
export interface SetupServices extends GameServices {
  /** A player's hand relative to its shoulder, in shoulder widths (null if not seen). */
  handRelative(player: number, side: Side): { out: number; down: number } | null
  /** Saves a player's fitted reach zone and starts using it. */
  saveReach(
    player: number,
    zone: { inward: number; outward: number; up: number; down: number }
  ): Promise<boolean>
}

/** Extra services for the launcher. */
export interface LauncherServices extends GameServices {
  games: { id: string; title: string }[]
  /** A camera or tracking problem to show the player, if there is one. */
  problem(): string | null
  /** All four player slots. */
  slots(): Player[]
  /** Chooses the (left) player; in 2-player mode `right` chooses the right player. */
  setPlayer(slot: number, right?: boolean): Promise<void>
  playerCount(): number
  /** Switches 1/2-player mode (reloads tracking for two bodies). */
  setPlayerCount(count: number): Promise<void>
  topScores(gameId: string): ScoreRow[]
  launch(gameId: string): void
  openSettings(): void
  openReachSetup(): void
  quit(): void
}

/** A game the launcher can start. */
export interface GameModule {
  id: string
  title: string
  /**
   * Starts the game inside `parent`; resolves to a function that stops it.
   * `options.autostart` skips the menu (used by the automated self-test).
   */
  mount(
    parent: HTMLElement,
    services: GameServices,
    options?: { autostart?: boolean }
  ): Promise<() => void>
}
