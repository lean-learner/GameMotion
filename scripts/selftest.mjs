// Automated smoke/performance test: launches the built app, auto-starts
// tracking, collects the renderer's [metrics] lines and prints a summary.
//
//   npm run selftest -- [--seconds 25] [--fake | --fake-file clip.y4m]
//                       [--shot out.png] [--params "delegate=CPU&pose=lite"]
//
// Without --fake/--fake-file this opens the real webcam. Exits non-zero if
// tracking never produced results. Run `npm run build` first.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({
  options: {
    seconds: { type: 'string', default: '25' },
    fake: { type: 'boolean', default: false },
    'fake-file': { type: 'string' },
    shot: { type: 'string' },
    params: { type: 'string', default: '' }
  }
})

const env = {
  ...process.env,
  NEX_SELFTEST_SECONDS: values.seconds,
  NEX_SELFTEST_PARAMS: values.params
}
if (values['fake-file']) env.NEX_FAKE_CAMERA = resolve(values['fake-file'])
else if (values.fake) env.NEX_FAKE_CAMERA = '1'
if (values.shot) env.NEX_SELFTEST_SHOT = resolve(values.shot)

const electron = createRequire(import.meta.url)('electron')
const child = spawn(electron, [root], { env, stdio: ['ignore', 'pipe', 'pipe'] })

const metrics = []
let buffer = ''
const onData = (chunk) => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl)
    buffer = buffer.slice(nl + 1)
    process.stdout.write(line + '\n')
    const m = line.match(/\[metrics\] (\{.*\})/)
    if (m) metrics.push(JSON.parse(m[1]))
  }
}
child.stdout.on('data', onData)
child.stderr.on('data', onData)

child.on('exit', (code) => {
  // Ignore the first sample: it includes model warm-up.
  const steady = metrics.slice(1)
  if (steady.length === 0) {
    console.error(`\nSELFTEST FAILED: no tracking metrics (electron exit ${code})`)
    process.exit(1)
  }
  const avg = (k) => steady.reduce((a, m) => a + m[k], 0) / steady.length
  const min = (k) => Math.min(...steady.map((m) => m[k]))
  const last = steady[steady.length - 1]
  console.log('\n=== Self-test summary ===')
  console.log(`samples (5 s each, warm-up excluded): ${steady.length}`)
  console.log(`delegate:          ${last.delegate}`)
  console.log(
    `camera fps:        avg ${avg('cameraFps').toFixed(1)}  min ${min('cameraFps').toFixed(1)}`
  )
  console.log(
    `tracking fps:      avg ${avg('trackingFps').toFixed(1)}  min ${min('trackingFps').toFixed(1)}`
  )
  console.log(`pose inference:    avg ${avg('poseMs').toFixed(1)} ms`)
  console.log(`hands inference:   avg ${avg('handsMs').toFixed(1)} ms`)
  console.log(
    `frame->result:     avg ${avg('latencyMs').toFixed(1)} ms, worst ${Math.max(...steady.map((m) => m.latencyMaxMs)).toFixed(1)} ms`
  )
  console.log(
    `frames (cumulative): sent ${last.sent}, skipped busy ${last.skippedBusy}, skipped by rate cap ${last.skippedRate}`
  )
  console.log(`body seen in last sample: ${last.body}, hands: ${last.hands}`)
  process.exit(avg('trackingFps') > 0 ? 0 : 1)
})
