import Phaser from 'phaser'
import type { Vec2 } from '../../input/types'
import { playerInView } from '../balloonPop/logic'
import { CameraStage, hudPlate, type StageTheme } from '../cameraStage'
import type { Sfx } from '../sfx'
import type { GameServices, Player } from '../types'
import {
  CursorLayer,
  DwellButtons,
  FONT,
  HAND_COLORS,
  hex,
  type Button,
  type CursorDraw
} from '../ui'
import {
  BEAM_WARNING_MS,
  FIELD,
  LIVES,
  MeteorDodgeLogic,
  type GameEvent,
  type Phase,
  type PlayerInput
} from './logic'

const W = FIELD.width
const H = FIELD.height
const OUT_OF_VIEW_MS = 1000
const PAUSE_BUTTON: Button = { id: 'pause', label: 'II', x: 0.905, y: 0.03, w: 0.08, h: 0.11 }
const tableId = (players: number): string => (players > 1 ? 'meteor-dodge-2p' : 'meteor-dodge')
/** Body size from the shoulders, in shoulder widths: half the width, and shoulders to top of head. */
const BODY_HALF = 0.75
const HEAD_ABOVE = 0.95
/** Laser thickness, as a share of the body's half width. */
const BEAM_THICKNESS = 0.45

/** The surround: deep space with stars and the odd planet. */
const SPACE: StageTheme = {
  top: 0x050816,
  bottom: 0x1b2a5a,
  accent: 0x6bd0ff,
  motif: (g, x, y, s, index) => {
    if (index % 4 === 0) {
      const r = 24 * s
      g.fillStyle([0xff8a3d, 0x9b7bff, 0x4dd6a8][index % 3], 0.5)
      g.fillCircle(x, y, r)
      g.lineStyle(3, 0xffffff, 0.25)
      g.strokeEllipse(x, y, r * 3, r * 0.8)
      return
    }
    g.fillStyle(0xffffff, 0.75)
    g.fillCircle(x, y, 2.5 * s)
    g.fillCircle(x + 46 * s, y - 30 * s, 1.6 * s)
    g.fillCircle(x - 38 * s, y + 34 * s, 1.8 * s)
    g.fillStyle(0xffe14d, 0.6)
    g.fillCircle(x - 20 * s, y - 44 * s, 2 * s)
  }
}

/**
 * Meteor Dodge, played over the camera view: your own body is the target.
 * Step aside to dodge meteors, duck under laser beams, touch stars.
 * Rules live in MeteorDodgeLogic; this scene draws.
 */
export class MeteorDodgeScene extends Phaser.Scene {
  private readonly logic = new MeteorDodgeLogic()
  private players: Player[] = []
  private stage!: CameraStage
  private shields!: Phaser.GameObjects.Graphics
  private hudPlates!: Phaser.GameObjects.Graphics
  private labels: Phaser.GameObjects.Text[] = []
  /** Top of each player's head while standing: lasers are drawn at this height. */
  private standTop: number[] = []
  private shownScores: number[] = []
  private readonly meteorSprites = new Map<number, Phaser.GameObjects.Image>()
  private readonly starSprites = new Map<number, Phaser.GameObjects.Image>()
  private fx!: Phaser.GameObjects.Graphics
  private hud: Phaser.GameObjects.Text[] = []
  private timeText!: Phaser.GameObjects.Text
  private bigText!: Phaser.GameObjects.Text
  private overlay!: Phaser.GameObjects.Container
  private calibText!: Phaser.GameObjects.Text
  private menu!: DwellButtons
  private pauseButton!: DwellButtons
  private cursorLayer!: CursorLayer
  private shownPhase: Phase | null = null
  private outOfViewSince: number | null = null
  private lastCountdown = 0
  private round = 0

  constructor(
    private readonly services: GameServices,
    private readonly sfx: Sfx,
    private readonly autostart = false
  ) {
    super('meteor-dodge')
  }

  private get versus(): boolean {
    return this.players.length > 1
  }

  create(): void {
    this.players = this.services.players()
    this.logic.prepare(this.players.length)
    this.makeTextures()
    this.stage = new CameraStage(this, SPACE, this.versus ? 'Meteor Dodge Versus' : 'Meteor Dodge')
    this.fx = this.add.graphics().setDepth(15)
    this.shields = this.add.graphics().setDepth(12)
    this.hudPlates = this.add.graphics().setDepth(29)
    this.labels = this.players.map((p) =>
      this.add
        .text(0, 0, this.versus ? p.name : '', {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: p.color
        })
        .setOrigin(0.5, 1)
        .setDepth(20)
        .setStroke('#0b1020', 5)
    )
    const style = { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffffff' }
    this.hud = this.players.map((p, i) =>
      this.add
        .text(i === 0 ? 46 : W - 176, 26, '', {
          ...style,
          color: this.versus ? p.color : '#ffffff'
        })
        .setOrigin(i === 0 ? 0 : 1, 0)
        .setDepth(30)
        .setStroke('#0b1020', 6)
    )
    this.timeText = this.add
      .text(W / 2, 26, '', style)
      .setOrigin(0.5, 0)
      .setDepth(30)
      .setStroke('#0b1020', 6)
    this.bigText = this.add
      .text(W / 2, H / 2, '', {
        fontFamily: FONT,
        fontSize: '150px',
        fontStyle: 'bold',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setStroke('#0b1020', 12)
    this.overlay = this.add.container(0, 0).setDepth(50)
    this.calibText = this.add
      .text(W / 2, H * 0.6, '', {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#cfe8ff',
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(52)
    this.menu = new DwellButtons(this, { dwellMs: 1000, depth: 55 })
    this.pauseButton = new DwellButtons(this, { dwellMs: 1500, depth: 55, alpha: 0.45 })
    this.cursorLayer = new CursorLayer(this, 32)
    if (this.autostart) this.logic.start(performance.now(), this.players.length)
  }

  update(): void {
    const now = performance.now()
    // Each player's body where it appears in the picture (null while they aren't seen).
    const inputs: (PlayerInput | null)[] = this.players.map((_, i) => {
      const body = this.services.input.body(i)
      if (!body) return null
      const sw = body.shoulderWidth * W
      return {
        x: body.x * W,
        top: body.y * H - HEAD_ABOVE * sw,
        half: BODY_HALF * sw,
        crouching: this.services.input.snapshot(i)?.crouching ?? false
      }
    })
    this.autoPause(now)
    for (const e of this.logic.update(now, inputs)) this.onEvent(e)
    this.countdownBeeps(now)
    if (this.logic.phase !== this.shownPhase) this.showPhase(this.logic.phase)

    this.syncObjects(now)
    this.updateHud()
    this.updateCalibrationHint()

    // Hands work the menus (and the pause button); during play they're free.
    const hands: (Vec2 | null)[] = []
    const draws: CursorDraw[] = []
    this.players.forEach((p, i) => {
      const c = this.services.input.cursors(now, i)
      hands.push(c.left, c.right)
      for (const side of ['left', 'right'] as const) {
        const pos = c[side]
        draws.push({
          pos: pos && { x: pos.x * W, y: pos.y * H },
          color: this.versus ? hex(p.color) : HAND_COLORS[side],
          fist: pos?.fist
        })
      }
    })
    const pressed = this.menu.update(now, hands) ?? this.pauseButton.update(now, hands)
    if (pressed) this.act(pressed)
    this.cursorLayer.draw(this.logic.phase === 'playing' ? [] : draws)
  }

  // ---- Flow ---------------------------------------------------------------------

  private autoPause(now: number): void {
    const active = this.logic.phase === 'playing' || this.logic.phase === 'countdown'
    const inView = this.players.every((_, i) => playerInView(this.services.input.snapshot(i)))
    if (!active || inView) {
      this.outOfViewSince = null
      return
    }
    this.outOfViewSince ??= now
    if (now - this.outOfViewSince >= OUT_OF_VIEW_MS) this.logic.pause(now, 'out-of-view')
  }

  private countdownBeeps(now: number): void {
    const n = this.logic.countdown(now)
    if (n !== this.lastCountdown) {
      if (n > 0) this.sfx.beep()
      else if (this.lastCountdown > 0 && this.logic.phase === 'playing') this.sfx.beep(true)
      this.lastCountdown = n
    }
    this.bigText.setText(n > 0 ? String(n) : '')
  }

  private act(id: string): void {
    const now = performance.now()
    switch (id) {
      case 'start':
      case 'again':
      case 'restart':
        this.round++
        this.logic.start(now, this.players.length)
        break
      case 'resume':
        this.logic.resume(now)
        break
      case 'pause':
        this.logic.pause(now, 'player')
        break
      case 'menu':
        this.logic.toMenu(now)
        break
      case 'quit':
        this.services.exit()
        break
    }
  }

  private onEvent(e: GameEvent): void {
    const p = this.logic.players[e.player]
    if (e.type === 'hit') {
      console.info(`[game] player ${e.player + 1} hit by ${e.by}, ${e.livesLeft} lives left`)
      this.sfx.thud()
      this.stage.pulse(0xff3b3b, 0.4, 420)
      this.floatText(p.x, Math.max(120, p.top - 30), e.by === 'beam' ? 'Duck!' : 'Ouch!', '#ff6b6b')
    } else if (e.type === 'star') {
      this.sfx.chime()
      this.stage.pulse(0xffe14d, 0.16)
      this.floatText(e.x, e.y, '+50', this.versus ? this.players[e.player].color : '#ffe14d')
    } else if (e.type === 'out') {
      console.info(`[game] player ${e.player + 1} out`)
      this.floatText(p.x, Math.max(130, p.top - 50), 'OUT', '#ff6b6b', 56)
    }
  }

  private floatText(x: number, y: number, str: string, color: string, size = 36): void {
    const t = this.add
      .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setDepth(40)
      .setStroke('#0b1020', 6)
    this.tweens.add({
      targets: t,
      y: y - 80,
      alpha: 0,
      duration: 900,
      onComplete: () => t.destroy()
    })
  }

  private showPhase(phase: Phase): void {
    this.shownPhase = phase
    const L = this.logic
    console.info(
      `[game] phase ${phase} scores=${L.players.map((p) => Math.round(p.score)).join('/')}`
    )
    this.overlay.removeAll(true)
    const text = (str: string, y: number, size: number, color = '#ffffff', bold = false): void => {
      this.overlay.add(
        this.add
          .text(W / 2, H * y, str, {
            fontFamily: FONT,
            fontSize: `${size}px`,
            fontStyle: bold ? 'bold' : 'normal',
            color,
            align: 'center'
          })
          .setOrigin(0.5)
          .setStroke('#0b1020', bold ? 10 : 6)
      )
    }
    const dim = (): void => {
      this.overlay.add(this.add.rectangle(0, 0, W, H, 0x050816, 0.6).setOrigin(0))
    }
    const btn = (id: string, label: string, x: number, y: number, w = 0.22, h = 0.12): Button => ({
      id,
      label,
      x: x - w / 2,
      y,
      w,
      h
    })
    const names = this.players.map((p) => p.name)
    let buttons: Button[] = []
    switch (phase) {
      case 'menu':
        dim()
        text(this.versus ? 'Meteor Dodge Versus' : 'Meteor Dodge', 0.2, 80, '#ffffff', true)
        text('Step aside to dodge  ·  Duck under the lasers', 0.37, 34)
        text(`Touch stars for points  ·  ${LIVES} lives`, 0.45, 26)
        buttons = [btn('start', 'Start', 0.38, 0.7), btn('quit', 'Back', 0.62, 0.7)]
        text('Point and hold to choose  ·  a fist is faster', 0.9, 22, '#b8b8b8')
        break
      case 'paused':
        dim()
        text('Paused', 0.26, 80, '#ffffff', true)
        text(
          L.pauseReason === 'out-of-view' ? 'Step back into view' : 'Ready when you are',
          0.42,
          30
        )
        buttons = [
          btn('resume', 'Resume', 0.25, 0.6),
          btn('restart', 'Restart', 0.5, 0.6),
          btn('quit', 'Home', 0.75, 0.6)
        ]
        break
      case 'gameover': {
        dim()
        this.sfx.fanfare()
        const w = L.winner()
        text(
          this.versus ? (w === null ? "It's a draw!" : `${names[w]} wins!`) : 'Game over',
          0.18,
          80,
          this.versus && w !== null ? this.players[w].color : '#ffffff',
          true
        )
        text(
          L.players
            .map((p, i) => `${names[i]}: ${p.score} points (${(p.survivedMs / 1000).toFixed(0)} s)`)
            .join('     '),
          0.32,
          34
        )
        this.saveScores(text)
        buttons = [btn('again', 'Play again', 0.38, 0.8), btn('quit', 'Home', 0.62, 0.8)]
        break
      }
    }
    this.menu.set(buttons)
    this.pauseButton.set(phase === 'playing' ? [PAUSE_BUTTON] : [])
  }

  private saveScores(text: (str: string, y: number, size: number, color?: string) => void): void {
    const round = this.round
    void Promise.all(
      this.players.map((_, i) =>
        this.services.saveScore(tableId(this.players.length), this.logic.players[i].score, i)
      )
    ).then((saved) => {
      if (round !== this.round || this.logic.phase !== 'gameover') return
      if (saved.some((s) => !s)) return text("Couldn't save the score", 0.42, 26)
      const bests = this.players.flatMap((p, i) => (saved[i]!.isPersonalBest ? [p.name] : []))
      if (bests.length)
        text(this.versus ? `New best: ${bests.join(' & ')}!` : 'New best!', 0.42, 32, '#ffe14d')
      const top = saved[saved.length - 1]!.top
      this.stage.setInfo([
        'Top scores',
        ...top.slice(0, 5).map((r, i) => `${i + 1}.  ${r.name}   ${r.score}`)
      ])
      text(
        ['Top scores', ...top.slice(0, 3).map((r, i) => `${i + 1}.  ${r.name}   ${r.score}`)].join(
          '\n'
        ),
        0.6,
        24
      )
    })
  }

  /** Crouching needs calibration, so the menu says when each player is ready. */
  private updateCalibrationHint(): void {
    if (this.logic.phase !== 'menu') {
      this.calibText.setText('')
      return
    }
    const lines = this.players.map((p, i) => {
      const s = this.services.input.snapshot(i)
      const who = this.versus ? `${p.name}: ` : ''
      if (!s?.tracked) return `${who}Step into view`
      if (s.calibration.status === 'calibrated') return `${who}Ready  ·  try a step and a duck`
      return `${who}Stand still a moment… ${Math.round(s.calibration.progress * 100)}%`
    })
    this.calibText.setText(lines.join('\n'))
  }

  // ---- Drawing ----------------------------------------------------------------------

  private syncObjects(now: number): void {
    const L = this.logic
    // A soft outline around each player shows what counts as "you".
    const sg = this.shields
    sg.clear()
    L.players.forEach((p, i) => {
      if (!p.crouching || this.standTop[i] === undefined) {
        const was = this.standTop[i] ?? p.top
        this.standTop[i] = was + (p.top - was) * 0.1
      }
      const color = this.versus ? hex(this.players[i].color) : 0x6bd0ff
      const blinking = now < p.invulnerableUntil && Math.floor(now / 100) % 2 === 0
      const alpha = !p.alive ? 0.12 : blinking ? 0.15 : 0.7
      sg.lineStyle(10, color, alpha * 0.25)
      sg.strokeRoundedRect(p.x - p.half, p.top, p.half * 2, H - p.top + 60, p.half * 0.8)
      sg.lineStyle(3, color, alpha)
      sg.strokeRoundedRect(p.x - p.half, p.top, p.half * 2, H - p.top + 60, p.half * 0.8)
      this.labels[i].setPosition(p.x, Math.max(40, p.top - 10)).setAlpha(p.alive ? 1 : 0.3)
    })

    // Meteors and stars.
    syncSprites(this, this.meteorSprites, L.meteors, 'meteor', (s, m) => {
      s.setPosition(m.x, m.y)
        .setScale(m.r / 40)
        .setRotation(s.rotation + 0.05)
    })
    syncSprites(this, this.starSprites, L.stars, 'star', (s, st) => {
      s.setPosition(st.x, st.y).setRotation(now / 400)
    })

    // Meteor tails and laser beams.
    const g = this.fx
    g.clear()
    for (const m of L.meteors) {
      if (m.y + m.r < 0) {
        // Still above the frame: mark where it will come down.
        const blink = 0.45 + 0.4 * Math.sin(now / 70)
        g.fillStyle(0xff8a3d, blink)
        g.fillTriangle(m.x - 20, 12, m.x + 20, 12, m.x, 42)
        g.fillStyle(0xff8a3d, 0.1)
        g.fillRect(m.x - m.r, 0, m.r * 2, H)
        continue
      }
      g.lineStyle(m.r * 1.2, 0xff8a3d, 0.25)
      g.lineBetween(m.x, m.y - m.r * 3, m.x, m.y)
      g.lineStyle(m.r * 0.6, 0xffd36b, 0.4)
      g.lineBetween(m.x, m.y - m.r * 2, m.x, m.y)
    }
    // Lasers sweep at standing head height (the average, with two players).
    const n = Math.max(1, L.players.length)
    const headTop = L.players.reduce((sum, p, i) => sum + (this.standTop[i] ?? p.top), 0) / n
    const thick = Math.max(26, (L.players.reduce((sum, p) => sum + p.half, 0) / n) * BEAM_THICKNESS)
    const y0 = Math.max(60, headTop)
    for (const b of L.beams) {
      const warming = now - b.warnedAt < BEAM_WARNING_MS
      if (warming) {
        // Flashing warning stripe across the whole frame at head height.
        if (Math.floor(now / 150) % 2 === 0) {
          g.fillStyle(0xff3b3b, 0.3)
          g.fillRect(0, y0, W, thick)
        }
        continue
      }
      const [l, r] = b.dir === 1 ? [b.x - b.length, b.x] : [b.x, b.x + b.length]
      g.fillStyle(0xff3b3b, 0.4)
      g.fillRect(l, y0 - 8, r - l, thick + 16)
      g.fillStyle(0xffffff, 0.95)
      g.fillRect(l, y0 + thick * 0.3, r - l, thick * 0.4)
    }
  }

  private updateHud(): void {
    const L = this.logic
    const inGame = L.phase === 'playing' || L.phase === 'countdown' || L.phase === 'paused'
    const g = this.hudPlates
    g.clear()
    L.players.forEach((p, i) => {
      const t = this.hud[i]
      if (!t) return
      const hearts = '♥'.repeat(Math.max(0, p.lives)) + '♡'.repeat(Math.max(0, LIVES - p.lives))
      const name = this.versus ? `${this.players[i].name} ` : ''
      const score = Math.round(p.score)
      t.setText(inGame ? `${name}${score}  ${hearts}` : '')
      if (!inGame) return
      // A dark plate behind each score, edged in the player's colour.
      const w = t.width + 44
      hudPlate(
        g,
        i === 0 ? 24 : W - 154 - w,
        14,
        w,
        60,
        this.versus ? hex(this.players[i].color) : 0x6bd0ff
      )
      // The number jumps when a star is caught (not on every survival point).
      if (this.shownScores[i] !== undefined && score - this.shownScores[i] >= 20) {
        this.tweens.killTweensOf(t)
        t.setScale(1.25)
        this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'back.out' })
      }
      this.shownScores[i] = score
    })
    this.timeText.setText(inGame ? `${(L.elapsed / 1000).toFixed(0)}s` : '')
    if (inGame) hudPlate(g, W / 2 - this.timeText.width / 2 - 24, 14, this.timeText.width + 48, 60)
  }

  private makeTextures(): void {
    if (!this.textures.exists('meteor')) {
      const g = this.make.graphics({}, false)
      g.fillStyle(0x7a5c48, 1)
      g.fillCircle(40, 40, 40)
      g.fillStyle(0x5a4234, 1)
      g.fillCircle(26, 30, 10)
      g.fillCircle(52, 50, 13)
      g.fillCircle(46, 22, 6)
      g.generateTexture('meteor', 80, 80)
      g.destroy()
    }
    if (!this.textures.exists('star')) {
      const g = this.make.graphics({}, false)
      const pts: Phaser.Math.Vector2[] = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 26 : 11
        const a = (Math.PI / 5) * i - Math.PI / 2
        pts.push(new Phaser.Math.Vector2(28 + r * Math.cos(a), 28 + r * Math.sin(a)))
      }
      g.fillStyle(0xffe14d, 1)
      g.fillPoints(pts, true)
      g.generateTexture('star', 56, 56)
      g.destroy()
    }
  }
}

/** Keeps one sprite per object id in sync with the logic's list. */
function syncSprites<T extends { id: number }>(
  scene: Phaser.Scene,
  sprites: Map<number, Phaser.GameObjects.Image>,
  objects: T[],
  texture: string,
  place: (s: Phaser.GameObjects.Image, o: T) => void
): void {
  const alive = new Set<number>()
  for (const o of objects) {
    alive.add(o.id)
    let s = sprites.get(o.id)
    if (!s) {
      s = scene.add.image(0, 0, texture).setDepth(18)
      sprites.set(o.id, s)
    }
    place(s, o)
  }
  for (const [id, s] of sprites) {
    if (!alive.has(id)) {
      s.destroy()
      sprites.delete(id)
    }
  }
}
