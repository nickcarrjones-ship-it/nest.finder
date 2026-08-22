import * as pc from 'polygon-clipping';

/**
 * Candidate strategies for merging a person's walking catchments into one
 * region, measured against each other on a real device.
 *
 * A naive n-ary union of ~380 real isochrones measured 1521ms on a Nothing
 * Phone — far too slow to sit behind a slider. These are the ways out, in
 * increasing order of how much they give up.
 */

export type Ring = number[][];
type MP = any;

const union = (polys: Ring[]): MP =>
  (pc as any).union(...polys.map((r) => [r]));

/** Douglas–Peucker. Isochrone outlines carry more detail than a map at
 *  city zoom can show, so dropping vertices costs nothing visible. */
export function simplify(ring: Ring, tolerance: number): Ring {
  if (ring.length < 5) return ring;
  const sqTol = tolerance * tolerance;
  const sqSegDist = (p: number[], a: number[], b: number[]) => {
    let x = a[0], y = a[1];
    let dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxSq = 0, idx = 0;
    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(ring[i], ring[first], ring[last]);
      if (sq > maxSq) { idx = i; maxSq = sq; }
    }
    if (maxSq > sqTol) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

/** Strategy 1 — what we measured at 1521ms. */
export const naive = (polys: Ring[]): MP => union(polys);

/** Strategy 2 — thin the outlines first, then the same single union. */
export const simplifyThenUnion = (polys: Ring[], tol = 0.0004): MP =>
  union(polys.map((r) => simplify(r, tol)));

/**
 * Strategy 3 — union neighbours first, then union the results.
 * Clipping cost grows faster than linearly with the number of overlapping
 * edges, so many small unions of nearby shapes beat one huge union of
 * everything. Cells are ~1km.
 */
export function gridThenUnion(polys: Ring[], cell = 0.012, tol = 0.0004): MP {
  const buckets = new Map<string, Ring[]>();
  for (const ring of polys) {
    let sx = 0, sy = 0;
    for (const p of ring) { sx += p[0]; sy += p[1]; }
    const cx = sx / ring.length, cy = sy / ring.length;
    const key = `${Math.floor(cx / cell)}:${Math.floor(cy / cell)}`;
    const b = buckets.get(key);
    if (b) b.push(ring); else buckets.set(key, [ring]);
  }
  const partials: MP[] = [];
  for (const group of buckets.values()) {
    const thinned = group.map((r) => simplify(r, tol));
    partials.push(thinned.length === 1 ? [[thinned[0]]] : union(thinned));
  }
  if (partials.length === 1) return partials[0];
  return (pc as any).union(...partials);
}

export function countPoints(mp: MP): number {
  return mp.reduce((s: number, poly: any) => s + poly[0].length, 0);
}
