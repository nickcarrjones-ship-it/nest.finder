import type { AreaCards, Lifestyle, Profile } from '../types';
import { buildRankingPrompt, type AreaCandidate } from './prompt';
import { parseRankingResponse, type RankedArea } from './parse';
import { rankingFingerprint, isCacheValid, type RankingCacheEntry } from './cache';
import { shortlistByAnchor, type AnchorEvidence } from './anchor';

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
 * structured data, not open-ended reasoning.
 *
 * THIS COMMENT WAS WRONG FROM 2026-08-26 TO 2026-09-23, and it is worth
 * saying why rather than quietly fixing the numbers. It described Haiku at
 * $1/$5 and a batch size of 50. The code had meanwhile moved to
 * claude-sonnet-5 at $2/$10 and BATCH_SIZE 120, and neither change came
 * back to update the arithmetic here. Nick reasonably believed a full run
 * cost about 6p; a model-led run at a 50-minute limit was costing about
 * 23p, and closer to 46p while ranking was firing twice (see the shared
 * guard in hooks/usePicks.ts). A number written down in a comment gets
 * believed, so a stale one is worse than none.
 *
 * It is back on Haiku 4.5 as of 2026-09-23 (Nick's call), so the model
 * named above is true again — but the figures below are rewritten from
 * the real batch size, and the thinking-token line is new.
 *
 * Batching: 120 areas per call — see BATCH_SIZE below for why 50 was
 * raised. At 283 areas (the 50-minute-limit case) that is 3 batches.
 *
 * Cost per full model-led run at 283 areas, chars converted at ~4:1:
 * ~38,000 input + up to 8,000 output per batch. On Haiku at $1/$5 that is
 * roughly **$0.08 per full run**, against ~$0.23 on Sonnet 5. An anchored
 * run — the common case, 15 areas, one batch — is under a penny.
 *
 * The thinking tokens matter as much as the price. Omitting the `thinking`
 * parameter on Sonnet 5 runs ADAPTIVE thinking at the default effort of
 * `high`, billed as output at $10/MTok, on a job this comment has always
 * described as classification. Haiku does no thinking unless explicitly
 * asked, so moving back also stops paying for reasoning nobody wanted.
 *
 * Caching (see cache.ts) means this is paid once per profile/lifestyle/
 * reachable-set combination, not once per screen visit — and since
 * 2026-09-22 that cache key is order-independent, so it survives a
 * relaunch instead of missing on every cold start.
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
  /**
   * The area their shortlist was matched against, or null when nobody
   * named one and every candidate went to the model instead.
   */
  anchor: string | null;
  /** Every area they named that the engine could measure. */
  anchors: string[];
  /**
   * Why each suggestion is on the list, keyed by neighbourhood.
   *
   * Empty on the model-led path, where there is no anchor and so no
   * resemblance to report — the UI must treat "no evidence" as a normal
   * state rather than a failure.
   */
  evidence: Record<string, AnchorEvidence>;
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
    // The evidence comes back WITH the cached ranking. This used to return
    // anchor: null and nothing else, so a returning user saw the same ten
    // areas with no reason for any of them.
    return {
      ranked: cached!.ranked,
      fromCache: true,
      batchesRun: 0,
      batchesFailed: 0,
      anchor: cached!.anchors?.[0] ?? null,
      anchors: cached!.anchors ?? [],
      evidence: cached!.evidence ?? {},
    };
  }

  /**
   * When they named an area they love, the DATA picks the shortlist and the
   * model only explains it — see anchor.ts. That is both the cheaper path
   * (one small batch rather than several large ones) and the more defensible
   * one, since the ordering becomes arithmetic anyone can trace rather than
   * a model's opinion.
   *
   * With no anchor there is nothing to be similar to, so every reachable
   * area goes to the model as before. That fallback exists for people new to
   * London, and is deliberately the expensive path used by the few.
   */
  const shortlist = shortlistByAnchor(
    candidates, areaCards, lifestyle?.anchorReason, undefined, lifestyle?.preferenceTags,
  );
  const toRank = shortlist ? shortlist.candidates : candidates;

  const chunks = batches(toRank, BATCH_SIZE);
  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const { system, user } = buildRankingPrompt(chunk, lifestyle, areaCards, shortlist?.evidence);
      const raw = await callModel(system, user);
      // Only the areas this batch actually asked about may come back — see
      // validate() in parse.ts. Without it a hallucinated or misread name
      // becomes a pin on the map.
      const allowed = new Set(chunk.map((c) => c.neighbourhood));
      return parseRankingResponse(raw, allowed).ranked;
    }),
  );

  const ranked: RankedArea[] = [];
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') ranked.push(...r.value);
    else failed++;
  }

  /**
   * Order by the SAME number the card badges (matchStrength bands
   * evidence.score), not by the model's 1-10.
   *
   * Two things were wrong with sorting on the model's score here. It
   * contradicted the badge — Colliers Wood sat sixth reading "Strong match"
   * above five "Potential"s, which is unreadable: a list that is ordered is
   * already claiming a ranking, and a grade that disagrees with the position
   * just tells the user one of the two is lying (Nick, 2026-09-07). And the
   * model's scores are not comparable to each other anyway, because the
   * areas go up in parallel batches — a 7 from one call and a 7 from another
   * were never weighed against each other.
   *
   * It also contradicted the comment fifteen lines above this one: when
   * there's an anchor, the data is supposed to pick AND order, with the
   * model only explaining. Now it does. Position and badge are the same
   * measurement, so the first card can never be a weaker match than the
   * sixth.
   *
   * With no anchor there is no similarity to sort on, so the model's order
   * is the only one available — and no evidence means no badge, so there's
   * nothing for it to contradict.
   */
  if (shortlist) {
    const ev = shortlist.evidence;
    ranked.sort(
      (a, b) => (ev[b.neighbourhood]?.score ?? 0) - (ev[a.neighbourhood]?.score ?? 0),
    );
  } else {
    ranked.sort((a, b) => b.score - a.score);
  }
  return {
    ranked,
    fromCache: false,
    batchesRun: chunks.length,
    batchesFailed: failed,
    anchor: shortlist?.anchor ?? null,
    anchors: shortlist?.anchors ?? [],
    // Empty on the model-led path — no anchor means no resemblance to
    // report, which is a normal state and not a failure.
    evidence: shortlist?.evidence ?? {},
  };
}

export { rankingFingerprint } from './cache';
export type { AreaCandidate } from './prompt';
export type { RankedArea } from './parse';
