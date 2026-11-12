import {
  addScore,
  cleanCamera,
  cleanName,
  cleanReach,
  defaultData,
  sanitize,
  type StoreData
} from '../../../shared/storeData'
import type { StoreView } from '../../../preload/index.d'

/**
 * The web version's stand-in for the desktop app's preload bridge.
 *
 * In the desktop app, Electron's preload script provides `window.gameMotion`
 * and the main process does the work. In a browser there is no preload, so
 * this module provides the same interface with browser features: saved data
 * goes to localStorage (through the same cleaning rules as the desktop file),
 * and desktop-only features report that they aren't available.
 */
const STORAGE_KEY = 'gamemotion-data'

function load(): StoreData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitize(JSON.parse(raw)) : defaultData()
  } catch (err) {
    console.warn('[store] could not read saved data; starting fresh:', err)
    return defaultData()
  }
}

function installWebPlatform(): void {
  let data = load()
  const view = (): StoreView => ({ ...data, autostart: false })
  const update = (next: StoreData): StoreView => {
    data = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (err) {
      // Private windows and full storage: play on, just without saving.
      console.warn('[store] could not save:', err)
    }
    return view()
  }
  const slotOf = (slot: unknown): number => {
    if (!Number.isInteger(slot) || !data.slots[slot as number]) throw new Error('invalid slot')
    return slot as number
  }

  window.gameMotion = {
    versions: { electron: '', chrome: '' },
    platform: 'web',
    store: {
      get: async () => view(),
      setActiveSlot: async (slot) => update({ ...data, activeSlot: slotOf(slot) }),
      renameSlot: async (slot, name) => {
        const id = slotOf(slot)
        const clean = typeof name === 'string' ? cleanName(name) : ''
        if (!clean) throw new Error('invalid name')
        return update({
          ...data,
          slots: data.slots.map((s) => (s.id === id ? { ...s, name: clean } : s))
        })
      },
      setReach: async (slot, reach) => {
        const id = slotOf(slot)
        const clean = reach === null ? null : cleanReach(reach)
        if (reach !== null && !clean) throw new Error('invalid reach')
        return update({
          ...data,
          slots: data.slots.map((s) => {
            if (s.id !== id) return s
            const next = { ...s }
            if (clean) next.reach = clean
            else delete next.reach
            return next
          })
        })
      },
      recordScore: async (game, score, slot) => {
        const added = addScore(
          data,
          game,
          typeof slot === 'number' ? slot : data.activeSlot,
          score,
          new Date().toISOString()
        )
        update(added.data)
        return added.result
      },
      setSettings: async (change) => {
        let settings = data.settings
        if (typeof change.startFullscreen === 'boolean')
          settings = { ...settings, startFullscreen: change.startFullscreen }
        if (change.camera !== undefined)
          settings = { ...settings, camera: cleanCamera(change.camera) }
        return update({ ...data, settings })
      }
    },
    // A web page can't close its own tab; the shell shows the welcome screen instead.
    quit: async () => undefined,
    exitFullscreen: async () => {
      if (document.fullscreenElement) await document.exitFullscreen()
    },
    shortcuts: {
      status: async () => ({ supported: false, installed: false }),
      install: async () => ({ supported: false, installed: false })
    },
    testReport: {
      // No folder to write to: hand the report to the browser as a download.
      save: async (json) => {
        const name = `gamemotion-test-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = name
        link.click()
        URL.revokeObjectURL(url)
        return `your downloads folder (${name})`
      }
    },
    cameraTuning: {
      lockFrameRate: async () => ({ applied: false, reason: 'not available in the browser' }),
      restore: async () => undefined
    }
  }
}

if (!('gameMotion' in window)) installWebPlatform()
