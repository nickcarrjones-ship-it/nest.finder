import type { AreaCards, Lifestyle, Profile } from '../types';
import { buildRankingPrompt, type AreaCandidate } from './prompt';
import { parseRankingResponse, type RankedArea } from './parse';
import { rankingFingerprint, isCacheValid, type RankingCacheEntry } from './cache';

/**
 * Orchestrates the shortlist: batch the reachable areas, prompt each batch,
 * merge and re-sort. Model I/O is injected rather than called directly —
 * there is no live path to Anthropic from mobile yet. That needs the
 * Firebase auth work (Week 3, not built), which gets an ID token to send
 * to the existing `anthropicMessages` Cloud Function the web app already
 * uses (js/anthropic-call.js). Injecting the caller means this file, its
 * batching, and its cost profile are all real and tested today; wiring the
 * live call later is a one-line change at the call site, not a rewrite.
 *
 * Model: Haiku 4.5 ($1/$5 per 1M tokens) — this is bulk classification over
 * structured data, not open-ended reasoning, matching what the web app
 * already uses for its equivalent task.
 *
 * Batching: ~50 areas per call keeps each request comfortably inside
 * Haiku's context and keeps a single bad response from losing the whole
 * ranking. At 283 areas (the 50-minute-limit case measured this session)
 * that's 6 batches plus one merge pass.
 *
 * Estimated cost per full run, verified by actually generating the prompt
 * text this module produces (283 areas — the real figure measured this
 * session at a 50-minute limit — batched at 6 x ~50) and converting chars
 * to tokens at the standard ~4:1 ratio: ~8,200 input + ~11,400 output
 * tokens -> input 8,200/1e6 * $1 = $0.008, output 11,400/1e6 * $5 = $0.057,
 * **~$0.065 (~£0.05) per full run**. A first estimate written before this
 * was checked said ~$0.13 — corrected here rather than left wrong, since
 * it's a real number in a comment, not a spoken aside. Scales down at
 * tighter commute limits — 30 minutes (34 areas) is roughly a single
 * batch. Caching (see cache.ts) means this is paid once per profile/
 * lifestyle/reachable-set combination, not once per screen visit.
 */

// Each batch is one request against the user's monthly allowance, so this
// is a cost lever, not just a tuning knob: at 50 a typical 50-minute
// commute cost FIVE requests every time preferences changed. 120 keeps a
// batch's JSON reply well inside MAX_TOKENS while cutting that to two.
export const BATCH_SIZE = 120;

export type ModelCaller = (system: string, user: string) => Promise<string>;

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ShortlistResult {
  ranked: RankedArea[];
  fromCache: boolean;
  batchesRun: number;
  batchesFailed: number;
}

/**
 * Ranks every candidate, using the cache when the inputs haven't changed.
 * A batch that fails (network error, unparseable response) is dropped
 * rather than aborting the whole shortlist — a partial ranking from 5 of 6
 * batches is still useful; an empty screen because one batch hiccuped is not.
 */
export async function computeShortlist(
  candidates: AreaCandidate[],
  profile: Profile,
  lifestyle: Lifestyle | undefined,
  areaCards: AreaCards | undefined,
  callModel: ModelCaller,
  cached: RankingCacheEntry | null,
): Promise<ShortlistResult> {
  const fingerprint = rankingFingerprint(
    profile, lifestyle, areaCards, candidates.map((c) => c.neighbourhood),
  );

  if (isCacheValid(cached, fingerprint)) {
    return { ranked: cached!.ranked, fromCache: true, batchesRun: 0, batchesFailed: 0 };
  }

  const chunks = batches(candidates, BATCH_SIZE);
  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const { system, user } = buildRankingPrompt(chunk, lifestyle, areaCards);
      const raw = await callModel(system, user);
      return parseRankingResponse(raw).ranked;
    }),
  );

  const ranked: RankedArea[] = [];
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') ranked.push(...r.value);
    else failed++;
  }

  ranked.sort((a, b) => b.score - a.score);
  return { ranked, fromCache: false, batchesRun: chunks.length, batchesFailed: failed };
}

export { rankingFingerprint } from './cache';
export type { AreaCandidate } from './prompt';
export type { RankedArea } from './parse';
