import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mimeFor, originOf, resolveAppPath } from '../src/main/appProtocol'

const root = resolve('/srv/app/renderer')

describe('resolveAppPath', () => {
  it('maps app://gamemotion paths into the renderer root', () => {
    expect(resolveAppPath(root, 'app://gamemotion/index.html')).toBe(join(root, 'index.html'))
    expect(resolveAppPath(root, 'app://gamemotion/')).toBe(join(root, 'index.html'))
    expect(resolveAppPath(root, 'app://gamemotion/mediapipe/models/hand_landmarker.task?x=1')).toBe(
      join(root, 'mediapipe/models/hand_landmarker.task')
    )
  })

  it('never resolves outside the root, including encoded traversal', () => {
    const attempts = [
      'app://gamemotion/../../etc/passwd',
      'app://gamemotion/%2e%2e/%2e%2e/etc/passwd',
      'app://gamemotion/..%2f..%2fetc%2fpasswd',
      'app://gamemotion/assets/..%2f..%2f..%2f..%2fetc%2fpasswd',
      'app://gamemotion/%2e%2e%5c%2e%2e%5cetc%5cpasswd'
    ]
    for (const url of attempts) {
      const file = resolveAppPath(root, url)
      if (file !== null) expect(file.startsWith(root + sep)).toBe(true)
    }
    expect(resolveAppPath(root, 'app://gamemotion/a%00b')).toBeNull()
  })

  it('rejects other hosts and schemes', () => {
    expect(resolveAppPath(root, 'app://evil/index.html')).toBeNull()
    expect(resolveAppPath(root, 'file:///etc/passwd')).toBeNull()
  })
})

describe('mimeFor', () => {
  it('serves wasm with the MIME type streaming compilation requires', () => {
    expect(mimeFor('x/vision_wasm_module_internal.wasm')).toBe('application/wasm')
    expect(mimeFor('x/worker.js')).toMatch(/^text\/javascript/)
  })
})

describe('originOf', () => {
  it('gives custom schemes a comparable origin (URL.origin would be "null")', () => {
    expect(new URL('app://gamemotion/index.html').origin).toBe('null')
    expect(originOf('app://gamemotion/index.html?autostart=1')).toBe('app://gamemotion')
    expect(originOf('app://gamemotion')).toBe('app://gamemotion')
    expect(originOf('app://evil/index.html')).not.toBe('app://gamemotion')
    expect(originOf('http://localhost:5173/src/main.ts')).toBe('http://localhost:5173')
    expect(originOf('not a url')).toBeNull()
  })
})
