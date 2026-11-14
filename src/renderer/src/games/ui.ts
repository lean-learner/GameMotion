import Phaser from 'phaser'
import { DwellSelector } from '../input/dwell'
import type { HandCursor, Vec2 } from '../input/types'

/** Console-style palette: near-black surfaces, flat grey tiles, green accents. */
export const THEME = {
  bgTop: 0x0c0c0c,
  bgBottom: 0x1c1c1c,
  tile: 0x2b2b2b,
  tileHover: 0x3a3a3a,
  green: 0x107c10,
  greenBright: 0x5dc21e,
  text: '#ffffff',
  textDim: '#b8b8b8',
  ink: '#0a0a0a'
}

/** Every scene is laid out on this many game pixels. */
export const DESIGN = { width: 1280, height: 720 }

/**
 * Makes a scene fill the whole window at the screen's own resolution. The game
 * must use Phaser.Scale.RESIZE. The 1280x720 layout is scaled up and centred
 * by the camera, text is re-rendered sharp at the new size, and whatever the
 * scene draws outside the layout (e.g. themeBackdrop) covers the rest.
 */
export function fillScreen(scene: Phaser.Scene): void {
  let textResolution = 1
  const fit = (): void => {
    const { width, height } = scene.scale
    const zoom = Math.min(width / DESIGN.width, height / DESIGN.height)
    scene.cameras.main.setZoom(zoom).centerOn(DESIGN.width / 2, DESIGN.height / 2)
    // Half steps, so dragging the window edge doesn't redraw every text every frame.
    textResolution = Math.max(1, Math.ceil(zoom * window.devicePixelRatio * 2) / 2)
  }
  const sharpen = (): void => {
    for (const child of scene.children.list) {
      if (child instanceof Phaser.GameObjects.Text && child.style.resolution !== textResolution) {
        child.setResolution(textResolution)
      }
    }
  }
  fit()
  scene.scale.on('resize', fit)
  scene.events.on('preupdate', sharpen)
  scene.events.once('shutdown', () => scene.scale.off('resize', fit))
}

/** The theme's background, drawn far past the layout so it fills any window shape. */
export function themeBackdrop(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const far = 6000
  const { width: W, height: H } = DESIGN
  const bg = scene.add.graphics()
  bg.fillStyle(THEME.bgTop, 1)
  bg.fillRect(-far, -far, W + 2 * far, far)
  bg.fillStyle(THEME.bgBottom, 1)
  bg.fillRect(-far, H, W + 2 * far, far)
  bg.fillGradientStyle(THEME.bgTop, THEME.bgTop, THEME.bgBottom, THEME.bgBottom, 1, 1, 1, 1)
  bg.fillRect(-far, 0, W + 2 * far, H)
  return bg
}

/** A button in 0..1 screen space. */
export interface Button {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  /** Fill colour (defaults to the theme's tile grey). */
  color?: number
  /** Draw as selected (e.g. the active player). */
  selected?: boolean
  /** Smaller second line, e.g. a best score. */
  sub?: string
  /** Hold time for this button, if different from the others. */
  dwellMs?: number
  /** Only a closed fist presses this button (see DwellTarget.fistOnly). */
  fistOnly?: boolean
  /** Tiles only: picture drawn behind the caption, inside the given pixel rectangle. */
  art?: (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) => void
  /** Tiles only: a coloured badge (e.g. a player's colour) before the label. */
  avatar?: number
}

export const FONT = 'system-ui, "Ubuntu", sans-serif'

/**
 * Buttons pressed by holding a hand cursor on them until their timer fills (a
 * closed fist fills it faster), or by a mouse click.
 * Draws itself; call update() every frame. With `tile: true` they are drawn as
 * flat console tiles that grow when hovered or focused.
 */
export class DwellButtons {
  /** Button highlighted by keyboard or gamepad navigation (tiles). */
  focus: string | null = null
  private buttons: Button[] = []
  private readonly dwell: DwellSelector
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly labels = new Map<string, Phaser.GameObjects.Text>()
  private readonly subs = new Map<string, Phaser.GameObjects.Text>()
  private clicked: string | null = null
  private readonly alpha: number
  private readonly depth: number
  private readonly fontSize: number
  private readonly tile: boolean

  constructor(
    private readonly scene: Phaser.Scene,
    opts: {
      dwellMs?: number
      depth?: number
      alpha?: number
      fontSize?: number
      tile?: boolean
    } = {}
  ) {
    this.dwell = new DwellSelector([], opts.dwellMs ?? 1000)
    this.alpha = opts.alpha ?? 0.92
    this.depth = opts.depth ?? 55
    this.fontSize = opts.fontSize ?? 34
    this.tile = opts.tile ?? false
    this.gfx = scene.add.graphics().setDepth(this.depth)
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      // World coordinates, so clicks still land when the camera is zoomed (fillScreen).
      const x = p.worldX / DESIGN.width
      const y = p.worldY / DESIGN.height
      const hit = this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
      if (hit) this.clicked = hit.id
    })
  }

  get all(): readonly Button[] {
    return this.buttons
  }

  set(buttons: Button[]): void {
    this.buttons = buttons
    this.dwell.targets = buttons
    this.clicked = null
    if (this.focus && !buttons.some((b) => b.id === this.focus)) this.focus = null
  }

  /** Presses a button as a click would (keyboard / gamepad). */
  press(id: string): void {
    if (this.buttons.some((b) => b.id === id)) this.clicked = id
  }

  /** @returns the id of the button pressed this frame, if any. */
  update(now: number, hands: (HandCursor | null)[]): string | null {
    const state = this.dwell.update(hands, now)
    const g = this.gfx
    const { width: W, height: H } = DESIGN
    g.clear()
    for (const t of this.labels.values()) t.setVisible(false)
    for (const t of this.subs.values()) t.setVisible(false)
    for (const b of this.buttons) {
      const progress = state.hover?.id === b.id ? state.hover.progress : 0
      const x = b.x * W
      const y = b.y * H
      const w = b.w * W
      const h = b.h * H
      if (this.tile) {
        this.drawTile(b, x, y, w, h, state.hover?.id === b.id, progress)
        continue
      }
      const hovered = state.hover?.id === b.id
      g.fillStyle(b.color ?? (hovered ? THEME.tileHover : 0x1f1f1f), this.alpha)
      g.fillRoundedRect(x, y, w, h, 12)
      if (progress > 0) {
        g.fillStyle(THEME.green, 0.85)
        g.fillRoundedRect(x, y, Math.max(36, w * progress), h, 12)
      }
      g.lineStyle(
        b.selected ? 9 : hovered ? 6 : 4,
        0xffffff,
        b.selected || hovered ? 1 : this.alpha
      )
      g.strokeRoundedRect(x, y, w, h, 12)
      const cy = b.sub ? y + h * 0.4 : y + h / 2
      this.text(this.labels, b.id, b.label, x + w / 2, cy, this.fontSize)
      if (b.sub) this.text(this.subs, b.id, b.sub, x + w / 2, y + h * 0.72, this.fontSize * 0.6)
    }
    const pressed = this.clicked ?? state.selected
    this.clicked = null
    return pressed
  }

  /** A flat tile: grows and gets a white frame when hovered or focused; green when selected. */
  private drawTile(
    b: Button,
    x0: number,
    y0: number,
    w0: number,
    h0: number,
    hovered: boolean,
    progress: number
  ): void {
    const g = this.gfx
    const active = hovered || this.focus === b.id
    const grow = active ? 1.05 : 1
    const w = w0 * grow
    const h = h0 * grow
    const x = x0 - (w - w0) / 2
    const y = y0 - (h - h0) / 2
    const r = Math.min(18, h * 0.22)
    const pad = Math.min(18, h * 0.16)
    let labelX = x + pad
    if (b.art) {
      // Pictures are drawn square, then the corners are rounded off below.
      b.art(g, x, y, w, h)
      const strip = Math.max(58, h * 0.3)
      g.fillStyle(0x000000, 0.62)
      g.fillRect(x, y + h - strip, w, strip)
      const sy = y + h - strip
      this.text(this.labels, b.id, b.label, labelX, sy + strip * (b.sub ? 0.34 : 0.5), 26, 0)
      if (b.sub) this.text(this.subs, b.id, b.sub, labelX, sy + strip * 0.74, 17, 0, THEME.textDim)
      if (progress > 0) {
        g.fillStyle(0xffffff, 0.14)
        g.fillRect(x, y, w * progress, h)
        g.fillStyle(THEME.greenBright, 1)
        g.fillRect(x, y + h - 8, w * progress, 8)
      }
      this.roundCorners(x, y, w, h, r)
    } else {
      g.fillStyle(
        b.selected ? THEME.green : (b.color ?? (active ? THEME.tileHover : THEME.tile)),
        1
      )
      g.fillRoundedRect(x, y, w, h, r)
      if (b.avatar !== undefined) {
        const ar = Math.min(h * 0.26, 26)
        g.fillStyle(b.avatar, 1)
        g.fillCircle(labelX + ar, y + h / 2, ar)
        g.lineStyle(3, 0xffffff, 0.9)
        g.strokeCircle(labelX + ar, y + h / 2, ar)
        labelX += ar * 2 + 12
      }
      const size = Math.min(this.fontSize, h * 0.34)
      this.text(this.labels, b.id, b.label, labelX, y + h * (b.sub ? 0.38 : 0.5), size, 0)
      if (b.sub) {
        this.text(this.subs, b.id, b.sub, labelX, y + h * 0.72, size * 0.62, 0, THEME.textDim)
      }
      if (progress > 0) {
        g.fillStyle(THEME.greenBright, 0.45)
        g.fillRoundedRect(x, y, Math.max(r * 2, w * progress), h, r)
      }
    }
    if (b.selected) {
      // Tick in the top-right corner.
      const cx = x + w - 24
      const cy = y + 22
      g.lineStyle(4, 0xffffff, 1)
      g.lineBetween(cx - 8, cy, cx - 2, cy + 6)
      g.lineBetween(cx - 2, cy + 6, cx + 9, cy - 7)
    }
    if (active) {
      g.lineStyle(4, 0xffffff, 1)
      g.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, r + 4)
    }
  }

  /**
   * Rounds a square-drawn tile by painting its corners in the background colour
   * (the theme's vertical gradient). Gradient fills can't be drawn rounded directly.
   */
  private roundCorners(x: number, y: number, w: number, h: number, r: number): void {
    const g = this.gfx
    const H = DESIGN.height
    const channel = (c: number, shift: number): number => (c >> shift) & 0xff
    const background = (py: number): number => {
      const k = Math.min(1, Math.max(0, py / H))
      const mix = (shift: number): number =>
        Math.round(
          channel(THEME.bgTop, shift) +
            (channel(THEME.bgBottom, shift) - channel(THEME.bgTop, shift)) * k
        ) << shift
      return mix(16) | mix(8) | mix(0)
    }
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1]
    ]) {
      // (kx, ky) is the tile corner; the arc's centre sits r inside it.
      const kx = sx > 0 ? x : x + w
      const ky = sy > 0 ? y : y + h
      const pts = [new Phaser.Math.Vector2(kx - sx, ky - sy)]
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2)
        pts.push(
          new Phaser.Math.Vector2(kx + sx * (r - r * Math.sin(a)), ky + sy * (r - r * Math.cos(a)))
        )
      }
      // Close the shape just outside the tile so no edge pixels show through.
      pts[1].y -= sy
      pts[pts.length - 1].x -= sx
      g.fillStyle(background(ky), 1)
      g.fillPoints(pts, true)
    }
  }

  private text(
    cache: Map<string, Phaser.GameObjects.Text>,
    id: string,
    str: string,
    x: number,
    y: number,
    size: number,
    originX = 0.5,
    color = THEME.text
  ): void {
    let t = cache.get(id)
    if (!t) {
      t = this.scene.add
        .text(0, 0, str, { fontFamily: FONT, fontStyle: 'bold' })
        .setDepth(this.depth + 1)
      if (!this.tile) t.setStroke(THEME.ink, 5)
      cache.set(id, t)
    }
    t.setText(str)
      .setFontSize(size)
      .setColor(color)
      .setOrigin(originX, 0.5)
      .setPosition(x, y)
      .setVisible(true)
  }
}

/** One cursor to draw. */
export interface CursorDraw {
  pos: Vec2 | null
  color: number
  /** Moving fast enough to act (e.g. pop): drawn brighter and bolder. */
  armed?: boolean
  /**
   * Draw the hand as a blade instead of a ring: `pos` is its striking point,
   * `angle` the way the hand points and `length` how long to draw it.
   */
  blade?: { angle: number; length: number }
  /** The hand is closed (grabbing): drawn as a smaller, solid dot. */
  fist?: boolean
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
      if (c.blade) {
        this.drawBlade(c.pos, c.blade.angle, c.blade.length, c.color, !!c.armed)
        continue
      }
      if (c.fist) {
        g.fillStyle(c.color, 0.95)
        g.fillCircle(x, y, this.radius * 0.6)
        g.lineStyle(5, 0xffffff, 1)
        g.strokeCircle(x, y, this.radius * 0.6)
        continue
      }
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

  /** A leaf-shaped blade: two thirds behind the striking point, one third ahead of it. */
  private drawBlade(pos: Vec2, angle: number, length: number, color: number, armed: boolean): void {
    const g = this.gfx
    const ux = Math.cos(angle)
    const uy = Math.sin(angle)
    const tail = { x: pos.x - ux * length * 0.66, y: pos.y - uy * length * 0.66 }
    const leaf = (halfWidth: number): Phaser.Math.Vector2[] => {
      const pts: Phaser.Math.Vector2[] = []
      const steps = 10
      for (let i = 0; i <= steps * 2; i++) {
        const k = i <= steps ? i / steps : 2 - i / steps // 0..1 out, then back
        const side = i <= steps ? 1 : -1
        const w = halfWidth * Math.sin(Math.PI * Math.pow(k, 0.8))
        pts.push(
          new Phaser.Math.Vector2(
            tail.x + ux * length * k - uy * w * side,
            tail.y + uy * length * k + ux * w * side
          )
        )
      }
      return pts
    }
    const half = this.radius * 0.42
    if (armed) {
      g.fillStyle(color, 0.25)
      g.fillPoints(leaf(half * 2.1), true) // glow
    }
    g.fillStyle(color, armed ? 0.85 : 0.45)
    g.fillPoints(leaf(half), true)
    g.lineStyle(armed ? 5 : 3, 0xffffff, armed ? 1 : 0.7)
    g.strokePoints(leaf(half), true)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(pos.x, pos.y, armed ? 7 : 5)
  }
}

/** Parses "#rrggbb" to a Phaser colour number. */
export const hex = (color: string): number => parseInt(color.replace('#', ''), 16)

/** How long a blade trail point stays visible. */
const TRAIL_MS = 170

/**
 * Glowing blade trails behind hand cursors: a tapering ribbon along each
 * hand's recent path, brighter when the hand is fast enough to slice.
 * Drawn every rendered frame, so trails are smooth even on a 30 fps camera.
 */
export class TrailLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly trails = new Map<string, { x: number; y: number; t: number }[]>()

  constructor(scene: Phaser.Scene, depth = 95) {
    this.gfx = scene.add.graphics().setDepth(depth)
  }

  /** @param hands one entry per hand: a stable key, position (null = gone), colour, armed. */
  draw(
    now: number,
    hands: { key: string; pos: Vec2 | null; color: number; armed: boolean }[]
  ): void {
    const g = this.gfx
    g.clear()
    for (const h of hands) {
      const trail = this.trails.get(h.key) ?? []
      if (h.pos) trail.push({ x: h.pos.x, y: h.pos.y, t: now })
      while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift()
      if (!h.pos && trail.length === 0) {
        this.trails.delete(h.key)
        continue
      }
      this.trails.set(h.key, trail)
      if (trail.length < 2) continue
      const maxW = h.armed ? 26 : 10
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1]
        const b = trail[i]
        const k = i / (trail.length - 1) // 0 at the tail, 1 at the hand
        const w = Math.max(1, maxW * k)
        // Coloured glow, then a white blade core on top.
        g.lineStyle(w * 1.8, h.color, (h.armed ? 0.35 : 0.15) * k)
        g.lineBetween(a.x, a.y, b.x, b.y)
        g.lineStyle(w * 0.6, 0xffffff, (h.armed ? 0.95 : 0.4) * k)
        g.lineBetween(a.x, a.y, b.x, b.y)
      }
    }
  }
}
