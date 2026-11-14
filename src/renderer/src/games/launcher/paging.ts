/** Keep the large, two-row layout. The last slot cycles pages. */
export function gamePage<T>(
  games: readonly T[],
  page: number
): { games: T[]; page: number; pages: number } {
  const size = games.length > 10 ? 9 : 10
  const pages = Math.max(1, Math.ceil(games.length / size))
  const current = ((page % pages) + pages) % pages
  return { games: games.slice(current * size, (current + 1) * size), page: current, pages }
}
