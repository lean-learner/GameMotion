import type { SetupServices } from '../types'

/** Mounts Reach setup (Phaser loads lazily). Resolves to a function that stops it. */
export async function mountReachSetup(
  parent: HTMLElement,
  services: SetupServices
): Promise<() => void> {
  const [{ default: Phaser }, { ReachSetupScene }] = await Promise.all([
    import('phaser'),
    import('./ReachSetupScene')
  ])
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: '#10213f',
    banner: false,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1280,
      height: 720
    },
    scene: new ReachSetupScene(services)
  })
  return () => game.destroy(true)
}
