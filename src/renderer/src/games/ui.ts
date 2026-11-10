import Phaser from 'phaser'
import { DwellSelector } from '../input/dwell'
import type { Vec2 } from '../input/types'

/** A button in 0..1 screen space. */
export interface Button {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  /** Fill colour (defaults to dark blue). */
  color?: number
  /** Draw as selected (e.g. the active player). */
  selected?: boolean
  /** Smaller second line, e.g. a best score. */
  sub?: string
}

export const FONT = 'system-ui, "Ubuntu", sans-serif'

/**
 * Buttons pressed by holding a hand cursor on them (dwell) or by a mouse click.
 * Draws itself; call update() every frame.
 */
export class DwellButtons {
  private buttons: Button[] = []
  private readonly dwell: DwellSelector
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly labels = new Map<string, Phaser.GameObjects.Text>()
  private readonly subs = new Map<string, Phaser.GameObjects.Text>()
  private clicked: string | null = null
  private readonly alpha: number
  private readonly depth: number
  private readonly fontSize: number

  constructor(
    private readonly scene: Phaser.Scene,
    opts: { dwellMs?: number; depth?: number; alpha?: number; fontSize?: number } = {}
  ) {
    this.dwell = new DwellSelector([], opts.dwellMs ?? 1000)
    this.alpha = opts.alpha ?? 0.92
    this.depth = opts.depth ?? 55
    this.fontSize = opts.fontSize ?? 34
    this.gfx = scene.add.graphics().setDepth(this.depth)
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const { width: W, height: H } = scene.scale
      const hit = this.buttons.find(
        (b) => p.x >= b.x * W && p.x <= (b.x + b.w) * W && p.y >= b.y * H && p.y <= (b.y + b.h) * H
      )
      if (hit) this.clicked = hit.id
    })
  }

  set(buttons: Button[]): void {
    this.buttons = buttons
    this.dwell.targets = buttons
    this.clicked = null
  }

  /** @returns the id of the button pressed this frame, if any. */
  update(now: number, hands: (Vec2 | null)[]): string | null {
    const state = this.dwell.update(hands, now)
    const g = this.gfx
    const { width: W, height: H } = this.scene.scale
    g.clear()
    for (const t of this.labels.values()) t.setVisible(false)
    for (const t of this.subs.values()) t.setVisible(false)
    for (const b of this.buttons) {
      const progress = state.hover?.id === b.id ? state.hover.progress : 0
      const x = b.x * W
      const y = b.y * H
      const w = b.w * W
      const h = b.h * H
      g.fillStyle(b.color ?? 0x1d3557, this.alpha)
      g.fillRoundedRect(x, y, w, h, 18)
      if (progress > 0) {
        g.fillStyle(0xffffff, 0.35)
        g.fillRoundedRect(x, y, Math.max(36, w * progress), h, 18)
      }
      g.lineStyle(b.selected ? 9 : 4, 0xffffff, b.selected ? 1 : this.alpha)
      g.strokeRoundedRect(x, y, w, h, 18)
      const cy = b.sub ? y + h * 0.4 : y + h / 2
      this.text(this.labels, b.id, b.label, x + w / 2, cy, this.fontSize)
      if (b.sub) this.text(this.subs, b.id, b.sub, x + w / 2, y + h * 0.72, this.fontSize * 0.6)
    }
    const pressed = this.clicked ?? state.selected
    this.clicked = null
    return pressed
  }

  private text(
    cache: Map<string, Phaser.GameObjects.Text>,
    id: string,
    str: string,
    x: number,
    y: number,
    size: number
  ): void {
    let t = cache.get(id)
    if (!t) {
      t = this.scene.add
        .text(0, 0, str, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          fontStyle: 'bold',
          color: '#ffffff'
        })
        .setOrigin(0.5)
        .setDepth(this.depth + 1)
        .setStroke('#0b1d33', 5)
      cache.set(id, t)
    }
    t.setText(str).setPosition(x, y).setVisible(true)
  }
}

/** One cursor to draw. */
export interface CursorDraw {
  pos: Vec2 | null
  color: number
  /** Moving fast enough to act (e.g. pop): drawn brighter and bolder. */
  armed?: boolean
}

/** Default colours by hand in single-player mode. */
export const HAND_COLORS = { left: 0xffb02e, right: 0x7cff6b }

/** Hand cursors drawn on top of everything. */
export class CursorLayer {
  private readonly gfx: Phaser.GameObjects.Graphics

  constructor(
    scene: Phaser.Scene,
    private readonly radius: number
  ) {
    this.gfx = scene.add.graphics().setDepth(100)
  }

  draw(cursors: CursorDraw[]): void {
    const g = this.gfx
    g.clear()
    for (const c of cursors) {
      if (!c.pos) continue
      const { x, y } = c.pos
      if (c.armed) {
        g.fillStyle(c.color, 0.18)
        g.fillCircle(x, y, this.radius * 1.35) // glow
      }
      g.fillStyle(c.color, c.armed ? 0.5 : 0.22)
      g.fillCircle(x, y, this.radius)
      g.lineStyle(c.armed ? 8 : 4, c.armed ? 0xffffff : c.color, 1)
      g.strokeCircle(x, y, this.radius)
      g.fillStyle(0xffffff, 1)
      g.fillCircle(x, y, 6)
    }
  }
}

/** Parses "#rrggbb" to a Phaser colour number. */
export const hex = (color: string): number => parseInt(color.replace('#', ''), 16)
