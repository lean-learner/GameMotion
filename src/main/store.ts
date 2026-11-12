import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { defaultData, sanitize, type StoreData } from '../shared/storeData'

export * from '../shared/storeData'

/**
 * Desktop persistence: one JSON file (~/.config/gamemotion/gamemotion-data.json).
 * Main process only; the page reaches it through narrow, validated IPC calls.
 */
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
