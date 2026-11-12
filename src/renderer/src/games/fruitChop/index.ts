import type { GameModule } from '../types'

/** Fruit Chop. Phaser and the scene load only when the game starts. */
export const fruitChop: GameModule = {
  id: 'fruit-chop',
  title: 'Fruit Chop',
  cameraView: true,
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
      transparent: true, // the camera picture shows through, behind the canvas
      banner: false,
      audio: { noAudio: true }, // sounds are synthesised by Sfx
      // Fills the window; the scene scales its 16:9 frame and decorates the rest (CameraStage).
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: parent.clientWidth || 1280,
        height: parent.clientHeight || 720
      },
      scene: new FruitChopScene(services, sfx, options.autostart ?? false)
    })
    return () => {
      game.destroy(true)
      sfx.close()
    }
  }
}
