import { describe, expect, it } from 'vitest'
import { gamePage } from '../src/renderer/src/games/launcher/paging'

describe('launcher paging', () => {
  it('keeps up to ten games on a single page', () => {
    expect(gamePage([], 0)).toEqual({ games: [], page: 0, pages: 1 })
    const games = Array.from({ length: 10 }, (_, i) => i)
    expect(gamePage(games, 3)).toEqual({ games, page: 0, pages: 1 })
  })
  it('reserves the tenth tile for paging and wraps without losing games', () => {
    for (const count of [11, 18, 19, 28]) {
      const games = Array.from({ length: count }, (_, i) => i)
      const pages = gamePage(games, 0).pages
      const shown = Array.from({ length: pages }, (_, i) => gamePage(games, i).games)
      expect(shown.flat()).toEqual(games)
      expect(shown.every((page) => page.length <= 9)).toBe(true)
      expect(gamePage(games, pages)).toEqual(gamePage(games, 0))
    }
  })
})
