// Copies MediaPipe's WASM runtime out of node_modules into the renderer's public
// directory (served at /mediapipe/wasm) and checks that the models are present.
// Runs automatically before `dev` and `build`.
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODELS } from './models.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const publicDir = join(root, 'src/renderer/public/mediapipe')
const wasmOut = join(publicDir, 'wasm')

// Only the ES-module variant is needed: tracking runs in a module Web Worker.
const WASM_FILES = ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']

await mkdir(wasmOut, { recursive: true })
for (const f of WASM_FILES) await copyFile(join(srcDir, f), join(wasmOut, f))
console.log(`Copied MediaPipe WASM -> ${wasmOut}`)

const missing = []
for (const m of MODELS) {
  try {
    if ((await stat(join(publicDir, 'models', m.file))).size !== m.bytes) missing.push(m.file)
  } catch {
    missing.push(m.file)
  }
}
if (missing.length) {
  console.error(`Missing or incomplete models: ${missing.join(', ')}\nRun: npm run setup:models`)
  process.exit(1)
}
