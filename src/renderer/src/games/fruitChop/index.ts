import type { GameModule } from '../types'

/** Fruit Chop. Phaser and the scene load only when the game starts. */
export const fruitChop: GameModule = {
  id: 'fruit-chop',
  title: 'Fruit Chop',
  async mount(parent, services, options = {}) {
    const [{ default: Phaser }, { FruitChopScene }, { Sfx }] = await Promise.all([
      import('phaser'),
      import('./FruitChopScene'),
      import('../sfx')
    ])
    const sfx = new Sfx()
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent,
      backgroundColor: '#1b1033',
      banner: false,
      audio: { noAudio: true }, // sounds are synthesised by Sfx
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720
      },
      scene: new FruitChopScene(services, sfx, options.autostart ?? false)
    })
    return () => {
      game.destroy(true)
      sfx.close()
    }
  }
}
