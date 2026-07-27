/**
 * Nearest-neighbor TSP heuristic. Tries every stop as the starting point and
 * greedily visits the nearest unvisited stop each step, then keeps whichever
 * starting point produced the lowest total travel time. O(n^3), which is
 * trivial for the small stop counts (a handful of jobs per day) this is used
 * for — not meant to scale to large route counts.
 */
export function findBestRoute(matrix: number[][]): { order: number[]; totalSeconds: number } {
  const n = matrix.length
  if (n === 0) return { order: [], totalSeconds: 0 }
  if (n === 1) return { order: [0], totalSeconds: 0 }

  let best: { order: number[]; totalSeconds: number } | null = null

  for (let start = 0; start < n; start++) {
    const visited = new Array(n).fill(false)
    visited[start] = true
    const order = [start]
    let total = 0
    let current = start

    for (let step = 1; step < n; step++) {
      let nearest = -1
      let nearestDist = Infinity
      for (let j = 0; j < n; j++) {
        if (!visited[j] && matrix[current][j] < nearestDist) {
          nearestDist = matrix[current][j]
          nearest = j
        }
      }
      // No reachable unvisited stop (e.g. no driving route exists between
      // them) — still visit it rather than dropping it from the route, just
      // with an unknown/untracked travel time for this leg.
      if (nearest === -1) {
        nearest = visited.indexOf(false)
        nearestDist = matrix[current][nearest]
      }
      visited[nearest] = true
      order.push(nearest)
      total += Number.isFinite(nearestDist) ? nearestDist : 0
      current = nearest
    }

    if (!best || total < best.totalSeconds) {
      best = { order, totalSeconds: total }
    }
  }

  return best!
}
