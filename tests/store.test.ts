import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  autostartFile,
  desktopEntry,
  hasShortcuts,
  installShortcuts,
  isAutostartEnabled,
  setAutostart
} from '../src/main/autostart'
import {
  addScore,
  cleanCamera,
  cleanName,
  cleanReach,
  defaultData,
  sanitize,
  Store
} from '../src/main/store'
import { pickCamera } from '../src/renderer/src/camera/CameraService'

const day = '2026-11-10T00:00:00.000Z'

describe('score table', () => {
  it('ranks scores, tracks personal bests, and keeps the top 10', () => {
    let d = defaultData()
    const add = (slot: number, score: number): ReturnType<typeof addScore>['result'] => {
      const r = addScore(d, 'balloon-pop', slot, score, day)
      d = r.data
      return r.result
    }
    expect(add(0, 100)).toMatchObject({ rank: 1, personalBest: 100, isPersonalBest: true })
    expect(add(1, 300)).toMatchObject({ rank: 1, isPersonalBest: true })
    expect(add(0, 50)).toMatchObject({ rank: 3, personalBest: 100, isPersonalBest: false })
    for (let i = 0; i < 12; i++) add(2, 1000 + i)
    expect(d.scores['balloon-pop']).toHaveLength(10)
    expect(add(3, 1)).toMatchObject({ rank: null }) // didn't make the table
    expect(d.scores['balloon-pop'][0].score).toBe(1011)
  })

  it('lets an earlier equal score keep the higher place', () => {
    let d = defaultData()
    d = addScore(d, 'g', 0, 200, day).data
    const r = addScore(d, 'g', 1, 200, day).result
    expect(r.rank).toBe(2)
  })

  it('rejects invalid input from the page', () => {
    const d = defaultData()
    expect(() => addScore(d, '../evil', 0, 1, day)).toThrow()
    expect(() => addScore(d, 'g', 9, 1, day)).toThrow()
    expect(() => addScore(d, 'g', 0, -5, day)).toThrow()
    expect(() => addScore(d, 'g', 0, 1.5, day)).toThrow()
  })
})

describe('data file', () => {
  it('cleans names', () => {
    expect(cleanName('  Ana\u0007 ')).toBe('Ana')
    expect(cleanName('x'.repeat(50))).toHaveLength(20)
  })

  it('repairs malformed data instead of crashing', () => {
    const d = sanitize({
      activeSlot: 7,
      slots: [{ id: 1, name: 'Sam' }, { id: 9, name: 'Ghost' }, 'junk'],
      scores: {
        'balloon-pop': [
          { slot: 1, score: 5, date: day },
          { slot: 42, score: 9, date: day }
        ],
        '../x': []
      },
      settings: { startFullscreen: 'yes' }
    })
    expect(d.activeSlot).toBe(0)
    expect(d.slots[1].name).toBe('Sam')
    expect(d.slots).toHaveLength(4)
    expect(d.scores['balloon-pop']).toEqual([{ slot: 1, score: 5, date: day }])
    expect(d.scores['../x']).toBeUndefined()
    expect(d.settings.startFullscreen).toBe(true)
  })

  it('opens in full screen by default, and keeps a later choice to turn it off', () => {
    expect(defaultData().settings.startFullscreen).toBe(true)
    // A file from before full screen became the default is switched over once.
    expect(sanitize({ version: 1, settings: { startFullscreen: false } }).settings).toMatchObject({
      startFullscreen: true
    })
    expect(sanitize({ version: 2, settings: { startFullscreen: false } }).settings).toMatchObject({
      startFullscreen: false
    })
  })

  it('keeps a valid camera choice and drops a broken one', () => {
    const cam = { deviceId: 'abc', label: 'C270 HD WEBCAM' }
    expect(sanitize({ settings: { camera: cam } }).settings.camera).toEqual(cam)
    expect(sanitize({ settings: { camera: { deviceId: 5 } } }).settings.camera).toBeNull()
    expect(sanitize({ settings: {} }).settings.camera).toBeNull()
    expect(cleanCamera({ deviceId: '', label: '' })).toBeNull()
    expect(cleanCamera({ deviceId: 'x'.repeat(201), label: 'a' })).toBeNull()
  })

  it('picks the current camera, then the remembered one, then the first', () => {
    const cams = [
      { deviceId: 'a', label: 'Laptop camera' },
      { deviceId: 'b', label: 'C270 HD WEBCAM' }
    ]
    expect(pickCamera(cams, 'a', { deviceId: 'b', label: 'C270 HD WEBCAM' })).toBe('a')
    expect(pickCamera(cams, '', { deviceId: 'b', label: 'x' })).toBe('b')
    // The id changed (e.g. another USB port): fall back to the name.
    expect(pickCamera(cams, '', { deviceId: 'old', label: 'C270 HD WEBCAM' })).toBe('b')
    // The remembered camera is unplugged: use the first one.
    expect(pickCamera(cams, 'gone', { deviceId: 'old', label: 'Other' })).toBe('a')
    expect(pickCamera(cams, '', null)).toBe('a')
    expect(pickCamera([], '', null)).toBe('')
  })

  it('keeps valid reach zones and drops broken ones', () => {
    const reach = { inward: 0.5, outward: 1.4, up: 0.8, down: 0.7 }
    const d = sanitize({
      slots: [
        { id: 0, name: 'A', reach },
        { id: 1, name: 'B', reach: { inward: 99 } }
      ]
    })
    expect(d.slots[0].reach).toEqual(reach)
    expect(d.slots[1].reach).toBeUndefined()
    expect(cleanReach({ ...reach, down: -1 })).toBeNull()
  })

  it('saves atomically and reloads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gm-store-'))
    const file = join(dir, 'data.json')
    const s = new Store(file)
    s.update((d) => addScore(d, 'balloon-pop', 2, 70, day).data)
    expect(readdirSync(dir)).toEqual(['data.json']) // no .tmp left behind
    expect(new Store(file).data.scores['balloon-pop'][0]).toMatchObject({ slot: 2, score: 70 })
  })

  it('backs up an unreadable file and starts fresh', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gm-store-'))
    const file = join(dir, 'data.json')
    writeFileSync(file, '{ not json')
    const s = new Store(file)
    expect(s.data).toEqual(defaultData())
    expect(readdirSync(dir).some((f) => f.startsWith('data.json.corrupt-'))).toBe(true)
  })
})

describe('auto-start .desktop entry', () => {
  it('quotes paths with spaces in the Exec line', () => {
    expect(desktopEntry(['/usr/bin/electron', '/home/me/My Games/app'])).toContain(
      'Exec=/usr/bin/electron "/home/me/My Games/app"'
    )
  })
})

// The XDG autostart file is the Linux mechanism (Windows/macOS use Electron login items).
describe.runIf(process.platform === 'linux')('auto-start (Linux)', () => {
  const old = process.env.XDG_CONFIG_HOME
  afterEach(() => {
    process.env.XDG_CONFIG_HOME = old
  })

  it('writes the .desktop file only while enabled (in a temp config dir)', () => {
    process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'gm-xdg-'))
    expect(isAutostartEnabled()).toBe(false)
    setAutostart(true, ['/opt/GameMotion.AppImage'])
    expect(isAutostartEnabled()).toBe(true)
    expect(readFileSync(autostartFile(), 'utf8')).toContain('Exec=/opt/GameMotion.AppImage')
    setAutostart(false, [])
    expect(existsSync(autostartFile())).toBe(false)
  })
})

describe.runIf(process.platform === 'linux')('desktop shortcuts (Linux AppImage)', () => {
  const old = process.env.XDG_DATA_HOME
  afterEach(() => {
    process.env.XDG_DATA_HOME = old
  })

  it('adds an app-menu entry, a desktop icon and the icon file (temp folders)', () => {
    process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), 'gm-data-'))
    const desktop = mkdtempSync(join(tmpdir(), 'gm-desktop-'))
    const iconSrc = join(desktop, 'src.png')
    writeFileSync(iconSrc, 'png')
    expect(hasShortcuts(desktop)).toBe(false)
    const [menu, icon] = installShortcuts(['/opt/My Apps/GameMotion.AppImage'], iconSrc, desktop)
    expect(hasShortcuts(desktop)).toBe(true)
    const entry = readFileSync(menu, 'utf8')
    expect(entry).toContain('Exec="/opt/My Apps/GameMotion.AppImage"')
    expect(entry).toContain('Categories=Game;')
    expect(entry).toContain('StartupWMClass=gamemotion')
    expect(readFileSync(icon, 'utf8')).toBe(entry)
  })
})
