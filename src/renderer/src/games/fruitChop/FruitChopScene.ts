import Phaser from 'phaser'
import type { Vec2 } from '../../input/types'
import { playerInView } from '../balloonPop/logic'
import { BLADE_LENGTH, BladeAim } from '../blade'
import { CameraStage, hudPlate, reachArea, type StageTheme } from '../cameraStage'
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
  BLADE_RADIUS,
  DEFAULT_AREA,
  FIELD,
  FruitChopLogic,
  FRUITS,
  LIVES,
  type BombEvent,
  type ChopBonus,
  type ChopEvent,
  type HandInput,
  type Item,
  type Phase
} from './logic'

const W = FIELD.width
const H = FIELD.height
/** Radius textures are drawn at; sprites are scaled to each item's radius. */
const TEX_R = 64
const TEX = TEX_R * 2 + 24
const INK = '#1b1033'
const STAR = 0xffd23f
/** The game pauses itself when a player has been out of view this long. */
const OUT_OF_VIEW_MS = 1000
/** The pause button needs a longer hold, so it isn't pressed by accident while chopping. */
const PAUSE_BUTTON: Button = { id: 'pause', label: 'II', x: 0.905, y: 0.03, w: 0.08, h: 0.11 }
/** Shown on the first screen, so new players know how buttons work. */
const HOW_TO_CHOOSE = 'Point and hold to choose  ·  a fist is faster'
/** Score tables: versus rounds are kept apart from single-player ones. */
const tableId = (players: number): string => (players > 1 ? 'fruit-chop-2p' : 'fruit-chop')

/** The surround: dusk colours scattered with fruit. */
const ORCHARD: StageTheme = {
  top: 0x1b1033,
  bottom: 0x7a2c4f,
  accent: 0xffb347,
  motif: (g, x, y, s, index) => {
    const f = FRUITS[index % FRUITS.length]
    const r = 26 * s
    g.fillStyle(f.skin, 0.55)
    g.fillCircle(x, y, r)
    g.fillStyle(0xffffff, 0.18)
    g.fillEllipse(x - r * 0.35, y - r * 0.4, r * 0.5, r * 0.3)
    g.fillStyle(0x4caf50, 0.55)
    g.fillEllipse(x + r * 0.3, y - r * 1.02, r * 0.5, r * 0.22)
  }
}

const textureOf = (it: Item): string =>
  it.kind === 'bomb' ? 'chop-bomb' : it.kind === 'star' ? 'chop-star' : `chop-fruit-${it.type}`

/**
 * Fruit Chop rendering and effects. Rules live in FruitChopLogic; this scene
 * draws them, plays sounds and turns hands into blades (karate chops) and
 * button presses. One player with lives, or two against the clock (versus).
 */
export class FruitChopScene extends Phaser.Scene {
  private readonly logic = new FruitChopLogic()
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>()
  private players: Player[] = []
  private menu!: DwellButtons
  private pauseButton!: DwellButtons
  private cursorLayer!: CursorLayer
  private trails!: TrailLayer
  private readonly aim = new BladeAim()
  /** Increments every round, so a late score-save result can't land on the wrong screen. */
  private round = 0
  private shownPhase: Phase | null = null
  private outOfViewSince: number | null = null
  private lastCountdown = 0

  private hud!: {
    scores: Phaser.GameObjects.Text[]
    /** Lives (solo) or time left (versus). */
    centre: Phaser.GameObjects.Text
  }
  private overlay!: Phaser.GameObjects.Container
  private bigText!: Phaser.GameObjects.Text
  private juice!: Phaser.GameObjects.Particles.ParticleEmitter
  private flash!: Phaser.GameObjects.Rectangle
  private stage!: CameraStage
  private hudPlates!: Phaser.GameObjects.Graphics
  /** Scores as last drawn, to bump the number when it changes. */
  private shownScores: number[] = []

  constructor(
    private readonly services: GameServices,
    private readonly sfx: Sfx,
    private readonly autostart = false
  ) {
    super('fruit-chop')
  }

  private get versus(): boolean {
    return this.players.length > 1
  }

  create(): void {
    this.players = this.services.players()
    this.logic.players = this.players.length
    this.makeTextures()
    this.stage = new CameraStage(this, ORCHARD, this.versus ? 'Fruit Chop Versus' : 'Fruit Chop')
    this.hudPlates = this.add.graphics().setDepth(29)

    this.juice = this.add.particles(0, 0, 'chop-drop', {
      speed: { min: 140, max: 480 },
      lifespan: 650,
      scale: { start: 1, end: 0.2 },
      alpha: { start: 1, end: 0 },
      gravityY: 900,
      emitting: false
    })
    this.juice.setDepth(20)
    this.flash = this.add.rectangle(0, 0, W, H, 0xffffff, 1).setOrigin(0).setDepth(45).setAlpha(0)

    const hudStyle = { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff' }
    // One score per player: left player top-left, right player top-right (left of the pause button).
    const scores = this.players.map((p, i) =>
      this.add
        .text(i === 0 ? 46 : W - 176, 24, '', {
          ...hudStyle,
          color: this.versus ? p.color : '#ffffff'
        })
        .setOrigin(i === 0 ? 0 : 1, 0)
        .setDepth(30)
        .setStroke(INK, 6)
    )
    this.hud = {
      scores,
      centre: this.add
        .text(W / 2, 24, '', hudStyle)
        .setOrigin(0.5, 0)
        .setDepth(30)
        .setStroke(INK, 6)
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
      .setStroke(INK, 12)
    this.overlay = this.add.container(0, 0).setDepth(50)
    this.menu = new DwellButtons(this, { dwellMs: 1000, depth: 55 })
    this.pauseButton = new DwellButtons(this, { dwellMs: 1500, depth: 55, alpha: 0.45 })
    this.cursorLayer = new CursorLayer(this, BLADE_RADIUS)
    this.trails = new TrailLayer(this)
    if (this.autostart) this.logic.start(performance.now(), this.players.length)
  }

  update(): void {
    const now = performance.now()
    // During a round each hand is a blade (karate chop) pointing the way it moves.
    // In menus it is the usual cursor.
    const chopping = this.logic.phase === 'playing' || this.logic.phase === 'countdown'
    const px = (v: Vec2 | null): Vec2 | null => (v ? { x: v.x * W, y: v.y * H } : null)
    const hands: HandInput[] = []
    const angles: (number | undefined)[] = []
    const fists: (boolean | undefined)[] = []
    const screenHands: (Vec2 | null)[] = []
    this.players.forEach((_, player) => {
      const c = this.services.input.cursors(now, player)
      // In a round the blade is the player's own hand, right where they see it.
      const h = chopping ? this.services.input.hands(now, player) : c
      hands.push(
        { player, hand: 'left', pos: px(h.left) },
        { player, hand: 'right', pos: px(h.right) }
      )
      screenHands.push(c.left, c.right)
      fists.push(chopping ? undefined : c.left?.fist, chopping ? undefined : c.right?.fist)
    })

    for (const h of hands) {
      const angle = this.aim.aim(`${h.player}:${h.hand}`, chopping ? h.pos : null)
      angles.push(chopping && h.pos ? angle : undefined)
    }

    this.followPlayers()
    this.autoPause(now)
    const { chops, bombs, dropped, bonuses, strokes } = this.logic.update(now, hands)
    if (strokes.length) this.sfx.swoosh()
    for (const chop of chops) this.chopEffect(chop)
    for (const bomb of bombs) this.bombEffect(bomb)
    for (const item of dropped) this.dropEffect(item)
    for (const bonus of bonuses) this.bonusEffect(bonus)
    this.countdownBeeps(now)
    if (this.logic.phase !== this.shownPhase) this.showPhase(this.logic.phase)

    this.syncItems(now)
    this.updateHud(now)
    // Any player can press menu buttons.
    const pressed = this.menu.update(now, screenHands) ?? this.pauseButton.update(now, screenHands)
    if (pressed) this.act(pressed)
    const styles = hands.map((h, i): CursorDraw => {
      const color = this.versus ? hex(this.players[h.player].color) : HAND_COLORS[h.hand]
      const armed = chopping && this.logic.isArmed(h.player, h.hand, now)
      const angle = angles[i]
      return {
        pos: h.pos,
        color,
        armed,
        fist: fists[i],
        blade: angle === undefined ? undefined : { angle, length: BLADE_LENGTH }
      }
    })
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

  /** Keeps the action where each player can reach it, wherever they stand in the picture. */
  private followPlayers(): void {
    const areas = this.players.map((_, i) => {
      const body = this.services.input.body(i)
      // Keep the last known area while a player is briefly lost.
      return body ? reachArea(body) : (this.logic.areas[i] ?? DEFAULT_AREA)
    })
    this.logic.areas = areas
  }

  // ---- Game flow ---------------------------------------------------------------

  private autoPause(now: number): void {
    const active = this.logic.phase === 'playing' || this.logic.phase === 'countdown'
    const everyoneInView = this.players.every((_, i) =>
      playerInView(this.services.input.snapshot(i))
    )
    if (!active || everyoneInView) {
      this.outOfViewSince = null
      return
    }
    this.outOfViewSince ??= now
    if (now - this.outOfViewSince >= OUT_OF_VIEW_MS) {
      console.info('[game] auto-pause: a player is out of view')
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
        this.clearItems()
        this.logic.start(now, this.players.length)
        break
      case 'resume':
        this.logic.resume(now)
        break
      case 'pause':
        this.logic.pause(now, 'player')
        break
      case 'menu':
        this.clearItems()
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
      `[game] phase ${phase} scores=${L.scores.join('/')} chopped=${L.chopped.join('/')}` +
        (phase === 'paused' ? ` reason=${L.pauseReason}` : '')
    )
    this.overlay.removeAll(true)
    const title = (str: string, y = 0.24, color = '#ffffff'): void => {
      this.overlay.add(
        this.add
          .text(W / 2, H * y, str, { fontFamily: FONT, fontSize: '84px', fontStyle: 'bold', color })
          .setOrigin(0.5)
          .setStroke(INK, 10)
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
          .setStroke(INK, 6)
      )
    }
    const dim = (): void => {
      this.overlay.add(this.add.rectangle(0, 0, W, H, 0x0d0719, 0.6).setOrigin(0))
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
        title(this.versus ? 'Fruit Chop Versus' : 'Fruit Chop')
        line(this.versus ? `${names[0]}  vs  ${names[1]}` : names[0], 0.34, 28, '#b8b8b8')
        line('Chop the fruit with a fast, flat hand.', 0.43, 34)
        line(
          this.versus
            ? '60 seconds  ·  Bombs cost 50 points'
            : "5 lives  ·  Don't drop fruit  ·  Don't hit bombs",
          0.51,
          26
        )
        line('3 in one chop = bonus  ·  Gold stars = 50', 0.57, 24, '#ffe14d')
        buttons = [btn('start', 'Start', 0.38, 0.66), btn('quit', 'Back', 0.66, 0.66)]
        line(HOW_TO_CHOOSE, 0.86, 22, '#b8b8b8')
        break
      case 'paused':
        dim()
        title('Paused')
        line(
          L.pauseReason === 'out-of-view'
            ? this.versus
              ? 'Both players step back into view'
              : 'Step back into view'
            : 'Ready when you are',
          0.42
        )
        buttons = [
          btn('resume', 'Resume', 0.25, 0.6, 0.22),
          btn('restart', 'Restart', 0.5, 0.6, 0.22),
          btn('quit', 'Home', 0.75, 0.6, 0.22)
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
              .map((p, i) => `${p.name}: ${L.scores[i]} (${L.chopped[i]} fruits)`)
              .join('     '),
            0.31,
            34
          )
        } else {
          title('Out of lives!', 0.17)
          line(`${names[0]}: ${L.scores[0]} points  ·  ${L.chopped[0]} fruits`, 0.31, 40)
        }
        this.saveScores(line)
        buttons = [btn('again', 'Play again', 0.38, 0.8), btn('quit', 'Home', 0.66, 0.8)]
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
      .text(W / 2, H * 0.4, 'Saving…', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#ffffff'
      })
      .setOrigin(0.5)
      .setStroke(INK, 6)
    this.overlay.add(status)
    const table = tableId(this.players.length)
    void Promise.all(
      this.players.map((_, i) => this.services.saveScore(table, this.logic.scores[i], i))
    ).then((saved) => {
      // Ignore the result if the players have already moved on.
      if (round !== this.round || this.logic.phase !== 'gameover' || !status.active) return
      if (saved.some((s) => !s)) {
        status.setText("Couldn't save the score")
        return
      }
      const bests = this.players.flatMap((p, i) => (saved[i]!.isPersonalBest ? [p.name] : []))
      status.setText(
        bests.length
          ? this.versus
            ? `New best: ${bests.join(' & ')}!`
            : 'New best!'
          : this.versus
            ? 'Scores saved'
            : `Your best: ${saved[0]!.personalBest}`
      )
      status.setColor(bests.length ? '#ffe14d' : '#ffffff').setFontSize(bests.length ? 34 : 28)
      const top = saved[saved.length - 1]!.top
      this.stage.setInfo([
        'Top scores',
        ...top.slice(0, 5).map((r, i) => `${i + 1}. ${r.name}  ${r.score}`)
      ])
      line(this.versus ? 'Top versus scores' : 'Top scores', 0.49, 26)
      top
        .slice(0, 3)
        .forEach((row, i) => line(`${i + 1}.  ${row.name}   ${row.score}`, 0.56 + i * 0.065, 26))
    })
  }

  // ---- Fruit and effects ------------------------------------------------------------

  private syncItems(now: number): void {
    const alive = new Set<number>()
    for (const it of this.logic.items) {
      alive.add(it.id)
      let s = this.sprites.get(it.id)
      if (!s) {
        s = this.add.image(it.x, it.y, textureOf(it)).setDepth(10)
        this.sprites.set(it.id, s)
      }
      // Bombs throb, so they read as dangerous at a glance.
      const throb = it.kind === 'bomb' ? 1 + 0.07 * Math.sin(now / 90) : 1
      s.setPosition(it.x, it.y)
        .setRotation(it.kind === 'bomb' ? it.rot * 0.3 : it.rot)
        .setScale((it.r / TEX_R) * throb)
    }
    for (const [id, s] of this.sprites) {
      if (!alive.has(id)) {
        s.destroy()
        this.sprites.delete(id)
      }
    }
  }

  private clearItems(): void {
    for (const s of this.sprites.values()) s.destroy()
    this.sprites.clear()
  }

  private floatText(x: number, y: number, str: string, color: string, size = 36): void {
    const label = this.add
      .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setDepth(25)
      .setStroke(INK, 6)
    this.tweens.add({
      targets: label,
      y: y - 90,
      alpha: 0,
      duration: 800,
      ease: 'cubic.out',
      onComplete: () => label.destroy()
    })
  }

  private chopEffect(c: ChopEvent): void {
    const it = c.item
    console.info(`[game] chop ${it.kind} by player ${c.player + 1} ${c.hand} hand +${c.points}`)
    const star = it.kind === 'star'
    const flesh = star ? STAR : FRUITS[it.type].flesh
    this.juice.setParticleTint(flesh)
    this.juice.explode(star ? 34 : 18, it.x, it.y)
    if (star) this.sfx.chime()
    else this.sfx.pop()
    // A splash of juice stays behind for a moment.
    const splat = this.add.graphics().setDepth(3).setAlpha(0.4)
    splat.fillStyle(flesh, 1)
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * it.r
      splat.fillCircle(
        it.x + Math.cos(a) * d,
        it.y + Math.sin(a) * d,
        it.r * (0.25 + Math.random() * 0.4)
      )
    }
    this.tweens.add({
      targets: splat,
      alpha: 0,
      delay: 500,
      duration: 1500,
      onComplete: () => splat.destroy()
    })
    this.halves(c)
    this.stage.pulse(star ? STAR : 0x5dc21e, star ? 0.3 : 0.14)
    const color = this.versus ? this.players[c.player].color : star ? '#ffe14d' : '#ffffff'
    this.floatText(it.x, it.y, `+${c.points}`, color, star ? 46 : 36)
  }

  /** The fruit splits along the chop; the halves show their flesh, fly apart and fall. */
  private halves(c: ChopEvent): void {
    const it = c.item
    const key = it.kind === 'star' ? 'chop-star' : `chop-fruit-${it.type}-cut`
    // The texture's cut line is vertical; turn it to lie along the chop.
    const rot = c.angle - Math.PI / 2
    ;[-1, 1].forEach((side) => {
      const half = this.add
        .image(it.x, it.y, key)
        .setScale(it.r / TEX_R)
        .setRotation(rot)
        .setDepth(12)
        .setCrop(side < 0 ? 0 : TEX / 2, 0, TEX / 2, TEX)
      // Each half keeps some of the fruit's motion, moves away from the cut and drops.
      const dx = side * Math.cos(rot) * 110 + it.vx * 0.4
      const dy = side * Math.sin(rot) * 110
      this.tweens.add({
        targets: half,
        x: it.x + dx,
        rotation: rot + side * 1.4,
        duration: 800,
        ease: 'cubic.out'
      })
      this.tweens.add({
        targets: half,
        y: it.y + dy + 420,
        alpha: { from: 1, to: 0.2 },
        duration: 800,
        ease: 'quad.in',
        onComplete: () => half.destroy()
      })
    })
  }

  private bombEffect(b: BombEvent): void {
    console.info(`[game] bomb chopped by player ${b.player + 1} ${b.hand} hand`)
    this.sfx.thud()
    this.stage.pulse(0xff3b3b, 0.45, 500)
    this.flash.setAlpha(0.8)
    this.tweens.add({ targets: this.flash, alpha: 0, duration: 450 })
    this.juice.setParticleTint(0xff7a1a)
    this.juice.explode(40, b.item.x, b.item.y)
    this.floatText(
      b.item.x,
      b.item.y,
      this.versus ? (b.penalty ? `BOOM  -${b.penalty}` : 'BOOM') : 'BOOM  -1 life',
      '#ff6b6b',
      48
    )
  }

  /** A fruit got away: mark where it fell. */
  private dropEffect(item: Item): void {
    if (this.versus) return
    this.sfx.thud()
    this.stage.pulse(0xff3b3b, 0.25)
    this.floatText(Phaser.Math.Clamp(item.x, 60, W - 60), H - 40, 'Missed!', '#ff6b6b', 34)
  }

  /** Several fruits in one stroke: a big floating bonus label. */
  private bonusEffect(bonus: ChopBonus): void {
    this.sfx.bonus()
    console.info(`[game] chop bonus x${bonus.count} +${bonus.points} (player ${bonus.player + 1})`)
    const color = this.versus ? this.players[bonus.player].color : '#ffe14d'
    const label = this.add
      .text(bonus.x, bonus.y - 40, `${bonus.count} in one chop!  +${bonus.points}`, {
        fontFamily: FONT,
        fontSize: '52px',
        fontStyle: 'bold',
        color
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setStroke(INK, 8)
      .setScale(0.6)
    label.setX(Phaser.Math.Clamp(label.x, 260, W - 260))
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

  private updateHud(now: number): void {
    const L = this.logic
    const inGame = L.phase === 'playing' || L.phase === 'countdown' || L.phase === 'paused'
    const g = this.hudPlates
    g.clear()
    this.hud.scores.forEach((t, i) => {
      t.setText(
        inGame
          ? this.versus
            ? `${this.players[i].name}  ${L.scores[i]}`
            : `Score  ${L.scores[i]}`
          : ''
      )
      if (!inGame) return
      // A dark plate behind each score, edged in the player's colour.
      const w = t.width + 44
      const x = i === 0 ? 24 : W - 154 - w
      hudPlate(g, x, 14, w, 60, this.versus ? hex(this.players[i].color) : 0x5dc21e)
      // The number jumps when it changes.
      if (this.shownScores[i] !== undefined && L.scores[i] !== this.shownScores[i]) {
        this.tweens.killTweensOf(t)
        t.setScale(1.25)
        this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'back.out' })
      }
      this.shownScores[i] = L.scores[i]
    })
    const centre = this.hud.centre
    if (!inGame) {
      centre.setText('')
      return
    }
    if (this.versus) {
      centre.setText(`${Math.ceil(L.timeLeftMs / 1000)}s`)
      // Last 10 seconds: pulse the timer red.
      const urgent = L.phase === 'playing' && L.timeLeftMs <= 10_000
      centre.setColor(urgent && Math.floor(now / 400) % 2 === 0 ? '#ff4d6d' : '#ffffff')
    } else {
      centre.setText('♥ '.repeat(L.lives) + '♡ '.repeat(LIVES - L.lives)).setColor('#ff5c7a')
    }
    hudPlate(g, W / 2 - centre.width / 2 - 24, 14, centre.width + 48, 60)
  }

  // ---- Generated art (no image files) --------------------------------------------

  private makeTextures(): void {
    const c = TEX / 2
    const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({}, false)
      draw(g)
      g.generateTexture(key, TEX, TEX)
      g.destroy()
    }
    const darker = (color: number, k: number): number => {
      const ch = (shift: number): number => Math.round(((color >> shift) & 0xff) * k) << shift
      return ch(16) | ch(8) | ch(0)
    }
    FRUITS.forEach((f, i) => {
      // Whole fruit: skin with a shaded side, a highlight, a stem and a leaf.
      make(`chop-fruit-${i}`, (g) => {
        g.fillStyle(darker(f.skin, 0.72), 1)
        g.fillCircle(c, c, TEX_R)
        g.fillStyle(f.skin, 1)
        g.fillCircle(c - 5, c - 5, TEX_R - 7)
        g.fillStyle(0xffffff, 0.35)
        g.fillEllipse(c - TEX_R * 0.38, c - TEX_R * 0.42, TEX_R * 0.5, TEX_R * 0.32)
        g.fillStyle(0x5a3b1e, 1)
        g.fillRect(c - 3, c - TEX_R - 9, 6, 16)
        g.fillStyle(0x4caf50, 1)
        g.fillEllipse(c + 14, c - TEX_R - 2, 24, 11)
      })
      // Cut face: rind, a pale ring, the flesh and a few seeds.
      make(`chop-fruit-${i}-cut`, (g) => {
        g.fillStyle(f.skin, 1)
        g.fillCircle(c, c, TEX_R)
        g.fillStyle(0xffffff, 0.75)
        g.fillCircle(c, c, TEX_R - 6)
        g.fillStyle(f.flesh, 1)
        g.fillCircle(c, c, TEX_R - 11)
        g.fillStyle(darker(f.flesh, 0.45), 0.9)
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * Math.PI * 2 + 0.3
          g.fillEllipse(c + Math.cos(a) * TEX_R * 0.42, c + Math.sin(a) * TEX_R * 0.42, 7, 11)
        }
      })
    })
    make('chop-star', (g) => {
      const pts: Phaser.Math.Vector2[] = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? TEX_R : TEX_R * 0.46
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2
        pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * r, c + Math.sin(a) * r))
      }
      g.fillStyle(STAR, 1)
      g.fillPoints(pts, true)
      g.lineStyle(5, 0xffffff, 0.9)
      g.strokePoints(pts, true)
    })
    make('chop-bomb', (g) => {
      g.fillStyle(0xff3b3b, 0.3)
      g.fillCircle(c, c, TEX_R + 10) // warning glow
      g.fillStyle(0x16161d, 1)
      g.fillCircle(c, c, TEX_R - 4)
      g.lineStyle(5, 0xff3b3b, 1)
      g.strokeCircle(c, c, TEX_R - 4)
      g.fillStyle(0xffffff, 0.22)
      g.fillEllipse(c - TEX_R * 0.35, c - TEX_R * 0.4, TEX_R * 0.45, TEX_R * 0.28)
      // A cross, so it is never mistaken for a dark fruit.
      g.lineStyle(9, 0xff3b3b, 1)
      g.lineBetween(c - 20, c - 20, c + 20, c + 20)
      g.lineBetween(c - 20, c + 20, c + 20, c - 20)
      g.fillStyle(0xffc23d, 1)
      g.fillCircle(c + 6, c - TEX_R - 2, 8) // lit fuse
    })
    if (!this.textures.exists('chop-drop')) {
      const g = this.make.graphics({}, false)
      g.fillStyle(0xffffff, 1)
      g.fillCircle(7, 7, 7)
      g.generateTexture('chop-drop', 14, 14)
      g.destroy()
    }
  }
}
