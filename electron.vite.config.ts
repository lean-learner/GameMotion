import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // Minify the renderer bundle (Phaser alone is ~7 MB unminified).
    build: { minify: true },
    // The tracking worker is an ES module (MediaPipe's module WASM loader needs it).
    worker: { format: 'es' }
  }
})
