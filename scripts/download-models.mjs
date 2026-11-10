// One-time setup: downloads the MediaPipe .task models into the renderer's
// public directory so the app never fetches anything at runtime.
// Re-running is cheap: files that already exist with the expected size are skipped.
import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { MODELS } from './models.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src/renderer/public/mediapipe/models')

async function sizeOf(path) {
  try {
    return (await stat(path)).size
  } catch {
    return -1
  }
}

await mkdir(outDir, { recursive: true })
for (const m of MODELS) {
  const dest = join(outDir, m.file)
  if ((await sizeOf(dest)) === m.bytes) {
    console.log(`ok       ${m.file}`)
    continue
  }
  console.log(`download ${m.file}`)
  const res = await fetch(m.url)
  if (!res.ok || !res.body) throw new Error(`Failed to download ${m.url}: HTTP ${res.status}`)
  const tmp = `${dest}.part`
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
  const got = await sizeOf(tmp)
  if (got !== m.bytes) {
    await unlink(tmp)
    throw new Error(`${m.file}: expected ${m.bytes} bytes, got ${got}`)
  }
  await rename(tmp, dest)
}
console.log(`Models ready in ${outDir}`)
