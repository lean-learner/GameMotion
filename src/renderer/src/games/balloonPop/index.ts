import type { GameModule } from '../types'

/** Balloon Pop. Phaser and the scene load only when the game starts. */
export const balloonPop: GameModule = {
  id: 'balloon-pop',
  title: 'Balloon Pop',
  async mount(parent, services, options = {}) {
    const [{ default: Phaser }, { BalloonPopScene }, { Sfx }] = await Promise.all([
      import('phaser'),
      import('./BalloonPopScene'),
      import('../sfx')
    ])
    const sfx = new Sfx()
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      backgroundColor: '#5fb8ff',
      banner: false,
      audio: { noAudio: true }, // sounds are synthesised by Sfx
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720
      },
      scene: new BalloonPopScene(services, sfx, options.autostart ?? false)
    })
    return () => {
      game.destroy(true)
      sfx.close()
    }
  }
}
