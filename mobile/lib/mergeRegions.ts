import * as pc from 'polygon-clipping';
import { simplify, type Ring } from './mergeStrategies';

/**
 * Merging each person's walking catchments into one region — the only part
 * of the walk-budget map that can't be precomputed, because it depends on
 * their own commute settings.
 *
 * Measured on a Nothing Phone 3 with ~380 real isochrones: a single
 * all-at-once union took 1549ms, grouping neighbours first took 693ms. The
 * remaining problem wasn't the duration but that it blocked the screen —
 * 693ms of frozen UI reads as broken, where 693ms with a live spinner reads
 * as working.
 *
 * So this does the same grouped merge but yields to the event loop between
 * buckets. Wall-clock is a touch longer; the app stays responsive throughout,
 * which is what actually matters. Results are cached against the settings
 * that produced them, so the common case is no work at all.
 */

type MP = any;

const CELL = 0.012;      // ~1km buckets
const TOL = 0.0004;      // ~8m, well under a pixel at city zoom
// Yield on a time budget, not a fixed number of groups. Groups vary wildly in
// density — central London ones hold many overlapping catchments — so slicing
// by count let a single chunk run 200ms+ and visibly stall the screen.
// A ~24ms budget keeps any single blocking stretch to roughly one frame.
// Each yield costs real time on the RN timer queue, so yield as seldom as
// smoothness allows. 60ms slices give a handful of pauses across the whole
// merge rather than dozens.
const SLICE_MS = 60;

export interface MergeProgress {
  done: number;
  total: number;
}

const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 0));

function bucketise(polys: Ring[]): Ring[][] {
  const buckets = new Map<string, Ring[]>();
  for (const ring of polys) {
    let sx = 0, sy = 0;
    for (const p of ring) { sx += p[0]; sy += p[1]; }
    const key = `${Math.floor(sx / ring.length / CELL)}:${Math.floor(sy / ring.length / CELL)}`;
    const b = buckets.get(key);
    if (b) b.push(ring); else buckets.set(key, [ring]);
  }
  return [...buckets.values()];
}

/** Merge one person's catchments, yielding between chunks. */
export async function mergeRegionAsync(
  polys: Ring[],
  onProgress?: (p: MergeProgress) => void,
): Promise<MP> {
  const buckets = bucketise(polys);
  // Densest groups first: the expensive work lands early, so the progress
  // reading slows down at the start and accelerates, rather than appearing
  // to hang near the end.
  buckets.sort((a, b) => b.length - a.length);
  const partials: MP[] = [];

  let sliceStart = Date.now();
  for (let i = 0; i < buckets.length; i++) {
    const group = buckets[i];
    const thinned = group.map((r) => simplify(r, TOL));
    partials.push(
      thinned.length === 1
        ? [[thinned[0]]]
        : (pc as any).union(...thinned.map((r) => [r])),
    );
    if (Date.now() - sliceStart >= SLICE_MS) {
      onProgress?.({ done: i + 1, total: buckets.length });
      await yieldToUI();
      sliceStart = Date.now();
    }
  }
  onProgress?.({ done: buckets.length, total: buckets.length });

  if (partials.length === 0) return [];
  if (partials.length === 1) return partials[0];

  // ONE n-ary union, never a pairwise fold. polygon-clipping sweeps all
  // inputs together in a single pass; folding them one at a time instead
  // re-processes the accumulated shape on every step and turns a ~700ms
  // job into ~14s. Measured, painfully.
  return (pc as any).union(...partials);
}

/**
 * Merge every person's region, then keep only where they all overlap —
 * everyone has to be able to live there, which is the whole point of the app.
 */
export async function computeSharedRegionAsync(
  perPerson: Ring[][],
  onProgress?: (p: MergeProgress) => void,
): Promise<MP> {
  const regions: MP[] = [];
  for (let i = 0; i < perPerson.length; i++) {
    regions.push(
      await mergeRegionAsync(perPerson[i], (p) =>
        onProgress?.({
          done: p.done + i * p.total,
          total: p.total * perPerson.length,
        }),
      ),
    );
  }
  if (regions.length === 1) return regions[0];
  let shared = regions[0];
  for (let i = 1; i < regions.length; i++) {
    shared = (pc as any).intersection(shared, regions[i]);
    await yieldToUI();
  }
  return shared;
}

/**
 * Small LRU keyed by the settings that produced the region. Changing a limit
 * and changing it back should be instant, which is the realistic pattern when
 * someone is exploring.
 */
const CACHE_LIMIT = 8;
const cache = new Map<string, MP>();

export function cacheKey(parts: (string | number)[]): string {
  return parts.join('|');
}

export async function cachedSharedRegion(
  key: string,
  perPerson: Ring[][],
  onProgress?: (p: MergeProgress) => void,
): Promise<{ region: MP; cached: boolean }> {
  const hit = cache.get(key);
  if (hit) {
    // refresh recency
    cache.delete(key);
    cache.set(key, hit);
    return { region: hit, cached: true };
  }
  const region = await computeSharedRegionAsync(perPerson, onProgress);
  cache.set(key, region);
  if (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value as string);
  }
  return { region, cached: false };
}

export function clearRegionCache(): void {
  cache.clear();
}
