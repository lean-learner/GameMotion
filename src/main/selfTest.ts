import { app, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'

/**
 * Opt-in automated smoke test, driven by environment variables. Inactive
 * unless NEX_SELFTEST_SECONDS is set.
 *
 *   NEX_SELFTEST_SECONDS=20   auto-start tracking, quit after 20 s
 *   NEX_SELFTEST_SHOT=/p.png  save one screenshot of the window before quitting
 *   NEX_FAKE_CAMERA=1         use Chromium's synthetic camera instead of a webcam
 *   NEX_FAKE_CAMERA=/v.y4m    ...or feed a recorded .y4m/.mjpeg clip as the camera
 *   NEX_SELFTEST_PARAMS=...   extra UI settings, e.g. "delegate=CPU&pose=lite&hz=0"
 *
 * Renderer console output is relayed to stdout so metrics can be collected.
 */
const seconds = Number(process.env['NEX_SELFTEST_SECONDS'] ?? 0)
const fakeCamera = process.env['NEX_FAKE_CAMERA']

if (fakeCamera) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  if (fakeCamera !== '1')
    app.commandLine.appendSwitch('use-file-for-fake-video-capture', fakeCamera)
}

/** Returns the query string to append to the renderer URL. */
export function setupSelfTest(win: BrowserWindow): string {
  if (!(seconds > 0)) return ''

  win.webContents.on('console-message', (event) => {
    console.log(`[renderer:${event.level}] ${event.message}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[selftest] renderer gone:', details.reason)
    app.exit(2)
  })

  setTimeout(async () => {
    const shot = process.env['NEX_SELFTEST_SHOT']
    if (shot) {
      const image = await win.webContents.capturePage()
      await writeFile(shot, image.toPNG())
      console.log(`[selftest] screenshot saved: ${shot}`)
    }
    console.log('[selftest] done')
    app.quit()
  }, seconds * 1000)

  const params = new URLSearchParams(process.env['NEX_SELFTEST_PARAMS'] ?? '')
  params.set('autostart', '1')
  return `?${params}`
}
