import Phaser from 'phaser'
import { DESIGN, fillScreen, FONT } from './ui'

const W = DESIGN.width
const H = DESIGN.height

/** How a game dresses the window around the camera view. */
export interface StageTheme {
  /** Gradient of the surround, top to bottom. */
  top: number
  bottom: number
  /** Frame and highlight colour. */
  accent: number
  /** Small picture repeated over the surround, drawn around (x, y) at scale s. */
  motif: (g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, index: number) => void
}

/** How much the camera picture is darkened, so game objects and text stand out. */
const DIM = 0.42
/** Side panels narrower than this (game pixels) carry no text. */
const MIN_PANEL = 150

/**
 * The stage for games played over the camera view. The platform shows the
 * mirrored camera picture in the 16:9 game frame behind a transparent canvas;
 * this dims it, frames it, and decorates whatever is left of the window
 * around it, so the game fits any screen: side panels on a wide screen, bands
 * above and below on a tall one, nothing on a 16:9 TV.
 *
 * Use with Phaser.Scale.RESIZE and `transparent: true`.
 */
export class CameraStage {
  private readonly decor: Phaser.GameObjects.Graphics
  private readonly frame: Phaser.GameObjects.Graphics
  private readonly glow: Phaser.GameObjects.Rectangle
  private readonly title: Phaser.GameObjects.Text
  private readonly info: Phaser.GameObjects.Text
  private infoText = ''

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly theme: StageTheme,
    titleText: string
  ) {
    fillScreen(scene)
    scene.add.rectangle(0, 0, W, H, 0x000000, DIM).setOrigin(0).setDepth(0)
    this.glow = scene.add.rectangle(0, 0, W, H, 0xffffff, 1).setOrigin(0).setDepth(1).setAlpha(0)
    this.decor = scene.add.graphics().setDepth(40)
    this.frame = scene.add.graphics().setDepth(41)
    const style = { fontFamily: FONT, fontStyle: 'bold', color: '#ffffff', align: 'center' }
    this.title = scene.add
      .text(0, 0, titleText, { ...style, fontSize: '40px' })
      .setOrigin(0.5)
      .setDepth(42)
    this.info = scene.add
      .text(0, 0, '', { ...style, fontSize: '24px', lineSpacing: 8 })
      .setOrigin(0.5, 0)
      .setDepth(42)
    this.layout()
    scene.scale.on('resize', this.layout, this)
    scene.events.once('shutdown', () => scene.scale.off('resize', this.layout, this))
  }

  /** Lines shown in the right-hand panel when there is room (e.g. top scores). */
  setInfo(lines: string[]): void {
    this.infoText = lines.join('\n')
    this.layout()
  }

  /** A quick wash of colour over the camera view: feedback for a hit, a miss, a bomb. */
  pulse(color: number, strength = 0.28, ms = 260): void {
    this.glow.setFillStyle(color, 1).setAlpha(strength)
    this.scene.tweens.killTweensOf(this.glow)
    this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: ms, ease: 'quad.out' })
  }

  private layout(): void {
    const { width, height } = this.scene.scale
    const zoom = Math.min(width / W, height / H)
    // The part of the game world the window shows (the frame is 0..W by 0..H).
    const left = W / 2 - width / zoom / 2
    const right = W / 2 + width / zoom / 2
    const top = H / 2 - height / zoom / 2
    const bottom = H / 2 + height / zoom / 2
    const g = this.decor
    const t = this.theme
    g.clear()
    const band = (x: number, y: number, w: number, h: number): void => {
      if (w <= 0.5 || h <= 0.5) return
      // Shade each band by where it sits between the top and bottom of the window.
      const mix = (py: number): number => {
        const k = Phaser.Math.Clamp((py - top) / (bottom - top), 0, 1)
        const ch = (shift: number): number =>
          Math.round(
            ((t.top >> shift) & 0xff) +
              (((t.bottom >> shift) & 0xff) - ((t.top >> shift) & 0xff)) * k
          ) << shift
        return ch(16) | ch(8) | ch(0)
      }
      g.fillGradientStyle(mix(y), mix(y), mix(y + h), mix(y + h), 1, 1, 1, 1)
      g.fillRect(x, y, w, h)
    }
    band(left - 2, top - 2, -left + 2, bottom - top + 4) // left panel
    band(W, top - 2, right - W + 2, bottom - top + 4) // right panel
    band(0, top - 2, W, -top + 2) // above
    band(0, H, W, bottom - H + 2) // below

    // Motifs on a loose grid, wherever the surround is wide enough to hold them.
    const step = 150
    let index = 0
    for (let y = Math.floor(top / step) * step + step / 2; y < bottom; y += step) {
      for (let x = Math.floor(left / step) * step + step / 2; x < right; x += step) {
        index++
        const jx = ((index * 37) % 50) - 25
        const jy = ((index * 53) % 50) - 25
        const px = x + jx
        const py = y + jy
        const margin = 58
        const outside = px < -margin || px > W + margin || py < -margin || py > H + margin
        const visible = px > left + 30 && px < right - 30 && py > top + 30 && py < bottom - 30
        if (outside && visible) t.motif(g, px, py, 0.7 + ((index * 17) % 5) / 10, index)
      }
    }

    // The frame around the camera view.
    const f = this.frame
    f.clear()
    for (let i = 3; i >= 1; i--) {
      f.lineStyle(6 + i * 8, t.accent, 0.07)
      f.strokeRect(0, 0, W, H)
    }
    f.lineStyle(6, t.accent, 1)
    f.strokeRect(-3, -3, W + 6, H + 6)
    f.lineStyle(2, 0xffffff, 0.7)
    f.strokeRect(0, 0, W, H)

    // Words in the side panels, when they are wide enough.
    const panel = -left
    const roomy = panel >= MIN_PANEL
    this.title
      .setVisible(roomy)
      .setPosition(left / 2, H * 0.14)
      .setWordWrapWidth(Math.max(60, panel - 30))
      .setFontSize(Math.min(40, panel * 0.2))
    this.info
      .setVisible(roomy && this.infoText.length > 0)
      .setText(this.infoText)
      .setPosition(W + (right - W) / 2, H * 0.1)
      .setFontSize(Math.min(24, panel * 0.12))
  }
}

/** A dark rounded plate behind HUD text, so it reads over any camera picture. */
export function hudPlate(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  accent?: number
): void {
  g.fillStyle(0x000000, 0.55)
  g.fillRoundedRect(x, y, w, h, h / 2)
  if (accent !== undefined) {
    g.lineStyle(3, accent, 0.9)
    g.strokeRoundedRect(x, y, w, h, h / 2)
  }
}

/**
 * Where a player can comfortably reach in the game frame, in game pixels,
 * from where their body is in the camera view. `scale` compares their size in
 * the picture with a typical one, for sizing things and speeds to match.
 */
export interface ReachArea {
  x0: number
  x1: number
  top: number
  bottom: number
  scale: number
}

/** Shoulder width (game pixels) of a player at a typical distance. */
export const TYPICAL_SHOULDERS = 190

export function reachArea(body: { x: number; y: number; shoulderWidth: number }): ReachArea {
  const sw = body.shoulderWidth * W
  const cx = body.x * W
  const sy = body.y * H
  const half = 2.1 * sw // half a shoulder plus most of an arm
  const pad = 50
  const x0 = Phaser.Math.Clamp(cx - half, pad, W - pad - 200)
  const x1 = Phaser.Math.Clamp(cx + half, x0 + 200, W - pad)
  const top = Phaser.Math.Clamp(sy - 1.5 * sw, 50, H - 300)
  const bottom = Phaser.Math.Clamp(sy + 0.9 * sw, top + 200, H - 40)
  return { x0, x1, top, bottom, scale: Phaser.Math.Clamp(sw / TYPICAL_SHOULDERS, 0.6, 1.5) }
}
