import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

/**
 * Local persistence: player slots, high scores and settings in one JSON file
 * (~/.config/gamemotion/gamemotion-data.json). Main process only; the page
 * reaches it through narrow, validated IPC calls.
 */
export interface Slot {
  id: number
  name: string
  color: string
}

export interface ScoreEntry {
  slot: number
  score: number
  date: string
}

export interface Settings {
  startFullscreen: boolean
}

export interface StoreData {
  version: 1
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
    version: 1,
    activeSlot: 0,
    slots: SLOT_COLORS.map((color, id) => ({ id, name: `Player ${id + 1}`, color })),
    scores: {},
    settings: { startFullscreen: false }
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
    d.settings.startFullscreen = r.settings.startFullscreen === true
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

export class Store {
  data: StoreData

  constructor(private readonly file: string) {
    this.data = this.load()
  }

  save(): void {
    // Write-then-rename, so a crash mid-write never leaves a broken file.
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file)
  }

  update(change: (d: StoreData) => StoreData): StoreData {
    this.data = change(this.data)
    this.save()
    return this.data
  }

  private load(): StoreData {
    if (!existsSync(this.file)) return defaultData()
    try {
      return sanitize(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch (err) {
      // Keep the unreadable file for inspection rather than silently losing it.
      const backup = `${this.file}.corrupt-${Date.now()}`
      try {
        renameSync(this.file, backup)
      } catch {
        // ignore
      }
      console.warn(`[store] could not read data file (${String(err)}); moved to ${backup}`)
      return defaultData()
    }
  }
}
