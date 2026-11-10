export {}

type TuningStatus =
  { applied: true; device: string; previous: number } | { applied: false; reason: string }

export interface Reach {
  inward: number
  outward: number
  up: number
  down: number
}
export interface Slot {
  id: number
  name: string
  color: string
  /** Fitted cursor reach from Reach setup, if done. */
  reach?: Reach
}
export interface ScoreEntry {
  slot: number
  score: number
  date: string
}
export interface StoreView {
  activeSlot: number
  slots: Slot[]
  scores: Record<string, ScoreEntry[]>
  settings: { startFullscreen: boolean }
  autostart: boolean
}
export interface ScoreResult {
  rank: number | null
  personalBest: number
  isPersonalBest: boolean
  top: ScoreEntry[]
}

declare global {
  interface Window {
    gameMotion: {
      versions: { electron: string; chrome: string }
      /** 'win32' | 'darwin' | 'linux' | ... */
      platform: string
      store: {
        get(): Promise<StoreView>
        setActiveSlot(slot: number): Promise<StoreView>
        renameSlot(slot: number, name: string): Promise<StoreView>
        /** Saves (or with null clears) a player's fitted cursor reach. */
        setReach(slot: number, reach: Reach | null): Promise<StoreView>
        /** Records a score for the active player slot. */
        recordScore(game: string, score: number, slot?: number): Promise<ScoreResult>
        setSettings(change: { startFullscreen?: boolean; autostart?: boolean }): Promise<StoreView>
      }
      quit(): Promise<void>
      /** Linux AppImage only: app-menu entry + desktop icon. */
      shortcuts: {
        status(): Promise<{ supported: boolean; installed: boolean }>
        install(): Promise<{ supported: boolean; installed: boolean }>
      }
      testReport: {
        /** Saves a guided-test report (JSON); resolves to the file path. */
        save(json: string): Promise<string>
      }
      cameraTuning: {
        /** Temporarily holds the camera at its full frame rate (Linux/UVC). */
        lockFrameRate(cameraLabel: string): Promise<TuningStatus>
        /** Puts the camera setting back to what it was before. */
        restore(): Promise<void>
      }
    }
  }
}
