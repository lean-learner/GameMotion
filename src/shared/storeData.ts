/**
 * The saved data: player slots, high scores and settings, with the rules for
 * cleaning and changing it. Pure (no files, no browser), so the desktop app
 * (main/store.ts, a JSON file) and the web version (platform/web.ts, browser
 * storage) share it. Nothing read from storage is trusted before `sanitize`.
 */
/** A player's fitted cursor reach (shoulder widths); see renderer input/reach.ts. */
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
  reach?: Reach
}

const REACH_LIMITS: Record<keyof Reach, [number, number]> = {
  inward: [0.2, 1.6],
  outward: [0.5, 2.5],
  up: [0.3, 2.0],
  down: [0.3, 1.6]
}

/** A valid reach zone, or null. */
export function cleanReach(r: unknown): Reach | null {
  if (!r || typeof r !== 'object') return null
  const out = {} as Reach
  for (const [k, [lo, hi]] of Object.entries(REACH_LIMITS) as [keyof Reach, [number, number]][]) {
    const v = (r as Record<string, unknown>)[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return null
    out[k] = v
  }
  return out
}

export interface ScoreEntry {
  slot: number
  score: number
  date: string
}

/** The camera the player last picked. The label is the fallback when the id changes. */
export interface CameraChoice {
  deviceId: string
  label: string
}

export interface Settings {
  startFullscreen: boolean
  camera: CameraChoice | null
}

/** A valid camera choice, or null. */
export function cleanCamera(c: unknown): CameraChoice | null {
  if (!c || typeof c !== 'object') return null
  const { deviceId, label } = c as Record<string, unknown>
  if (typeof deviceId !== 'string' || typeof label !== 'string') return null
  if (deviceId.length > 200 || label.length > 200) return null
  if (!deviceId && !label) return null
  return { deviceId, label }
}

export interface StoreData {
  version: 2
  activeSlot: number
  slots: Slot[]
  /** Top scores per game id, best first. */
  scores: Record<string, ScoreEntry[]>
  settings: Settings
}

export interface ScoreResult {
  /** 1-based position in the game's table, or null if it didn't make the table. */
  rank: number | null
  personalBest: number
  isPersonalBest: boolean
  top: ScoreEntry[]
}

export const SLOT_COLORS = ['#ff4d6d', '#4da3ff', '#4dd17a', '#ffb02e']
const MAX_SCORES = 10
const MAX_NAME = 20
const GAME_ID = /^[a-z0-9-]{1,40}$/

export function defaultData(): StoreData {
  return {
    version: 2,
    activeSlot: 0,
    slots: SLOT_COLORS.map((color, id) => ({ id, name: `Player ${id + 1}`, color })),
    scores: {},
    settings: { startFullscreen: true, camera: null }
  }
}

/** Repairs whatever is on disk into valid data; unknown or broken parts fall back to defaults. */
export function sanitize(raw: unknown): StoreData {
  const d = defaultData()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<StoreData>
  if (Array.isArray(r.slots)) {
    for (const s of r.slots) {
      if (s && Number.isInteger(s.id) && d.slots[s.id] && typeof s.name === 'string') {
        d.slots[s.id].name = cleanName(s.name) || d.slots[s.id].name
        const reach = cleanReach(s.reach)
        if (reach) d.slots[s.id].reach = reach
      }
    }
  }
  if (Number.isInteger(r.activeSlot) && d.slots[r.activeSlot as number])
    d.activeSlot = r.activeSlot as number
  if (r.scores && typeof r.scores === 'object') {
    for (const [game, list] of Object.entries(r.scores)) {
      if (!GAME_ID.test(game) || !Array.isArray(list)) continue
      d.scores[game] = list
        .filter(
          (e) =>
            e &&
            Number.isInteger(e.slot) &&
            d.slots[e.slot] &&
            Number.isFinite(e.score) &&
            typeof e.date === 'string'
        )
        .map((e) => ({ slot: e.slot, score: Math.round(e.score), date: e.date }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SCORES)
    }
  }
  if (r.settings && typeof r.settings === 'object') {
    // Full screen is the default. Files from before that default (version 1) are
    // switched over once; after that the player's own choice is kept.
    d.settings.startFullscreen =
      (r.version as number) >= 2 ? r.settings.startFullscreen !== false : true
    d.settings.camera = cleanCamera(r.settings.camera)
  }
  return d
}

export function cleanName(name: string): string {
  // Drop control characters (code points below 32, and DEL).
  const printable = [...name].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
  return printable.join('').trim().slice(0, MAX_NAME)
}

/** Adds a score to the table (pure). */
export function addScore(
  data: StoreData,
  game: string,
  slot: number,
  score: number,
  date: string
): { data: StoreData; result: ScoreResult } {
  if (!GAME_ID.test(game)) throw new Error('invalid game id')
  if (!data.slots[slot]) throw new Error('invalid slot')
  if (!Number.isInteger(score) || score < 0 || score > 10_000_000) throw new Error('invalid score')
  const previous = data.scores[game] ?? []
  const previousBest = Math.max(0, ...previous.filter((e) => e.slot === slot).map((e) => e.score))
  const entry: ScoreEntry = { slot, score, date }
  // Ties: the earlier score keeps the higher place.
  const all = [...previous, entry].sort((a, b) => b.score - a.score)
  const top = all.slice(0, MAX_SCORES)
  const index = top.indexOf(entry)
  return {
    data: { ...data, scores: { ...data.scores, [game]: top } },
    result: {
      rank: index >= 0 ? index + 1 : null,
      personalBest: Math.max(previousBest, score),
      isPersonalBest: score > previousBest,
      top
    }
  }
}
