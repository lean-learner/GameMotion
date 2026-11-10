import { extname, normalize, resolve, sep } from 'node:path'

export const APP_SCHEME = 'app'
export const APP_HOST = 'gamemotion'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

export function mimeFor(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Maps an app://gamemotion/... URL to a file inside `root`. Returns null for other
 * hosts or for any path that would escape `root` (e.g. encoded `..`).
 */
export function resolveAppPath(root: string, url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return null
  let pathname: string
  try {
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0')) return null
  if (pathname === '/' || pathname === '') pathname = '/index.html'
  const base = resolve(root)
  const file = resolve(base, '.' + normalize(pathname))
  if (file !== base && !file.startsWith(base + sep)) return null
  return file
}

/**
 * scheme://host for any URL. Unlike `new URL(u).origin`, this also works for
 * custom schemes such as app://, whose WHATWG origin is the opaque "null".
 */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}
