import Phaser from 'phaser'
import type { HandRelative } from '../../input/cursor'
import { fitReach, MIN_SAMPLES } from '../../input/reach'
import type { Side, Vec2 } from '../../input/types'
import type { SetupServices } from '../types'
import { CursorLayer, DwellButtons, FONT, HAND_COLORS, hex, type CursorDraw } from '../ui'

const W = 1280
const H = 720
const INTRO_MS = 3000
const RECORD_MS = 8000
/** Pixels per shoulder width in the body diagram. */
const SCALE = 95

type Step = { kind: 'intro' | 'record'; side: Side } | { kind: 'result' }
const STEPS: Step[] = [
  { kind: 'intro', side: 'right' },
  { kind: 'record', side: 'right' },
  { kind: 'intro', side: 'left' },
  { kind: 'record', side: 'left' },
  { kind: 'result' }
]

/**
 * Reach setup: players trace big circles with each hand; the zone their hands
 * actually covered becomes their personal cursor reach (saved per player).
 */
export class ReachSetupScene extends Phaser.Scene {
  private step = 0
  private stepStart = 0
  private samples: HandRelative[][] = []
  private gfx!: Phaser.GameObjects.Graphics
  private title!: Phaser.GameObjects.Text
  private detail!: Phaser.GameObjects.Text
  private buttons!: DwellButtons
  private cursors!: CursorLayer

  constructor(private readonly services: SetupServices) {
    super('reach-setup')
  }

  create(): void {
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x10213f, 0x10213f, 0x1d4e89, 0x1d4e89, 1, 1, 1, 1)
    bg.fillRect(0, 0, W, H)
    this.gfx = this.add.graphics().setDepth(5)
    this.title = this.add
      .text(W / 2, 50, '', {
        fontFamily: FONT,
        fontSize: '46px',
        fontStyle: 'bold',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setStroke('#0b1d33', 8)
    this.detail = this.add
      .text(W / 2, 108, '', {
        fontFamily: FONT,
        fontSize: '26px',
        color: '#cfe8ff',
        align: 'center'
      })
      .setOrigin(0.5, 0)
    const players = this.services.players()
    players.forEach((p, i) =>
      this.add
        .text(this.centreX(i), H * 0.52 + SCALE * 1.65, p.name, {
          fontFamily: FONT,
          fontSize: '28px',
          fontStyle: 'bold',
          color: p.color
        })
        .setOrigin(0.5)
        .setStroke('#0b1d33', 5)
    )
    this.buttons = new DwellButtons(this, { dwellMs: 1000 })
    this.cursors = new CursorLayer(this, 30)
    this.restart()
  }

  private centreX(player: number): number {
    const n = this.services.players().length
    return n > 1 ? (player === 0 ? W * 0.27 : W * 0.73) : W / 2
  }

  private restart(): void {
    this.samples = this.services.players().map(() => [])
    this.step = 0
    this.stepStart = performance.now()
    this.buttons.set([])
  }

  update(): void {
    const now = performance.now()
    const step = STEPS[this.step]
    const elapsed = now - this.stepStart
    const players = this.services.players()

    if (step.kind === 'record') {
      players.forEach((_, p) => {
        const r = this.services.handRelative(p, step.side)
        if (r) this.samples[p].push(r)
      })
    }
    if (step.kind !== 'result' && elapsed >= (step.kind === 'intro' ? INTRO_MS : RECORD_MS)) {
      this.step++
      this.stepStart = now
      if (STEPS[this.step].kind === 'result') void this.finish()
    }

    const cur = STEPS[this.step]
    if (cur.kind !== 'result') {
      const hand = cur.side === 'right' ? 'RIGHT' : 'LEFT'
      this.title.setText(
        cur.kind === 'intro'
          ? `Get ready: ${hand} hand`
          : `Trace big circles with your ${hand} hand`
      )
      this.detail.setText(
        cur.kind === 'intro'
          ? 'Stand at your play spot. Draw large, slow circles - as far as is comfortable,\nup high, out to the side, across your body and down to your waist.'
          : 'Keep going - bigger circles, but stay comfortable.'
      )
    }
    this.draw(
      now,
      cur,
      cur.kind === 'result'
        ? 1
        : (now - this.stepStart) / (cur.kind === 'intro' ? INTRO_MS : RECORD_MS)
    )

    // Buttons (result screen) use the new reach immediately.
    const hands: (Vec2 | null)[] = []
    const draws: CursorDraw[] = []
    players.forEach((p, i) => {
      const c = this.services.input.cursors(now, i)
      hands.push(c.left, c.right)
      for (const side of ['left', 'right'] as const) {
        const pos = c[side]
        draws.push({
          pos: pos && { x: pos.x * W, y: pos.y * H },
          color: players.length > 1 ? hex(p.color) : HAND_COLORS[side]
        })
      }
    })
    const pressed = this.buttons.update(now, hands)
    if (pressed === 'again') this.restart()
    if (pressed === 'done') this.services.exit()
    this.cursors.draw(cur.kind === 'result' ? draws : [])
  }

  /** Body diagram per player: shoulders, head, the live hand and the recorded trail. */
  private draw(_now: number, step: Step, progress: number): void {
    const g = this.gfx
    g.clear()
    const players = this.services.players()
    players.forEach((p, i) => {
      const cx = this.centreX(i)
      const cy = H * 0.52
      const half = SCALE / 2
      const color = hex(p.color)
      // Head and shoulders.
      g.lineStyle(6, 0xffffff, 0.8)
      g.strokeCircle(cx, cy - SCALE * 0.75, SCALE * 0.28)
      g.lineBetween(cx - half, cy, cx + half, cy)
      g.lineBetween(cx, cy, cx, cy + SCALE * 1.4)
      // Recorded points (both hands are drawn on their own side).
      g.fillStyle(color, 0.5)
      const recorded = this.samples[i]
      const side = step.kind === 'result' ? 'right' : step.side
      for (const s of recorded.slice(-500)) {
        const sx = side === 'right' ? cx + half + s.out * SCALE : cx - half - s.out * SCALE
        g.fillCircle(sx, cy + s.down * SCALE, 3)
      }
      if (step.kind !== 'result') {
        const r = this.services.handRelative(i, step.side)
        if (r) {
          const sign = step.side === 'right' ? 1 : -1
          g.fillStyle(0xffffff, 1)
          g.fillCircle(cx + sign * (half + r.out * SCALE), cy + r.down * SCALE, 12)
        }
        // Time bar.
        g.fillStyle(0xffffff, 0.15)
        g.fillRect(cx - 200, H - 40, 400, 8)
        g.fillStyle(step.kind === 'intro' ? 0x36d1ff : 0xffb02e, 1)
        g.fillRect(cx - 200, H - 40, 400 * Math.min(1, progress), 8)
      }
    })
  }

  private async finish(): Promise<void> {
    const players = this.services.players()
    this.title.setText('Reach setup')
    this.detail.setText('Working out your reach...')
    const lines: string[] = []
    for (const [i, p] of players.entries()) {
      const zone = fitReach(this.samples[i])
      if (!zone) {
        lines.push(
          `${p.name}: not enough movement seen (${this.samples[i].length}/${MIN_SAMPLES * 2}) - try again`
        )
        continue
      }
      const ok = await this.services.saveReach(i, zone)
      lines.push(
        ok
          ? `${p.name}: saved - reach ${(zone.inward + zone.outward).toFixed(1)} x ${(zone.up + zone.down).toFixed(1)} shoulder widths`
          : `${p.name}: could not save`
      )
    }
    console.info(`[reach] ${lines.join(' | ')}`)
    this.detail.setText(
      lines.join('\n') + '\n\nYour cursor now uses your reach. Try it on the buttons below.'
    )
    this.buttons.set([
      { id: 'again', label: 'Try again', x: 0.24, y: 0.78, w: 0.22, h: 0.12 },
      { id: 'done', label: 'Done', x: 0.54, y: 0.78, w: 0.22, h: 0.12 }
    ])
  }
}
