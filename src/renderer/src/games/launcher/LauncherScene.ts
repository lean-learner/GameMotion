import Phaser from 'phaser'
import type { Vec2 } from '../../input/types'
import type { LauncherServices } from '../types'
import {
  CursorLayer,
  DwellButtons,
  FONT,
  HAND_COLORS,
  hex,
  type Button,
  type CursorDraw
} from '../ui'

const W = 1280
const H = 720

/** Score table of a game for the current mode (versus scores are kept apart). */
const tableFor = (gameId: string, players: number): string =>
  players > 1 ? `${gameId}-2p` : gameId

/**
 * The start screen: 1 or 2 players, who is playing, which game. Everything is
 * operated by holding a hand cursor on a button (or clicking with a mouse).
 */
export class LauncherScene extends Phaser.Scene {
  private buttons!: DwellButtons
  /** Leaving the app needs a deliberate, longer hold. */
  private exitButton!: DwellButtons
  private cursors!: CursorLayer
  private hint!: Phaser.GameObjects.Text
  private labels: Phaser.GameObjects.Text[] = []
  private scoresText!: Phaser.GameObjects.Text
  private dirty = true
  private switching = false

  constructor(private readonly services: LauncherServices) {
    super('launcher')
  }

  create(): void {
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x10213f, 0x10213f, 0x1d4e89, 0x1d4e89, 1, 1, 1, 1)
    bg.fillRect(0, 0, W, H)
    this.add
      .text(W / 2, 62, 'GameMotion', {
        fontFamily: FONT,
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setStroke('#0b1d33', 8)
    this.hint = this.add
      .text(W / 2, 118, '', { fontFamily: FONT, fontSize: '24px', color: '#cfe8ff' })
      .setOrigin(0.5)
    this.scoresText = this.add
      .text(W * 0.74, 0, '', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
        lineSpacing: 4
      })
      .setStroke('#0b1d33', 4)
    this.buttons = new DwellButtons(this, { dwellMs: 1000, fontSize: 30 })
    this.exitButton = new DwellButtons(this, { dwellMs: 2000, fontSize: 26, alpha: 0.7 })
    this.exitButton.set([
      { id: 'exit', label: 'Exit', sub: 'hold 2 s', x: 0.84, y: 0.04, w: 0.12, h: 0.1 }
    ])
    this.cursors = new CursorLayer(this, 30)
  }

  update(): void {
    const now = performance.now()
    if (this.dirty) this.layout()
    const count = this.services.playerCount()
    const players = this.services.players()
    const px = (v: Vec2 | null): Vec2 | null => (v ? { x: v.x * W, y: v.y * H } : null)
    const screenHands: (Vec2 | null)[] = []
    const draws: CursorDraw[] = []
    for (let p = 0; p < count; p++) {
      const c = this.services.input.cursors(now, p)
      screenHands.push(c.left, c.right)
      for (const side of ['left', 'right'] as const) {
        const color = count > 1 ? hex(players[p]?.color ?? '#ffffff') : HAND_COLORS[side]
        draws.push({ pos: px(c[side]), color })
      }
    }
    if (!this.switching) {
      const pressed =
        this.buttons.update(now, screenHands) ?? this.exitButton.update(now, screenHands)
      if (pressed) this.act(pressed)
    }
    this.cursors.draw(draws)
    this.hint.setText(this.hintText(count, screenHands.some(Boolean)))
  }

  private hintText(count: number, anyCursor: boolean): string {
    if (this.switching) return 'Switching player mode...'
    const snaps = Array.from({ length: count }, (_, i) => this.services.input.snapshot(i))
    if (snaps.every((s) => !s)) return 'Starting the camera...'
    const seen = snaps.filter((s) => s?.tracked).length
    if (seen < count) {
      return count > 1
        ? `${seen} of 2 players in view - stand side by side, a little further back`
        : 'Step into view so the camera can see your shoulders'
    }
    return anyCursor ? 'Hold your cursor on a button to press it' : 'Raise a hand to get a cursor'
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

  private label(text: string, x: number, y: number): void {
    this.labels.push(
      this.add.text(W * x, H * y, text, { fontFamily: FONT, fontSize: '24px', color: '#cfe8ff' })
    )
  }

  private layout(): void {
    this.dirty = false
    for (const l of this.labels) l.destroy()
    this.labels = []
    const count = this.services.playerCount()
    const chosen = this.services.players()
    const slots = this.services.slots()

    const mode: Button[] = [1, 2].map((n, i) => ({
      id: `mode-${n}`,
      label: n === 1 ? '1 player' : '2 players',
      x: 0.025 + i * 0.145,
      y: 0.04,
      w: 0.135,
      h: 0.09,
      selected: count === n
    }))

    // Player rows: one in 1-player mode; left and right rows in 2-player mode.
    const rows: { side: 'left' | 'right'; title: string; y: number; h: number }[] =
      count > 1
        ? [
            { side: 'left', title: 'Left player', y: 0.215, h: 0.09 },
            { side: 'right', title: 'Right player', y: 0.36, h: 0.09 }
          ]
        : [{ side: 'left', title: 'Who is playing?', y: 0.25, h: 0.12 }]
    const players: Button[] = rows.flatMap((row) => {
      this.label(row.title, 0.06, row.y - 0.045)
      const current = chosen[row.side === 'left' ? 0 : 1]
      return slots.map((p, i) => ({
        id: `${row.side}-${p.slot}`,
        label: p.name,
        x: 0.06 + i * 0.225,
        y: row.y,
        w: 0.2,
        h: row.h,
        color: hex(p.color),
        selected: current?.slot === p.slot
      }))
    })

    const gamesY = count > 1 ? 0.54 : 0.48
    this.label('Games', 0.06, gamesY - 0.05)
    const games: Button[] = this.services.games.map((g, i) => {
      const best = this.services.topScores(tableFor(g.id, count))[0]
      return {
        id: `game-${g.id}`,
        label: count > 1 ? `${g.title} Versus` : g.title,
        sub: best ? `Best: ${best.score} (${best.name})` : 'No scores yet',
        x: 0.06 + i * 0.28,
        y: gamesY,
        w: 0.26,
        h: count > 1 ? 0.22 : 0.26
      }
    })
    const settings: Button = {
      id: 'settings',
      label: 'Settings',
      x: 0.06,
      y: 0.86,
      w: 0.16,
      h: 0.1
    }
    const reach: Button = {
      id: 'reach',
      label: 'Reach setup',
      sub: 'fit cursors to your arms',
      x: 0.24,
      y: 0.86,
      w: 0.22,
      h: 0.1
    }
    this.buttons.set([...mode, ...players, ...games, settings, reach])

    // Top 3 for every game, for the current mode.
    const lines = this.services.games.flatMap((g) => {
      const rows = this.services.topScores(tableFor(g.id, count)).slice(0, 3)
      return [
        `${g.title}${count > 1 ? ' Versus' : ''}`,
        ...(rows.length
          ? rows.map((r, i) => `   ${i + 1}.  ${r.name}  ${r.score}`)
          : ['   No scores yet']),
        ''
      ]
    })
    this.scoresText.setY(H * (gamesY - 0.04)).setText(['Top scores', ...lines].join('\n'))
  }
}
