import { defineConfig } from 'vite'

// The web version: the same page the desktop app shows, built as a static site
// (out/web) that any web host can serve. `base: './'` keeps every path relative,
// so it works from a sub-folder such as https://<user>.github.io/GameMotion/.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: { outDir: '../../out/web', emptyOutDir: true, minify: true },
  // The tracking worker is an ES module (MediaPipe's module WASM loader needs it).
  worker: { format: 'es' }
})
