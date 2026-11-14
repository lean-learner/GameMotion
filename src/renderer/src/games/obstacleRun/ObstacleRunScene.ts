import type Phaser from 'phaser'
import { CameraGameScene, hearts } from '../CameraGameScene'
import type { StageTheme } from '../cameraStage'
import type { RoundFlow } from '../roundFlow'
import type { Sfx } from '../sfx'
import type { GameServices } from '../types'
import { drawBar, drawCoin, drawCrate, drawHurdle, drawTrack, spot } from './art'
import { LEVELS, LIVES, ObstacleRunLogic, progress, type GameEvent, type Row } from './logic'

/** The surround: a running track at dusk, with cones. */
const TRACK: StageTheme = {
  top: 0x1d1a3a,
  bottom: 0xc2542d,
  accent: 0xffb347,
  motif: (g, x, y, s) => {
    g.fillStyle(0xff7a1a, 0.85)
    g.fillTriangle(x - 16 * s, y + 20 * s, x + 16 * s, y + 20 * s, x, y - 24 * s)
    g.fillStyle(0xffffff, 0.85)
    g.fillRect(x - 8 * s, y - 2 * s, 16 * s, 6 * s)
  }
}

/** Obstacle Run, played over the camera view. Rules live in ObstacleRunLogic. */
export class ObstacleRunScene extends CameraGameScene {
  private readonly logic = new ObstacleRunLogic()
  private g!: Phaser.GameObjects.Graphics
  private prompts: Phaser.GameObjects.Text[] = []

  constructor(services: GameServices, sfx: Sfx, autostart = false) {
    super(services, sfx, autostart, {
      id: 'obstacle-run',
      title: 'Obstacle Run',
      theme: TRACK,
      help: [
        'Step sideways past the crates  ·  Jump the hurdles  ·  Duck the beams',
        'Grab coins on the way  ·  Five levels, faster each time  ·  Three hits and you are out'
      ]
    })
  }

  protected get flow(): RoundFlow {
    return this.logic.flow
  }

  protected build(): void {
    this.logic.prepare(this.players.length)
    this.g = this.add.graphics().setDepth(16)
    this.prompts = this.players.map(() => this.label(44).setDepth(30))
  }

  protected begin(now: number): void {
    this.logic.start(now, this.players.length)
  }

  protected scores(): number[] {
    return this.logic.scores()
  }

  protected hudLine(player: number): string {
    const r = this.logic.runners[player]
    if (!r) return ''
    const name = this.duo ? `${this.players[player].name} ` : ''
    return `${name}${r.score}  ${hearts(r.lives, LIVES)}`
  }

  protected centreLine(): string {
    return `Level ${this.logic.level()}/${LEVELS}  ·  ${Math.ceil(this.logic.remaining() / 1000)}s`
  }

  protected resultLine(): string {
    const line = (i: number): string => {
      const r = this.logic.runners[i]
      return `${r.score} points  ·  ${r.passed} obstacles  ·  ${r.coins} coins`
    }
    if (!this.duo) return line(0)
    return this.players.map((p, i) => `${p.name}: ${line(i)}`).join('\n')
  }

  protected step(now: number): void {
    const inputs = this.players.map((_, i) => this.bodyInput(i, now))
    for (const e of this.logic.update(now, inputs)) this.onEvent(e)
  }

  private onEvent(e: GameEvent): void {
    if (e.type === 'level') {
      this.sfx.chime()
      this.floatText(
        640,
        300,
        e.level === LEVELS ? 'Final level!' : `Level ${e.level}`,
        '#ffb347',
        72
      )
      return
    }
    const track = this.logic.runners[e.player].track
    const x = track?.cx ?? 640
    switch (e.type) {
      case 'jump':
        this.sfx.swoosh()
        break
      case 'pass':
        this.sfx.note(e.kind === 'crate' ? 520 : 660, 0.07)
        this.floatText(x, 560, `+${e.points}`, this.cssColorOf(e.player), 30)
        break
      case 'coin':
        this.sfx.chime()
        this.floatText(x + e.lane * (track?.laneW ?? 0), 420, 'Coin!', '#ffe14d', 34)
        break
      case 'hit':
        this.sfx.thud()
        this.stage.pulse(0xff3030)
        this.floatText(x, 420, e.kind === 'crate' ? 'Crash!' : 'Tripped!', '#ff6b6b', 48)
        break
      case 'out':
        this.sfx.buzz()
        break
    }
  }

  /** What the nearest row asks of a player, said in one word. */
  private prompt(player: number): string {
    const r = this.logic.runners[player]
    if (r.lives <= 0) return this.duo ? 'Out' : ''
    if (!r.track) return 'Stand in the middle'
    const t = this.flow.elapsed
    const row = this.logic.rows.find((o) => !o.done[player] && progress(o, t) > 0.45)
    if (!row) return ''
    if (row.kind === 'hurdle') return 'Jump!'
    if (row.kind === 'bar') return 'Duck!'
    if (!row.lanes.includes(r.lane)) return ''
    const free = [-1, 0, 1].filter((l) => !row.lanes.includes(l))
    return free.every((l) => l < r.lane)
      ? '← Move'
      : free.every((l) => l > r.lane)
        ? 'Move →'
        : 'Move!'
  }

  private drawRow(row: Row, player: number, t: number): void {
    const track = this.logic.runners[player].track
    if (!track || row.done[player]) return
    const p = progress(row, t)
    const alpha = Math.min(1, p * 5)
    if (row.kind === 'hurdle') drawHurdle(this.g, track, p, alpha)
    else if (row.kind === 'bar') drawBar(this.g, track, p, alpha)
    else for (const lane of row.lanes) drawCrate(this.g, track, lane, p, alpha)
    if (row.coin !== null && !row.got[player]) drawCoin(this.g, track, row.coin, p, alpha)
  }

  protected draw(): void {
    const g = this.g
    g.clear()
    const shown = ['playing', 'countdown', 'paused'].includes(this.flow.phase)
    const t = this.flow.elapsed
    // Far rows first, so near ones cover them.
    const rows = [...this.logic.rows].sort((a, b) => b.at - a.at)
    this.logic.runners.forEach((r, i) => {
      const label = this.prompts[i]
      label.setText(shown ? this.prompt(i) : '')
      label.setPosition(r.track?.cx ?? (this.duo ? 320 + 640 * i : 640), 128)
      if (!shown || !r.track) return
      drawTrack(g, r.track, r.lives > 0 ? r.lane : null, this.colorOf(i))
      if (r.lives <= 0) return
      for (const row of rows) this.drawRow(row, i, t)
      // A marker under the player shows which lane counts.
      const foot = spot(r.track, r.lane, 1)
      g.fillStyle(this.colorOf(i), r.vertical.air ? 0.25 : 0.6)
      g.fillEllipse(foot.x, foot.y - 8, r.track.laneW * (r.vertical.air ? 0.4 : 0.6), 14)
    })
  }
}
