import Phaser from 'phaser'
import type { Vec2 } from '../../input/types'
import { playerInView } from '../balloonPop/logic'
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
  AVATAR,
  BEAM_BAND,
  BEAM_WARNING_MS,
  FIELD,
  GROUND_Y,
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

/**
 * Meteor Dodge: lean to move, crouch to duck under laser beams, dodge
 * meteors, catch stars. Rules live in MeteorDodgeLogic; this scene draws.
 */
export class MeteorDodgeScene extends Phaser.Scene {
  private readonly logic = new MeteorDodgeLogic()
  private players: Player[] = []
  private avatars: Phaser.GameObjects.Container[] = []
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
    this.drawBackground()
    this.fx = this.add.graphics().setDepth(15)
    this.avatars = this.players.map((p) => {
      const body = this.add.image(0, 0, `avatar-${p.slot}`).setOrigin(0.5, 1)
      const label = this.add
        .text(0, -AVATAR.standing - 14, this.versus ? p.name : '', {
          fontFamily: FONT,
          fontSize: '22px',
          fontStyle: 'bold',
          color: p.color
        })
        .setOrigin(0.5, 1)
        .setStroke('#0b1020', 5)
      return this.add.container(0, GROUND_Y, [body, label]).setDepth(20)
    })
    const style = { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffffff' }
    this.hud = this.players.map((p, i) =>
      this.add
        .text(i === 0 ? 28 : W - 150, 20, '', {
          ...style,
          color: this.versus ? p.color : '#ffffff'
        })
        .setOrigin(i === 0 ? 0 : 1, 0)
        .setDepth(30)
        .setStroke('#0b1020', 6)
    )
    this.timeText = this.add
      .text(W / 2, 20, '', style)
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
    const inputs: PlayerInput[] = this.players.map((_, i) => {
      const s = this.services.input.snapshot(i)
      return { lean: s?.lean ?? 0, crouching: s?.crouching ?? false }
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
          color: this.versus ? hex(p.color) : HAND_COLORS[side]
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
      this.cameras.main.shake(220, 0.012)
      this.cameras.main.flash(160, 255, 60, 60)
      this.floatText(
        p.x,
        GROUND_Y - AVATAR.standing - 40,
        e.by === 'beam' ? 'Duck!' : 'Ouch!',
        '#ff6b6b'
      )
    } else if (e.type === 'star') {
      this.sfx.chime()
      this.floatText(e.x, e.y, '+50', this.versus ? this.players[e.player].color : '#ffe14d')
    } else if (e.type === 'out') {
      console.info(`[game] player ${e.player + 1} out`)
      this.floatText(p.x, GROUND_Y - AVATAR.standing - 60, 'OUT', '#ff6b6b', 56)
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
        text(
          'LEAN left and right to move.  CROUCH to duck under laser beams.\nDodge the meteors, catch the stars - you have 3 lives.',
          0.38,
          28
        )
        buttons = [btn('start', 'Start', 0.38, 0.7), btn('quit', 'Quit', 0.62, 0.7)]
        break
      case 'paused':
        dim()
        text('Paused', 0.26, 80, '#ffffff', true)
        text(
          L.pauseReason === 'out-of-view' ? 'Step back into view to continue.' : 'Take a breather.',
          0.42,
          30
        )
        buttons = [
          btn('resume', 'Resume', 0.25, 0.6),
          btn('restart', 'Restart', 0.5, 0.6),
          btn('menu', 'Menu', 0.75, 0.6)
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
        buttons = [btn('again', 'Play again', 0.38, 0.8), btn('menu', 'Menu', 0.62, 0.8)]
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
      if (saved.some((s) => !s)) return text('Score could not be saved', 0.42, 26)
      const bests = this.players.flatMap((p, i) => (saved[i]!.isPersonalBest ? [p.name] : []))
      if (bests.length) text(`New personal best: ${bests.join(' & ')}!`, 0.42, 32, '#ffe14d')
      const top = saved[saved.length - 1]!.top
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
      if (!s?.tracked) return `${who}step into view`
      if (s.calibration.status === 'calibrated') return `${who}ready - try leaning and crouching!`
      return `${who}stand still to calibrate (${Math.round(s.calibration.progress * 100)}%)`
    })
    this.calibText.setText(lines.join('\n'))
  }

  // ---- Drawing ----------------------------------------------------------------------

  private syncObjects(now: number): void {
    const L = this.logic
    // Avatars: squash when crouching, blink while invulnerable, fade when out.
    L.players.forEach((p, i) => {
      const a = this.avatars[i]
      a.setX(p.x)
      const body = a.list[0] as Phaser.GameObjects.Image
      body.setScale(1, p.crouching ? AVATAR.crouched / AVATAR.standing : 1)
      ;(a.list[1] as Phaser.GameObjects.Text).setY(
        -(p.crouching ? AVATAR.crouched : AVATAR.standing) - 14
      )
      const blinking = now < p.invulnerableUntil && Math.floor(now / 100) % 2 === 0
      a.setAlpha(!p.alive ? 0.25 : blinking ? 0.35 : 1)
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
      g.lineStyle(m.r * 1.2, 0xff8a3d, 0.25)
      g.lineBetween(m.x, m.y - m.r * 3, m.x, m.y)
      g.lineStyle(m.r * 0.6, 0xffd36b, 0.4)
      g.lineBetween(m.x, m.y - m.r * 2, m.x, m.y)
    }
    for (const b of L.beams) {
      const warming = now - b.warnedAt < BEAM_WARNING_MS
      if (warming) {
        // Flashing warning stripe across the whole field at head height.
        if (Math.floor(now / 150) % 2 === 0) {
          g.fillStyle(0xff3b3b, 0.25)
          g.fillRect(0, BEAM_BAND.top, W, BEAM_BAND.bottom - BEAM_BAND.top)
        }
        continue
      }
      const [l, r] = b.dir === 1 ? [b.x - b.length, b.x] : [b.x, b.x + b.length]
      g.fillStyle(0xff3b3b, 0.35)
      g.fillRect(l, BEAM_BAND.top - 8, r - l, BEAM_BAND.bottom - BEAM_BAND.top + 16)
      g.fillStyle(0xffffff, 0.95)
      g.fillRect(l, BEAM_BAND.top + 10, r - l, BEAM_BAND.bottom - BEAM_BAND.top - 20)
    }
  }

  private updateHud(): void {
    const L = this.logic
    const inGame = L.phase === 'playing' || L.phase === 'countdown' || L.phase === 'paused'
    L.players.forEach((p, i) => {
      const hearts = '♥'.repeat(Math.max(0, p.lives)) + '♡'.repeat(Math.max(0, LIVES - p.lives))
      const name = this.versus ? `${this.players[i].name} ` : ''
      this.hud[i]?.setText(inGame ? `${name}${Math.round(p.score)}  ${hearts}` : '')
    })
    this.timeText.setText(inGame ? `${(L.elapsed / 1000).toFixed(0)}s` : '')
  }

  private makeTextures(): void {
    for (const p of this.players) {
      const key = `avatar-${p.slot}`
      if (this.textures.exists(key)) continue
      const g = this.make.graphics({}, false)
      const w = AVATAR.width
      const h = AVATAR.standing
      g.fillStyle(hex(p.color), 1)
      g.fillRoundedRect(0, 0, w, h, 30)
      g.fillStyle(0xffffff, 1)
      g.fillCircle(w * 0.32, 38, 10)
      g.fillCircle(w * 0.68, 38, 10)
      g.fillStyle(0x0b1020, 1)
      g.fillCircle(w * 0.34, 40, 5)
      g.fillCircle(w * 0.7, 40, 5)
      g.lineStyle(4, 0xffffff, 0.6)
      g.strokeRoundedRect(2, 2, w - 4, h - 4, 28)
      g.generateTexture(key, w, h)
      g.destroy()
    }
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

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(0)
    g.fillGradientStyle(0x050816, 0x050816, 0x1b2a5a, 0x1b2a5a, 1, 1, 1, 1)
    g.fillRect(0, 0, W, H)
    g.fillStyle(0xffffff, 0.8)
    for (let i = 0; i < 90; i++)
      g.fillCircle(Math.random() * W, Math.random() * GROUND_Y, Math.random() * 1.8)
    g.fillStyle(0x2c3b2f, 1)
    g.fillRect(0, GROUND_Y, W, H - GROUND_Y)
    g.fillStyle(0x3d5240, 1)
    g.fillRect(0, GROUND_Y, W, 8)
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
