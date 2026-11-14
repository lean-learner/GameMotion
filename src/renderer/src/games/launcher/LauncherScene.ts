import Phaser from 'phaser'
import type { Vec2 } from '../../input/types'
import type { LauncherServices } from '../types'
import {
  CursorLayer,
  DwellButtons,
  fillScreen,
  FONT,
  HAND_COLORS,
  hex,
  THEME,
  themeBackdrop,
  type Button,
  type CursorDraw
} from '../ui'
import { tileArt } from './tileArt'

const W = 1280
const H = 720
/** Left edge of every row, and the gap between tiles (0..1 of the width). */
const LEFT = 0.04
const GAP = 0.025
/** Tiles per row in the games and players rows. */
const PER_ROW = 5
const TILE_W = (1 - 2 * LEFT - (PER_ROW - 1) * GAP) / PER_ROW
/** Vertical gap between the rows of game tiles (0..1 of the height). */
const ROW_GAP = 0.04
/** A game starts after a closed fist is held on its tile this long. */
const GAME_DWELL_MS = 1500

type Direction = 'left' | 'right' | 'up' | 'down'

/** Score table of a game for the current mode (versus scores are kept apart). */
const tableFor = (gameId: string, players: number): string =>
  players > 1 ? `${gameId}-2p` : gameId

/**
 * Picks the tile to move to from `from` in a direction: the nearest one that
 * lies that way, preferring tiles in line with the current one.
 */
export function nextTile(
  tiles: readonly Button[],
  from: string | null,
  dir: Direction
): string | null {
  const cur = tiles.find((t) => t.id === from)
  if (!cur) return tiles[0]?.id ?? null
  const cx = cur.x + cur.w / 2
  const cy = cur.y + cur.h / 2
  let best: string | null = null
  let bestScore = Infinity
  for (const t of tiles) {
    if (t.id === cur.id) continue
    // Compare in screen proportions (16:9), so "nearest" matches what players see.
    const dx = (t.x + t.w / 2 - cx) * 16
    const dy = (t.y + t.h / 2 - cy) * 9
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy
    const across = Math.abs(dir === 'left' || dir === 'right' ? dy : dx)
    if (along <= 0.01 || across > along * 2.5) continue
    const score = along + across * 2
    if (score < bestScore) {
      bestScore = score
      best = t.id
    }
  }
  return best ?? cur.id
}

/**
 * The start screen, laid out like a console dashboard: a row of game tiles,
 * a row of players, and a row of options. Everything is operated by holding a
 * hand cursor on a tile (a fist is faster), by mouse, by arrow keys + Enter, or by a gamepad.
 * A game tile starts only while the hand is closed into a fist.
 */
export class LauncherScene extends Phaser.Scene {
  private tiles!: DwellButtons
  private cursors!: CursorLayer
  private hint!: Phaser.GameObjects.Text
  private clock!: Phaser.GameObjects.Text
  private labels: Phaser.GameObjects.Text[] = []
  private dirty = true
  private switching = false
  /** Gamepad buttons held on the previous frame, to act once per press. */
  private padHeld = new Set<string>()
  /** The keyboard or gamepad was used last, so the hint explains those controls. */
  private usedKeys = false

  constructor(private readonly services: LauncherServices) {
    super('launcher')
  }

  create(): void {
    fillScreen(this)
    const bg = themeBackdrop(this)
    // A soft green glow behind the top-left corner.
    // (Kept above the tiles, whose rounded corners assume the plain gradient.)
    for (let i = 0; i < 6; i++) {
      bg.fillStyle(THEME.green, 0.05)
      bg.fillCircle(110, -30, 155 - i * 22)
    }
    // Brand mark and name.
    bg.fillStyle(THEME.green, 1)
    bg.fillCircle(W * LEFT + 22, 48, 22)
    bg.lineStyle(4, 0xffffff, 1)
    bg.strokeCircle(W * LEFT + 22, 48, 11)
    this.add
      .text(W * LEFT + 58, 48, 'GameMotion', {
        fontFamily: FONT,
        fontSize: '34px',
        fontStyle: 'bold',
        color: THEME.text
      })
      .setOrigin(0, 0.5)
    this.clock = this.add
      .text(W * 0.82, 48, '', { fontFamily: FONT, fontSize: '28px', color: THEME.text })
      .setOrigin(1, 0.5)
    this.hint = this.add
      .text(W * LEFT, H * 0.955, '', { fontFamily: FONT, fontSize: '21px', color: THEME.textDim })
      .setOrigin(0, 0.5)
    this.tiles = new DwellButtons(this, { dwellMs: 1500, fontSize: 30, tile: true })
    this.cursors = new CursorLayer(this, 30)

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const dir = (
        { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const
      )[e.key]
      if (dir) this.move(dir)
      else if (e.key === 'Enter' || e.key === ' ') this.pressFocused()
    })
  }

  update(): void {
    const now = performance.now()
    if (this.dirty) this.layout()
    this.pollGamepad()
    const count = this.services.playerCount()
    const players = this.services.players()
    const px = (v: Vec2 | null): Vec2 | null => (v ? { x: v.x * W, y: v.y * H } : null)
    const screenHands: (Vec2 | null)[] = []
    const draws: CursorDraw[] = []
    for (let p = 0; p < count; p++) {
      const c = this.services.input.cursors(now, p)
      screenHands.push(c.left, c.right)
      if (c.left || c.right) this.usedKeys = false
      for (const side of ['left', 'right'] as const) {
        const color = count > 1 ? hex(players[p]?.color ?? '#ffffff') : HAND_COLORS[side]
        draws.push({ pos: px(c[side]), color, fist: c[side]?.fist })
      }
    }
    const pressed = this.tiles.update(now, this.switching ? [] : screenHands)
    if (pressed && !this.switching) this.act(pressed)
    this.cursors.draw(draws)
    this.hint.setText(this.hintText(count, screenHands.some(Boolean)))
    const d = new Date()
    this.clock.setText(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`)
  }

  // ---- Keyboard and gamepad ------------------------------------------------------

  private move(dir: Direction): void {
    this.usedKeys = true
    this.tiles.focus = nextTile(this.tiles.all, this.tiles.focus, dir)
  }

  private pressFocused(): void {
    if (this.tiles.focus) this.tiles.press(this.tiles.focus)
    else this.move('right') // first press just shows where the focus is
  }

  /** D-pad or left stick moves the focus; A (button 0) presses. */
  private pollGamepad(): void {
    const held = new Set<string>()
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue
      const b = (i: number): boolean => !!pad.buttons[i]?.pressed
      const [ax = 0, ay = 0] = pad.axes
      if (b(14) || ax < -0.6) held.add('left')
      if (b(15) || ax > 0.6) held.add('right')
      if (b(12) || ay < -0.6) held.add('up')
      if (b(13) || ay > 0.6) held.add('down')
      if (b(0)) held.add('press')
    }
    for (const k of held) {
      if (this.padHeld.has(k)) continue
      if (k === 'press') this.pressFocused()
      else this.move(k as Direction)
    }
    this.padHeld = held
  }

  private hintText(count: number, anyCursor: boolean): string {
    if (this.switching) return 'Switching…'
    const problem = this.services.problem()
    if (problem) return `${problem}  ·  Open Settings to retry`
    const snaps = Array.from({ length: count }, (_, i) => this.services.input.snapshot(i))
    if (snaps.every((s) => !s)) return 'Starting camera…'
    const seen = snaps.filter((s) => s?.tracked).length
    if (seen < count) {
      return count > 1
        ? `${seen} of 2 players in view  ·  Stand side by side, a step further back`
        : 'Step in front of the camera'
    }
    if (this.usedKeys) return 'Arrows to move  ·  Enter to select'
    return anyCursor
      ? 'Point at a game  ·  Close your fist and hold to start'
      : 'Raise a hand to point'
  }

  private act(id: string): void {
    if (id === 'mode-1' || id === 'mode-2') {
      this.switching = true
      void this.services
        .setPlayerCount(id === 'mode-1' ? 1 : 2)
        .catch((err) => console.error('[launcher] could not switch player mode:', err))
        .finally(() => {
          this.switching = false
          this.dirty = true
        })
    } else if (id.startsWith('left-') || id.startsWith('right-')) {
      const [side, slot] = id.split('-')
      void this.services.setPlayer(Number(slot), side === 'right').then(() => (this.dirty = true))
    } else if (id.startsWith('game-')) {
      this.services.launch(id.slice(5))
    } else if (id === 'settings') {
      this.services.openSettings()
    } else if (id === 'reach') {
      this.services.openReachSetup()
    } else if (id === 'exit') {
      this.services.quit()
    }
  }

  private label(text: string, y: number): void {
    this.labels.push(
      this.add
        .text(W * LEFT, H * y, text, { fontFamily: FONT, fontSize: '22px', color: THEME.textDim })
        .setOrigin(0, 0.5)
    )
  }

  private layout(): void {
    this.dirty = false
    for (const l of this.labels) l.destroy()
    this.labels = []
    const count = this.services.playerCount()
    const chosen = this.services.players()
    const slots = this.services.slots()
    const two = count > 1
    const column = (i: number): number => LEFT + i * (TILE_W + GAP)

    // Games: big picture tiles.
    // As many rows as the games need, sharing the height one row used to have.
    const gamesY = 0.16
    const gamesH = two ? 0.34 : 0.44
    const gameRows = Math.max(1, Math.ceil(this.services.games.length / PER_ROW))
    const tileH = (gamesH - (gameRows - 1) * ROW_GAP) / gameRows
    this.label(two ? 'Games · 2 players' : 'Games', gamesY - 0.035)
    const games: Button[] = this.services.games.map((g, i) => {
      const best = this.services.topScores(tableFor(g.id, count))[0]
      return {
        id: `game-${g.id}`,
        label: g.title,
        sub: best ? `Best ${best.score} · ${best.name}` : 'No score yet',
        x: column(i % PER_ROW),
        y: gamesY + Math.floor(i / PER_ROW) * (tileH + ROW_GAP),
        w: TILE_W,
        h: tileH,
        art: tileArt(g.id),
        fistOnly: true,
        dwellMs: GAME_DWELL_MS
      }
    })

    // Players: one row in 1-player mode; left and right rows in 2-player mode.
    const rows: { side: 'left' | 'right'; title: string; y: number; h: number }[] = two
      ? [
          { side: 'left', title: 'Left player', y: 0.565, h: 0.075 },
          { side: 'right', title: 'Right player', y: 0.695, h: 0.075 }
        ]
      : [{ side: 'left', title: "Who's playing?", y: 0.67, h: 0.1 }]
    const players: Button[] = rows.flatMap((row) => {
      this.label(row.title, row.y - 0.035)
      const current = chosen[row.side === 'left' ? 0 : 1]
      return slots.map((p, i) => ({
        id: `${row.side}-${p.slot}`,
        label: p.name,
        x: column(i),
        y: row.y,
        w: TILE_W,
        h: row.h,
        avatar: hex(p.color),
        selected: current?.slot === p.slot
      }))
    })

    // Options along the bottom.
    const y = 0.81
    const h = 0.1
    const options: Button[] = [
      { id: 'mode-1', label: '1 player', x: LEFT, y, w: 0.14, h, selected: count === 1 },
      { id: 'mode-2', label: '2 players', x: 0.205, y, w: 0.14, h, selected: count === 2 },
      {
        id: 'reach',
        label: 'Reach setup',
        sub: 'put every tile in easy reach',
        x: 0.37,
        y,
        w: 0.2025,
        h
      },
      { id: 'settings', label: 'Settings', x: 0.5975, y, w: 0.16, h }
    ]
    // Leaving the app needs a deliberate, longer hold. Top-right, clear of the
    // camera preview that sits in the bottom-right corner.
    const exit: Button = {
      id: 'exit',
      label: 'Exit',
      sub: 'hold to exit',
      x: 0.84,
      y: 0.025,
      w: 0.12,
      h: 0.085,
      dwellMs: 2000
    }
    this.tiles.set([...games, ...players, ...options, exit])
  }
}
