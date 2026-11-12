import type Phaser from 'phaser'
import { CameraGameScene, H, W } from '../CameraGameScene'
import { hudPlate, type StageTheme } from '../cameraStage'
import { drawFigure } from '../poseArt'
import { POSE_NAMES, type BodyInput } from '../poses'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { MirrorDuelLogic, POSES_PER_ROUND, type GameEvent } from './logic'

/** The surround: a dressing-room mirror, with light bulbs and sparkles. */
const MIRROR: StageTheme = {
  top: 0x0b2545,
  bottom: 0x12807a,
  accent: 0x4de8d6,
  motif: (g, x, y, s, index) => {
    if (index % 3 === 0) {
      g.fillStyle(0xfff3b0, 0.25)
      g.fillCircle(x, y, 22 * s)
      g.fillStyle(0xfff3b0, 0.85)
      g.fillCircle(x, y, 10 * s)
      return
    }
    g.lineStyle(3, 0xffffff, 0.55)
    g.lineBetween(x - 14 * s, y, x + 14 * s, y)
    g.lineBetween(x, y - 14 * s, x, y + 14 * s)
    g.lineStyle(2, 0xffffff, 0.3)
    g.lineBetween(x - 8 * s, y - 8 * s, x + 8 * s, y + 8 * s)
    g.lineBetween(x - 8 * s, y + 8 * s, x + 8 * s, y - 8 * s)
  }
}

/** The pose card: in the middle with two players, to one side when a lone player stands there. */
const CARD = { w: 250, h: 300, y: 96 }

/**
 * Mirror Duel, played over the camera view: a pose appears on a card and the
 * first player to strike it takes the points. Rules live in MirrorDuelLogic.
 */
export class MirrorDuelScene extends CameraGameScene {
  private readonly logic = new MirrorDuelLogic()
  private inputs: (BodyInput | null)[] = []
  private card!: Phaser.GameObjects.Graphics
  private rings!: Phaser.GameObjects.Graphics
  private poseName!: Phaser.GameObjects.Text
  private banner!: Phaser.GameObjects.Text

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'mirror-duel',
      title: 'Mirror Duel',
      theme: MIRROR,
      help: [
        'Copy the pose on the card  ·  First to strike it scores',
        `${POSES_PER_ROUND} poses, each one quicker  ·  Be fast for bonus points`
      ],
      usesDuck: true
    })
  }

  protected get flow(): RoundFlow {
    return this.logic.flow
  }

  protected build(): void {
    this.logic.prepare(this.players.length)
    this.rings = this.add.graphics().setDepth(12)
    this.card = this.add.graphics().setDepth(20)
    this.poseName = this.label(30).setDepth(21)
    this.banner = this.label(44).setDepth(21)
  }

  protected begin(now: number): void {
    this.logic.start(now, this.players.length)
  }

  protected scores(): number[] {
    return this.logic.scores()
  }

  protected hudLine(player: number): string {
    const name = this.duo ? `${this.players[player].name} ` : ''
    return `${name}${this.logic.players[player]?.score ?? 0}`
  }

  protected centreLine(): string {
    return `${Math.min(this.logic.shown, POSES_PER_ROUND)} / ${POSES_PER_ROUND}`
  }

  protected step(now: number): void {
    this.inputs = this.players.map((_, i) => this.bodyInput(i, now))
    for (const e of this.logic.update(now, this.inputs)) this.onEvent(e)
  }

  private onEvent(e: GameEvent): void {
    if (e.type === 'pose') {
      this.sfx.swoosh()
      return
    }
    if (e.type === 'timeout') {
      this.sfx.buzz()
      return
    }
    console.info(`[game] player ${e.player + 1} struck ${e.pose} for ${e.points}`)
    this.sfx.chime()
    this.stage.pulse(this.colorOf(e.player), 0.3)
    const body = this.inputs[e.player]
    this.floatText(
      body?.x ?? W / 2,
      Math.max(140, (body?.y ?? H / 2) - 150),
      `+${e.points}`,
      this.duo ? this.players[e.player].color : '#ffe14d',
      48
    )
  }

  protected draw(): void {
    const L = this.logic
    const playing = this.flow.phase === 'playing'
    const card = this.card
    const rings = this.rings
    card.clear()
    rings.clear()
    this.poseName.setText('')
    this.banner.setText('')
    if (!playing) return

    // Keep the card clear of a lone player: on the side they aren't standing on.
    const lone = this.duo ? null : this.inputs[0]
    const cx = this.duo ? W / 2 : lone && lone.x < W / 2 ? W - 190 : 190
    const x0 = cx - CARD.w / 2

    if (L.stage === 'pose' && L.pose) {
      card.fillStyle(0x06121f, 0.72)
      card.fillRoundedRect(x0, CARD.y, CARD.w, CARD.h, 22)
      card.lineStyle(4, MIRROR.accent, 0.95)
      card.strokeRoundedRect(x0, CARD.y, CARD.w, CARD.h, 22)
      drawFigure(card, cx, CARD.y + 112, 44, L.pose, { color: 0xffffff })
      // Time left, draining along the bottom of the card.
      const left = L.timeLeft()
      card.fillStyle(0xffffff, 0.2)
      card.fillRoundedRect(x0 + 20, CARD.y + CARD.h - 26, CARD.w - 40, 10, 5)
      card.fillStyle(left > 0.3 ? MIRROR.accent : 0xff6b6b, 1)
      card.fillRoundedRect(x0 + 20, CARD.y + CARD.h - 26, (CARD.w - 40) * left, 10, 5)
      this.poseName.setText(POSE_NAMES[L.pose]).setPosition(cx, CARD.y + CARD.h + 30)
      hudPlate(
        card,
        cx - this.poseName.width / 2 - 22,
        CARD.y + CARD.h + 4,
        this.poseName.width + 44,
        52
      )
    } else {
      // Between poses: who took the last one, and a nudge to get ready.
      const last = L.lastWinner
      const str =
        L.shown === 0
          ? 'Get ready…'
          : L.shown >= POSES_PER_ROUND
            ? 'That was the last one!'
            : last === null
              ? 'Too slow!'
              : this.duo
                ? `${this.players[last].name} got it!`
                : 'Got it!'
      this.banner
        .setText(str)
        .setColor(last !== null && this.duo && L.shown > 0 ? this.players[last].color : '#ffffff')
        .setPosition(W / 2, 150)
    }

    // A ring around each player's head fills while they hold the pose.
    this.inputs.forEach((body, i) => {
      if (!body) return
      const hold = L.stage === 'pose' ? L.holdProgress(i) : 0
      const r = body.sw * 0.62
      const cy = body.y - body.sw * 0.75
      rings.lineStyle(5, this.colorOf(i), 0.35)
      rings.strokeCircle(body.x, cy, r)
      if (hold > 0) {
        rings.lineStyle(9, 0x7cff6b, 1)
        rings.beginPath()
        rings.arc(body.x, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hold)
        rings.strokePath()
      }
    })
  }
}
