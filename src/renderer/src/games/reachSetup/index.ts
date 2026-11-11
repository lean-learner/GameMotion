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
    backgroundColor: '#0c0c0c',
    banner: false,
    audio: { noAudio: true },
    // Fills the window at the screen's own resolution; the scene scales its layout (fillScreen).
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 1280,
      height: parent.clientHeight || 720
    },
    scene: new ReachSetupScene(services)
  })
  return () => game.destroy(true)
}
