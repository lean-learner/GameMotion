import Phaser from 'phaser'
import type { Vec2 } from '../input/types'
import { CameraStage, hudPlate, type StageTheme } from './cameraStage'
import type { BodyInput } from './poses'
import { leader, type Phase, type RoundFlow } from './roundFlow'
import type { Sfx } from './sfx'
import type { GameServices, Player } from './types'
import {
  CursorLayer,
  DESIGN,
  DwellButtons,
  FONT,
  HAND_COLORS,
  hex,
  type Button,
  type CursorDraw
} from './ui'

export const W = DESIGN.width
export const H = DESIGN.height
const OUT_OF_VIEW_MS = 1000
const PAUSE_BUTTON: Button = { id: 'pause', label: 'II', x: 0.905, y: 0.03, w: 0.08, h: 0.11 }
const INK = '#0b1020'

/** What makes one camera game different from another on the shared screens. */
export interface GameInfo {
  /** Also the name of its score table (two players use `<id>-2p`). */
  id: string
  title: string
  /** Title with two players, if it differs. */
  duoTitle?: string
  theme: StageTheme
  /** How to play: the first line is shown large on the menu, the rest smaller. */
  help: string[]
  /** Two players share one score and win or lose together. */
  team?: boolean
  /** The game uses ducking, which needs each player to stand still once first. */
  usesDuck?: boolean
}

/**
 * The parts every camera game shares: the stage around the camera view, the
 * menu, countdown, pause and game-over screens, the score plates, saving
 * scores, and pausing when a player walks out of view.
 *
 * A game extends this, keeps its rules in a plain logic class that owns a
 * RoundFlow, and fills in: build (make its objects), begin (start a round),
 * step (feed the rules this frame), draw, and scores.
 */
export abstract class CameraGameScene extends Phaser.Scene {
  protected players: Player[] = []
  protected stage!: CameraStage
  private hudPlates!: Phaser.GameObjects.Graphics
  private hud: Phaser.GameObjects.Text[] = []
  private centreText!: Phaser.GameObjects.Text
  private bigText!: Phaser.GameObjects.Text
  private overlay!: Phaser.GameObjects.Container
  private hintText!: Phaser.GameObjects.Text
  private menu!: DwellButtons
  private pauseButton!: DwellButtons
  private cursorLayer!: CursorLayer
  private shownPhase: Phase | null = null
  private outOfViewSince: number | null = null
  private lastCountdown = 0
  private round = 0

  constructor(
    protected readonly services: GameServices,
    protected readonly sfx: Sfx,
    private readonly autostart: boolean,
    protected readonly info: GameInfo
  ) {
    super(info.id)
  }

  // ---- What each game provides -----------------------------------------------------

  /** The round flow owned by the game's rules. */
  protected abstract get flow(): RoundFlow
  /** Make the game's own objects. Called once, after the stage exists. */
  protected abstract build(): void
  /** Start a new round. */
  protected abstract begin(now: number): void
  /** Feed this frame's input to the rules and react to what happened. */
  protected abstract step(now: number): void
  /** Draw the current state. */
  protected abstract draw(now: number): void
  /** Each player's score (the team's score for each, in a team game). */
  protected abstract scores(): number[]
  /** Text for a player's score plate while playing ('' for none). */
  protected abstract hudLine(player: number): string

  /** Text for the middle plate while playing, e.g. the time left ('' for none). */
  protected centreLine(): string {
    return ''
  }

  /** The line under the headline on the game-over screen. */
  protected resultLine(): string {
    const scores = this.scores()
    if (this.info.team || !this.duo) return `${scores[0] ?? 0} points`
    return this.players.map((p, i) => `${p.name}: ${scores[i]} points`).join('     ')
  }

  // ---- Helpers for games ----------------------------------------------------------

  /** Two people are playing. */
  protected get duo(): boolean {
    return this.players.length > 1
  }

  protected get title(): string {
    return this.duo ? (this.info.duoTitle ?? this.info.title) : this.info.title
  }

  /** A player's colour: their own with two players, the game's accent with one. */
  protected colorOf(player: number): number {
    return this.duo ? hex(this.players[player].color) : this.info.theme.accent
  }

  protected cssColorOf(player: number): string {
    return this.duo ? this.players[player].color : '#ffffff'
  }

  /** Where a player's shoulders and hands are in the frame, in game pixels (null if not seen). */
  protected bodyInput(player: number, now: number): BodyInput | null {
    const body = this.services.input.body(player)
    if (!body) return null
    const hands = this.services.input.hands(now, player)
    const px = (p: Vec2 | null): Vec2 | null => p && { x: p.x * W, y: p.y * H }
    return {
      x: body.x * W,
      y: body.y * H,
      sw: body.shoulderWidth * W,
      hands: { left: px(hands.left), right: px(hands.right) },
      crouching: this.services.input.snapshot(player)?.crouching ?? false
    }
  }

  /** A short message that floats up from a point and fades. */
  protected floatText(x: number, y: number, str: string, color = '#ffffff', size = 36): void {
    const t = this.add
      .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setDepth(40)
      .setStroke(INK, 6)
    this.tweens.add({
      targets: t,
      y: y - 80,
      alpha: 0,
      duration: 900,
      onComplete: () => t.destroy()
    })
  }

  /** Bold outlined text, the look used for everything drawn over the camera view. */
  protected label(size: number, color = '#ffffff'): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
        align: 'center'
      })
      .setOrigin(0.5)
      .setStroke(INK, Math.max(5, Math.round(size / 7)))
  }

  // ---- Phaser ----------------------------------------------------------------------

  create(): void {
    this.players = this.services.players()
    this.stage = new CameraStage(this, this.info.theme, this.title)
    this.hudPlates = this.add.graphics().setDepth(29)
    this.hud = this.players.map((_, i) =>
      this.label(30, this.cssColorOf(i))
        .setPosition(i === 0 ? 46 : W - 176, 26)
        .setOrigin(i === 0 ? 0 : 1, 0)
        .setDepth(30)
    )
    this.centreText = this.label(30)
      .setPosition(W / 2, 26)
      .setOrigin(0.5, 0)
      .setDepth(30)
    this.bigText = this.label(150)
      .setPosition(W / 2, H / 2)
      .setDepth(60)
    this.overlay = this.add.container(0, 0).setDepth(50)
    this.hintText = this.add
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
    this.build()
    if (this.autostart) this.begin(performance.now())
  }

  update(): void {
    const now = performance.now()
    this.autoPause(now)
    this.step(now)
    this.countdownBeeps(now)
    if (this.flow.phase !== this.shownPhase) this.showPhase(this.flow.phase)
    this.draw(now)
    this.updateHud()
    this.updateHint()

    // Hands work the menus and the pause button; during play they belong to the game.
    const hands: (Vec2 | null)[] = []
    const draws: CursorDraw[] = []
    this.players.forEach((p, i) => {
      const c = this.services.input.cursors(now, i)
      hands.push(c.left, c.right)
      for (const side of ['left', 'right'] as const) {
        const pos = c[side]
        draws.push({
          pos: pos && { x: pos.x * W, y: pos.y * H },
          color: this.duo ? hex(p.color) : HAND_COLORS[side],
          fist: pos?.fist
        })
      }
    })
    const pressed = this.menu.update(now, hands) ?? this.pauseButton.update(now, hands)
    if (pressed) this.act(pressed)
    this.cursorLayer.draw(this.flow.phase === 'playing' ? [] : draws)
  }

  // ---- Flow ------------------------------------------------------------------------

  private autoPause(now: number): void {
    const active = this.flow.phase === 'playing' || this.flow.phase === 'countdown'
    // A player the tracker has never reported counts as in view (e.g. the self-test).
    const inView = this.players.every((_, i) => {
      const snap = this.services.input.snapshot(i)
      return !snap || snap.tracked
    })
    if (!active || inView) {
      this.outOfViewSince = null
      return
    }
    this.outOfViewSince ??= now
    if (now - this.outOfViewSince >= OUT_OF_VIEW_MS) this.flow.pause(now, 'out-of-view')
  }

  private countdownBeeps(now: number): void {
    const n = this.flow.countdown(now)
    if (n !== this.lastCountdown) {
      if (n > 0) this.sfx.beep()
      else if (this.lastCountdown > 0 && this.flow.phase === 'playing') this.sfx.beep(true)
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
        this.begin(now)
        break
      case 'resume':
        this.flow.resume(now)
        break
      case 'pause':
        this.flow.pause(now, 'player')
        break
      case 'quit':
        this.services.exit()
        break
    }
  }

  private showPhase(phase: Phase): void {
    this.shownPhase = phase
    console.info(`[game] phase ${phase} scores=${this.scores().join('/')}`)
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
          .setStroke(INK, bold ? 10 : 6)
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
    let buttons: Button[] = []
    switch (phase) {
      case 'menu': {
        dim()
        text(this.title, 0.2, 80, '#ffffff', true)
        const [first, ...rest] = this.info.help
        text(first, 0.37, 34)
        if (rest.length) text(rest.join('\n'), 0.47, 26)
        buttons = [btn('start', 'Start', 0.38, 0.7), btn('quit', 'Back', 0.62, 0.7)]
        text('Point and hold to choose  ·  a fist is faster', 0.9, 22, '#b8b8b8')
        break
      }
      case 'paused':
        dim()
        text('Paused', 0.26, 80, '#ffffff', true)
        text(
          this.flow.pauseReason === 'out-of-view' ? 'Step back into view' : 'Ready when you are',
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
        const w = this.info.team ? null : leader(this.scores())
        const versus = this.duo && !this.info.team
        const headline = !versus
          ? this.duo
            ? 'Nice teamwork!'
            : 'Game over'
          : w === null
            ? "It's a draw!"
            : `${this.players[w].name} wins!`
        text(headline, 0.18, 80, versus && w !== null ? this.players[w].color : '#ffffff', true)
        text(this.resultLine(), 0.32, 34)
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
    const table = this.duo ? `${this.info.id}-2p` : this.info.id
    const scores = this.scores()
    void Promise.all(
      this.players.map((_, i) => this.services.saveScore(table, scores[i] ?? 0, i))
    ).then((saved) => {
      if (round !== this.round || this.flow.phase !== 'gameover') return
      if (saved.some((s) => !s)) return text("Couldn't save the score", 0.42, 26)
      const bests = this.players.flatMap((p, i) => (saved[i]!.isPersonalBest ? [p.name] : []))
      if (bests.length)
        text(this.duo ? `New best: ${bests.join(' & ')}!` : 'New best!', 0.42, 32, '#ffe14d')
      const top = saved[saved.length - 1]!.top
      const rows = top.map((r, i) => `${i + 1}.  ${r.name}   ${r.score}`)
      this.stage.setInfo(['Top scores', ...rows.slice(0, 5)])
      text(['Top scores', ...rows.slice(0, 3)].join('\n'), 0.6, 24)
    })
  }

  /** On the menu, tells each player whether the camera is ready for them. */
  private updateHint(): void {
    if (this.flow.phase !== 'menu') {
      this.hintText.setText('')
      return
    }
    const lines = this.players.map((p, i) => {
      const s = this.services.input.snapshot(i)
      const who = this.duo ? `${p.name}: ` : ''
      if (!s?.tracked) return `${who}Step into view`
      if (!this.info.usesDuck || s.calibration.status === 'calibrated') return `${who}Ready`
      return `${who}Stand still a moment… ${Math.round(s.calibration.progress * 100)}%`
    })
    this.hintText.setText(lines.join('\n'))
  }

  private updateHud(): void {
    const phase = this.flow.phase
    const inGame = phase === 'playing' || phase === 'countdown' || phase === 'paused'
    const g = this.hudPlates
    g.clear()
    this.hud.forEach((t, i) => {
      const line = inGame ? this.hudLine(i) : ''
      t.setText(line)
      if (!line) return
      const w = t.width + 44
      hudPlate(g, i === 0 ? 24 : W - 154 - w, 14, w, 60, this.colorOf(i))
    })
    const centre = inGame ? this.centreLine() : ''
    this.centreText.setText(centre)
    if (centre)
      hudPlate(g, W / 2 - this.centreText.width / 2 - 24, 14, this.centreText.width + 48, 60)
  }
}

/** Hearts for lives left out of a total. */
export const hearts = (lives: number, of: number): string =>
  '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, of - lives))
