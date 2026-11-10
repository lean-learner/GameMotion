import Phaser from 'phaser'
import type { Vec2 } from '../../input/types'
import type { Sfx } from '../sfx'
import type { GameServices, Player } from '../types'
import {
  CursorLayer,
  DwellButtons,
  FONT,
  HAND_COLORS,
  hex,
  TrailLayer,
  type Button,
  type CursorDraw
} from '../ui'
import {
  BALLOON_COLORS,
  BalloonPopLogic,
  comboMultiplier,
  CURSOR_RADIUS,
  FIELD,
  playerInView,
  type BumpEvent,
  type HandInput,
  type Phase,
  type PopEvent,
  type SliceBonus
} from './logic'

const W = FIELD.width
const H = FIELD.height
const COLORS = [0xff4d6d, 0xffa53d, 0xffe14d, 0x4dd17a, 0x4da3ff, 0xb26bff]
const GOLD = 0xffd23f
/** Texture balloons are drawn at; sprites are scaled to each balloon's radius. */
const TEX_R = 60
/** The game pauses itself when a player has been out of view this long. */
const OUT_OF_VIEW_MS = 1000
/** The pause button needs a longer hold, so it isn't pressed by accident while popping. */
const PAUSE_BUTTON: Button = { id: 'pause', label: 'II', x: 0.905, y: 0.03, w: 0.08, h: 0.11 }
/** Score tables: versus rounds are kept apart from single-player ones. */
const tableId = (players: number): string => (players > 1 ? 'balloon-pop-2p' : 'balloon-pop')

/**
 * Balloon Pop rendering and effects. Rules live in BalloonPopLogic; this scene
 * draws them, plays sounds and turns hand cursors into pops and button presses.
 * One player, or two sharing the sky (versus).
 */
export class BalloonPopScene extends Phaser.Scene {
  private readonly logic = new BalloonPopLogic()
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>()
  private players: Player[] = []
  private menu!: DwellButtons
  private pauseButton!: DwellButtons
  private cursorLayer!: CursorLayer
  private trails!: TrailLayer
  /** Increments every round, so a late score-save result can't land on the wrong screen. */
  private round = 0
  private shownPhase: Phase | null = null
  private outOfViewSince: number | null = null
  private lastCountdown = 0

  private hud!: {
    scores: Phaser.GameObjects.Text[]
    time: Phaser.GameObjects.Text
    combo: Phaser.GameObjects.Text
  }
  private overlay!: Phaser.GameObjects.Container
  private bigText!: Phaser.GameObjects.Text
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter

  constructor(
    private readonly services: GameServices,
    private readonly sfx: Sfx,
    private readonly autostart = false
  ) {
    super('balloon-pop')
  }

  private get versus(): boolean {
    return this.players.length > 1
  }

  create(): void {
    this.players = this.services.players()
    this.logic.players = this.players.length
    this.makeTextures()
    this.drawBackground()

    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 420 },
      lifespan: 600,
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 500,
      emitting: false
    })
    this.sparks.setDepth(20)

    const hudStyle = { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff' }
    // One score per player: left player top-left, right player top-right (left of the pause button).
    const scores = this.players.map((p, i) =>
      this.add
        .text(i === 0 ? 28 : W - 150, 20, '', {
          ...hudStyle,
          color: this.versus ? p.color : '#ffffff'
        })
        .setOrigin(i === 0 ? 0 : 1, 0)
        .setDepth(30)
        .setStroke('#1d3557', 6)
    )
    this.hud = {
      scores,
      time: this.add
        .text(W / 2, 20, '', hudStyle)
        .setOrigin(0.5, 0)
        .setDepth(30)
        .setStroke('#1d3557', 6),
      combo: this.add
        .text(28, 64, '', { ...hudStyle, fontSize: '26px', color: '#ffe14d' })
        .setDepth(30)
        .setStroke('#1d3557', 5)
    }
    this.bigText = this.add
      .text(W / 2, H / 2, '', {
        fontFamily: FONT,
        fontSize: '160px',
        fontStyle: 'bold',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setStroke('#1d3557', 12)
    this.overlay = this.add.container(0, 0).setDepth(50)
    this.menu = new DwellButtons(this, { dwellMs: 1000, depth: 55 })
    this.pauseButton = new DwellButtons(this, { dwellMs: 1500, depth: 55, alpha: 0.45 })
    this.cursorLayer = new CursorLayer(this, CURSOR_RADIUS)
    this.trails = new TrailLayer(this)
    if (this.autostart) this.logic.start(performance.now(), this.players.length)
  }

  update(): void {
    const now = performance.now()
    const px = (v: Vec2 | null): Vec2 | null => (v ? { x: v.x * W, y: v.y * H } : null)
    const hands: HandInput[] = []
    const screenHands: (Vec2 | null)[] = []
    this.players.forEach((_, player) => {
      const c = this.services.input.cursors(now, player)
      hands.push(
        { player, hand: 'left', pos: px(c.left) },
        { player, hand: 'right', pos: px(c.right) }
      )
      screenHands.push(c.left, c.right)
    })

    this.autoPause(now)
    const { pops, bumps, bonuses, strokes } = this.logic.update(now, hands)
    if (strokes.length) this.sfx.swoosh()
    for (const pop of pops) this.popEffect(pop)
    for (const bump of bumps) this.bumpEffect(bump)
    for (const bonus of bonuses) this.bonusEffect(bonus)
    this.countdownBeeps(now)
    if (this.logic.phase !== this.shownPhase) this.showPhase(this.logic.phase)

    this.syncBalloons()
    this.updateHud(now)
    // Any player can press menu buttons.
    const pressed = this.menu.update(now, screenHands) ?? this.pauseButton.update(now, screenHands)
    if (pressed) this.act(pressed)
    const styles = hands.map((h) => this.cursorStyle(h, now))
    this.trails.draw(
      now,
      hands.map((h, i) => ({
        key: `${h.player}:${h.hand}`,
        pos: h.pos,
        color: styles[i].color,
        armed: !!styles[i].armed
      }))
    )
    this.cursorLayer.draw(styles)
  }

  private cursorStyle(h: HandInput, now: number): CursorDraw {
    const color = this.versus ? hex(this.players[h.player].color) : HAND_COLORS[h.hand]
    // "Armed" glow while playing: the hand is moving fast enough to pop.
    const armed = this.logic.phase === 'playing' && this.logic.isArmed(h.player, h.hand, now)
    return { pos: h.pos, color, armed }
  }

  // ---- Game flow ---------------------------------------------------------------

  private autoPause(now: number): void {
    const active = this.logic.phase === 'playing' || this.logic.phase === 'countdown'
    // In versus, pause if anyone leaves: it isn't fair to keep playing without them.
    const everyoneInView = this.players.every((_, i) =>
      playerInView(this.services.input.snapshot(i))
    )
    if (!active || everyoneInView) {
      this.outOfViewSince = null
      return
    }
    this.outOfViewSince ??= now
    if (now - this.outOfViewSince >= OUT_OF_VIEW_MS) {
      const why = this.players.map((_, i) => {
        const snap = this.services.input.snapshot(i)
        return snap
          ? `p${i + 1} tracked=${snap.tracked} age=${Math.round(now - snap.time)}ms`
          : `p${i + 1} no data`
      })
      console.info(`[game] auto-pause: ${why.join(', ')}`)
      this.logic.pause(now, 'out-of-view')
    }
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
        this.clearBalloons()
        this.logic.start(now, this.players.length)
        break
      case 'resume':
        this.logic.resume(now)
        break
      case 'pause':
        this.logic.pause(now, 'player')
        break
      case 'menu':
        this.clearBalloons()
        this.logic.toMenu(now)
        break
      case 'quit':
        this.services.exit()
        break
    }
  }

  private showPhase(phase: Phase): void {
    this.shownPhase = phase
    const L = this.logic
    console.info(
      `[game] phase ${phase} scores=${L.scores.join('/')} popped=${L.popped.join('/')}` +
        (phase === 'paused' ? ` reason=${L.pauseReason}` : '')
    )
    this.overlay.removeAll(true)
    const title = (str: string, y = 0.26, color = '#ffffff'): void => {
      this.overlay.add(
        this.add
          .text(W / 2, H * y, str, { fontFamily: FONT, fontSize: '84px', fontStyle: 'bold', color })
          .setOrigin(0.5)
          .setStroke('#1d3557', 10)
      )
    }
    const line = (str: string, y: number, size = 32, color = '#ffffff'): void => {
      this.overlay.add(
        this.add
          .text(W / 2, H * y, str, {
            fontFamily: FONT,
            fontSize: `${size}px`,
            color,
            align: 'center'
          })
          .setOrigin(0.5)
          .setStroke('#1d3557', 6)
      )
    }
    const dim = (): void => {
      this.overlay.add(this.add.rectangle(0, 0, W, H, 0x0b1d33, 0.55).setOrigin(0))
    }
    const btn = (id: string, label: string, x: number, y: number, w = 0.26, h = 0.13): Button => ({
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
        title(this.versus ? 'Balloon Pop Versus' : 'Balloon Pop')
        line(
          this.versus ? `${names[0]} (left)  vs  ${names[1]} (right)` : `Playing as ${names[0]}`,
          0.36,
          28
        )
        line(
          (this.versus
            ? 'Pop more balloons than your rival in 60 seconds.'
            : 'Pop as many balloons as you can in 60 seconds.') +
            '\nSwipe through a balloon to pop it - your cursor glows when you are fast enough.',
          0.45,
          28
        )
        line('Golden balloons are worth more, and quick pops build combos.', 0.56, 24)
        buttons = [btn('start', 'Start', 0.38, 0.66), btn('quit', 'Quit', 0.66, 0.66)]
        break
      case 'paused':
        dim()
        title('Paused')
        line(
          L.pauseReason === 'out-of-view'
            ? this.versus
              ? 'A player stepped out of view. Both players back in frame to continue.'
              : 'You stepped out of view. Come back into the frame to continue.'
            : 'Take a breather.',
          0.42
        )
        buttons = [
          btn('resume', 'Resume', 0.25, 0.6, 0.22),
          btn('restart', 'Restart', 0.5, 0.6, 0.22),
          btn('menu', 'Menu', 0.75, 0.6, 0.22)
        ]
        break
      case 'gameover': {
        dim()
        this.sfx.fanfare()
        if (this.versus) {
          const w = L.winner()
          title(
            w === null ? "It's a draw!" : `${names[w]} wins!`,
            0.17,
            w === null ? '#ffffff' : this.players[w].color
          )
          line(
            this.players
              .map((p, i) => `${p.name}: ${L.scores[i]} (${L.popped[i]} balloons)`)
              .join('     '),
            0.31,
            34
          )
        } else {
          title("Time's up!", 0.17)
          line(`${names[0]}: ${L.score} points  ·  ${L.popped[0]} balloons`, 0.31, 40)
        }
        this.saveScores(line)
        buttons = [btn('again', 'Play again', 0.38, 0.8), btn('menu', 'Menu', 0.66, 0.8)]
        break
      }
    }
    this.menu.set(buttons)
    this.pauseButton.set(phase === 'playing' ? [PAUSE_BUTTON] : [])
  }

  /** Saves every player's score, then shows personal bests and the top scores. */
  private saveScores(line: (str: string, y: number, size?: number, color?: string) => void): void {
    const round = this.round
    const status = this.add
      .text(W / 2, H * 0.4, 'Saving scores...', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setStroke('#1d3557', 6)
    this.overlay.add(status)
    const table = tableId(this.players.length)
    void Promise.all(
      this.players.map((_, i) => this.services.saveScore(table, this.logic.scores[i], i))
    ).then((saved) => {
      // Ignore the result if the players have already moved on.
      if (round !== this.round || this.logic.phase !== 'gameover' || !status.active) return
      if (saved.some((s) => !s)) {
        status.setText('Score could not be saved')
        return
      }
      const bests = this.players.flatMap((p, i) => (saved[i]!.isPersonalBest ? [p.name] : []))
      status.setText(
        bests.length
          ? `New personal best: ${bests.join(' & ')}!`
          : this.versus
            ? 'Scores saved'
            : `Your best: ${saved[0]!.personalBest}`
      )
      status.setColor(bests.length ? '#ffe14d' : '#ffffff').setFontSize(bests.length ? 34 : 28)
      // The last save has the most complete table.
      const top = saved[saved.length - 1]!.top
      line(this.versus ? 'Top versus scores' : 'Top scores', 0.49, 26)
      top
        .slice(0, 3)
        .forEach((row, i) => line(`${i + 1}.  ${row.name}   ${row.score}`, 0.56 + i * 0.065, 26))
    })
  }

  // ---- Balloons and effects ---------------------------------------------------------

  private syncBalloons(): void {
    const alive = new Set<number>()
    for (const b of this.logic.balloons) {
      alive.add(b.id)
      let s = this.sprites.get(b.id)
      if (!s) {
        s = this.add.image(b.x, b.y, b.kind === 'golden' ? 'balloon-gold' : `balloon-${b.color}`)
        // Anchor at the balloon body's centre (the texture also holds the string).
        s.setOrigin(0.5, 1.15 / 2.9)
          .setScale(b.r / TEX_R)
          .setDepth(10)
        this.sprites.set(b.id, s)
      }
      s.setPosition(b.x, b.y)
      if (!s.getData('bumping')) s.setAngle(Math.sin(b.y / 60 + b.wobblePhase) * 6)
    }
    for (const [id, s] of this.sprites) {
      if (!alive.has(id)) {
        s.destroy()
        this.sprites.delete(id)
      }
    }
  }

  private clearBalloons(): void {
    for (const s of this.sprites.values()) s.destroy()
    this.sprites.clear()
  }

  private popEffect(p: PopEvent): void {
    const b = p.balloon
    console.info(
      `[game] pop ${b.kind} by player ${p.player + 1} ${p.hand} hand +${p.points} (combo ${p.combo})`
    )
    const color = b.kind === 'golden' ? GOLD : COLORS[b.color]
    this.sparks.setParticleTint(color)
    this.sparks.explode(b.kind === 'golden' ? 34 : 20, b.x, b.y)
    if (b.kind === 'golden') this.sfx.chime()
    else this.sfx.pop(p.combo)
    this.sliceHalves(p)
    // In versus the points float up in the scorer's colour.
    const textColor = this.versus
      ? this.players[p.player].color
      : b.kind === 'golden'
        ? '#ffe14d'
        : '#ffffff'
    const label = this.add
      .text(b.x, b.y, `+${p.points}`, {
        fontFamily: FONT,
        fontSize: b.kind === 'golden' ? '46px' : '36px',
        fontStyle: 'bold',
        color: textColor
      })
      .setOrigin(0.5)
      .setDepth(25)
      .setStroke('#1d3557', 6)
    this.tweens.add({
      targets: label,
      y: b.y - 90,
      alpha: 0,
      duration: 800,
      ease: 'cubic.out',
      onComplete: () => label.destroy()
    })
  }

  /** The balloon splits along the swipe; the halves fly apart and fall. */
  private sliceHalves(p: PopEvent): void {
    const b = p.balloon
    const key = b.kind === 'golden' ? 'balloon-gold' : `balloon-${b.color}`
    const frame = this.textures.getFrame(key)
    const w = frame.width
    // The texture's cut line is vertical; turn it to lie along the swipe.
    const rot = p.angle - Math.PI / 2
    ;[-1, 1].forEach((side) => {
      const half = this.add
        .image(b.x, b.y, key)
        .setOrigin(0.5, 1.15 / 2.9)
        .setScale(b.r / TEX_R)
        .setRotation(rot)
        .setDepth(12)
        .setCrop(side < 0 ? 0 : w / 2, 0, w / 2, frame.height)
      // Each half moves away from the cut, then drops.
      const dx = side * Math.cos(rot) * 90
      const dy = side * Math.sin(rot) * 90
      this.tweens.add({
        targets: half,
        x: b.x + dx,
        rotation: rot + side * 0.9,
        alpha: 0,
        duration: 650,
        ease: 'cubic.out'
      })
      this.tweens.add({
        targets: half,
        y: b.y + dy + 140,
        duration: 650,
        ease: 'quad.in',
        onComplete: () => half.destroy()
      })
    })
  }

  /** Several balloons in one stroke: a big floating bonus label. */
  private bonusEffect(bonus: SliceBonus): void {
    this.sfx.bonus()
    console.info(`[game] slice bonus x${bonus.count} +${bonus.points} (player ${bonus.player + 1})`)
    const color = this.versus ? this.players[bonus.player].color : '#ffe14d'
    const label = this.add
      .text(bonus.x, bonus.y - 40, `${bonus.count}x slice!  +${bonus.points}`, {
        fontFamily: FONT,
        fontSize: '52px',
        fontStyle: 'bold',
        color
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setStroke('#1d3557', 8)
      .setScale(0.6)
    this.tweens.add({ targets: label, scale: 1.1, duration: 180, ease: 'back.out' })
    this.tweens.add({
      targets: label,
      y: bonus.y - 150,
      alpha: 0,
      delay: 500,
      duration: 700,
      onComplete: () => label.destroy()
    })
  }

  /** Touched too slowly to pop: a quick wobble teaches players to swipe. */
  private bumpEffect(bump: BumpEvent): void {
    const s = this.sprites.get(bump.balloon.id)
    if (!s || s.getData('bumping')) return
    s.setData('bumping', true)
    this.tweens.add({
      targets: s,
      angle: { from: -14, to: 14 },
      duration: 70,
      yoyo: true,
      repeat: 2,
      onComplete: () => s.active && s.setData('bumping', false)
    })
  }

  private updateHud(now: number): void {
    const L = this.logic
    const inGame = L.phase === 'playing' || L.phase === 'countdown' || L.phase === 'paused'
    this.hud.scores.forEach((t, i) =>
      t.setText(
        inGame
          ? this.versus
            ? `${this.players[i].name} ${L.scores[i]}`
            : `Score ${L.scores[i]}`
          : ''
      )
    )
    this.hud.time.setText(inGame ? `${Math.ceil(L.timeLeftMs / 1000)}s` : '')
    const mult = comboMultiplier(L.combos[0] ?? 0)
    this.hud.combo.setText(inGame && !this.versus && mult > 1 ? `Combo x${mult}` : '')
    // Last 10 seconds: pulse the timer red.
    const urgent = L.phase === 'playing' && L.timeLeftMs <= 10_000
    this.hud.time.setColor(urgent && Math.floor(now / 400) % 2 === 0 ? '#ff4d6d' : '#ffffff')
  }

  // ---- Generated art (no image files) --------------------------------------------

  private makeTextures(): void {
    const draw = (key: string, color: number, shine = false): void => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({}, false)
      const w = TEX_R * 2
      const bodyH = TEX_R * 2.3
      const cx = TEX_R
      const cy = TEX_R * 1.15
      g.lineStyle(2, 0xffffff, 0.8)
      g.lineBetween(cx, cy + bodyH / 2 + 8, cx + 6, TEX_R * 2.9) // string
      g.fillStyle(color, 1)
      g.fillEllipse(cx, cy, w - 4, bodyH)
      g.fillTriangle(cx - 8, cy + bodyH / 2 + 8, cx + 8, cy + bodyH / 2 + 8, cx, cy + bodyH / 2 - 4)
      g.fillStyle(0xffffff, 0.35)
      g.fillEllipse(cx - TEX_R * 0.35, cy - TEX_R * 0.45, TEX_R * 0.45, TEX_R * 0.7)
      if (shine) {
        g.lineStyle(4, 0xffffff, 0.9)
        g.strokeEllipse(cx, cy, w - 4, bodyH)
      }
      g.generateTexture(key, w, TEX_R * 2.9)
      g.destroy()
    }
    for (let i = 0; i < BALLOON_COLORS; i++) draw(`balloon-${i}`, COLORS[i])
    draw('balloon-gold', GOLD, true)
    if (!this.textures.exists('spark')) {
      const g = this.make.graphics({}, false)
      g.fillStyle(0xffffff, 1)
      g.fillCircle(6, 6, 6)
      g.generateTexture('spark', 12, 12)
      g.destroy()
    }
  }

  private drawBackground(): void {
    const sky = this.add.graphics().setDepth(0)
    sky.fillGradientStyle(0x5fb8ff, 0x5fb8ff, 0xcdeeff, 0xcdeeff, 1, 1, 1, 1)
    sky.fillRect(0, 0, W, H)
    for (let i = 0; i < 6; i++) {
      const cloud = this.add.graphics().setDepth(1).setAlpha(0.85)
      cloud.fillStyle(0xffffff, 1)
      const s = 0.6 + Math.random() * 0.8
      cloud.fillEllipse(0, 0, 160 * s, 60 * s)
      cloud.fillEllipse(-50 * s, 10 * s, 110 * s, 50 * s)
      cloud.fillEllipse(55 * s, 8 * s, 120 * s, 54 * s)
      cloud.setPosition(Math.random() * W, 60 + Math.random() * (H * 0.6))
      this.tweens.add({
        targets: cloud,
        x: { from: -200, to: W + 200 },
        duration: 40_000 + Math.random() * 40_000,
        delay: -Math.random() * 40_000,
        repeat: -1
      })
    }
  }
}
