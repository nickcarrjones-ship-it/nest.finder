import { useEffect, useMemo, useRef, useState } from 'react';
import { useMapDataStore } from '../store/mapDataStore';
import { useProfileStore } from '../store/profileStore';
import { useAuthStore } from '../store/authStore';
import { useShortlistStore, type ShortlistEntry } from '../store/shortlistStore';
import { computeAreaBudgets } from '../lib/walkBudget';
import { computeAreaCandidates } from '../lib/ranking/candidates';
import { applyZone1Filter } from '../lib/ranking/zones';
import { applyRiverFilter } from '../lib/ranking/river';
import { applyRuleOuts } from '../lib/ranking/ruleOuts';
import { applyCommercialCoreFilter } from '../lib/ranking/commercialCore';
import { computeShortlist, rankingFingerprint } from '../lib/ranking/rank';
import {
  callAnthropicRanking,
  MonthlyLimitError,
  NotSignedInError,
  AIUnavailableError,
} from '../lib/ranking/anthropicClient';
import { hasLifestyleSignal } from '../lib/lifestyleSignal';
import type { AreaCandidate } from '../lib/ranking/prompt';
import type { PickWithLocation } from '../components/PicksCarousel';
import identities from '../assets/data/area-identities.json';

/** How long preferences must stop changing before a ranking run is worth
 *  spending requests on. Long enough to span a conversational turn. */
const SETTLE_MS = 20000;

/**
 * Shared by the map carousel and the Top Picks tab, so both read the same
 * candidate set rather than two screens computing it slightly differently.
 *
 * Nothing shows until the Agent chat has produced real signal (Nick's call,
 * 2026-08-23): showing a walk-budget-only placeholder immediately, before
 * anyone had said what they actually want, read as "the AI has already
 * decided" rather than "here's a starting point" — so now both tiers wait
 * for hasLifestyleSignal(profile.lifestyle) before touching the shortlist
 * store at all. Once that's true:
 *   1. Instant placeholder — sorted by walking budget — so the carousel
 *      doesn't sit empty while the first real ranking call is in flight.
 *   2. If signed in, the real AI ranking runs in the background and
 *      overwrites those entries once it resolves. Not signed in, or the
 *      call fails, and the placeholder simply stays — never a broken screen.
 *
 * Lifestyle preferences and loved/hated areas come from the Agent chat
 * (store/agentChatStore.ts writes them into profileStore as the
 * conversation goes) — read straight off the profile here, same as every
 * other ranking input.
 */
export function usePicks(): {
  picks: PickWithLocation[];
  allPicks: PickWithLocation[];
  ready: boolean;
  /** True while these are the commute placeholder, not a ranking. */
  provisional: boolean;
  /**
   * True while the ranking on screen is known to be out of date and a new
   * one is coming.
   *
   * The map must show NOTHING rather than the old list while this is true.
   * Someone finishing the conversation was shown the previous run's ten
   * areas, unchanged and unlabelled, for as long as it took the debounce
   * and the API call to complete — so the app appeared to have ignored
   * everything they had just said (Nick, 2026-09-01).
   */
  reranking: boolean;
  /** The areas they named, for the "10 areas like X and Y" header. */
  anchors: string[];
} {
  const status = useMapDataStore((s) => s.status);
  const stations = useMapDataStore((s) => s.stations);
  const journeyTimes = useMapDataStore((s) => s.journeyTimes);
  const profile = useProfileStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const entries = useShortlistStore((s) => s.entries);
  const cache = useShortlistStore((s) => s.cache);
  const evidence = useShortlistStore((s) => s.evidence);
  const anchors = useShortlistStore((s) => s.anchors);
  const setResult = useShortlistStore((s) => s.setResult);
  const setRankingError = useShortlistStore((s) => s.setRankingError);
  const rankNow = useShortlistStore((s) => s.rankNow);
  const clearRankNow = useShortlistStore((s) => s.clearRankNow);

  // The Zone 1 filter runs HERE, before anything downstream sees the list,
  // so the ranking fingerprint (built from candidate names) changes with it
  // and a cached ranking from before the question was answered is correctly
  // discarded rather than reused.
  const candidates = useMemo<AreaCandidate[]>(() => {
    if (status !== 'ready') return [];
    const budgets = computeAreaBudgets(stations, journeyTimes, profile);
    const grouped = computeAreaCandidates(budgets, identities);
    // Rule-outs are enforced HERE, on the candidate list, so they hold for
    // the walk-budget placeholder as well as the AI ranking. They used to
    // exist only as a line in the ranking prompt, which the placeholder
    // never saw — so the first thing someone was shown could be the area
    // they had just told us to avoid (Nick, 2026-08-30).
    // Office districts come out before anything else looks at them: no
    // amount of loving Shoreditch should ever surface Bank (Nick,
    // 2026-08-31). Applied first so the Zone 1 answer and the rule-outs
    // operate on places somebody could actually live.
    const habitable = applyCommercialCoreFilter(grouped);
    const onTheirSide = applyRiverFilter(habitable, profile.lifestyle);
    return applyRuleOuts(applyZone1Filter(onTheirSide, profile.lifestyle), profile.areaCards);
  }, [status, stations, journeyTimes, profile]);

  const top10 = useMemo(
    () => [...candidates].sort((a, b) => b.walkBudgetMins - a.walkBudgetMins).slice(0, 10),
    [candidates],
  );

  // Populating the store belongs in an effect, not the render body — calling
  // a setter directly here (as an earlier version of this hook did) is a
  // real bug, not a style nit: Zustand's setState is synchronous, so it
  // forced a second render of whichever screen was rendering at the time,
  // which React correctly flags as "update a component while rendering a
  // different component." Caught on-device from the map screen; the effect
  // form (below) only touches the store after render has already committed.
  useEffect(() => {
    if (hasLifestyleSignal(profile.lifestyle) && entries.length === 0 && top10.length > 0) {
      setResult(
        top10.map((c) => ({
          neighbourhood: c.neighbourhood,
          score: c.walkBudgetMins,
          reason: `${c.commuteMins} min commute, ${c.walkBudgetMins} min walking budget once you're there.`,
          confidence: 'low' as const,
        })),
        null,
      );
    }
  }, [profile.lifestyle, entries.length, top10, setResult]);

  // What a ranking run would be FOR — recomputed on every change, cheap.
  const fingerprint = useMemo(
    () =>
      candidates.length === 0
        ? null
        : rankingFingerprint(profile, profile.lifestyle, profile.areaCards, candidates.map((c) => c.neighbourhood)),
    [profile, candidates],
  );

  // Ranking only happens once that has stopped changing for SETTLE_MS.
  // The Agent restates its whole understanding every turn, so preferences
  // change on every answer — and one ranking run is several proxy requests,
  // each counting against the monthly allowance. Ranking per turn spent a
  // month's worth inside a single conversation (Nick hit the cap,
  // 2026-08-26). Waiting collapses that to one run once the conversation
  // stops, and the map still updates without being asked.
  const [settledFingerprint, setSettledFingerprint] = useState<string | null>(null);
  useEffect(() => {
    if (!fingerprint) return;
    // The FIRST ranking runs immediately. The debounce exists to stop a
    // ranking per conversational turn (Nick hit the monthly cap that way,
    // 2026-08-26) — but that assumed the conversation itself took long
    // enough to cover it. Setup is now fast, and every tap question writes
    // to the profile and restarts the timer, so someone finished setup and
    // landed on the map with the ranking not yet started — looking at the
    // walk-budget placeholder and reasonably taking it for the answer.
    //
    // Nothing has been ranked yet, so there is nothing to re-rank: running
    // at once costs exactly one run, the one they are waiting for. Later
    // edits still debounce.
    //
    // rankNow is the same argument from the other end: someone has pressed
    // "See my areas", so there is no next turn to wait for. Consumed once,
    // so later edits still debounce.
    if (!cache || rankNow) {
      setSettledFingerprint(fingerprint);
      if (rankNow) clearRankNow();
      return;
    }
    const t = setTimeout(() => setSettledFingerprint(fingerprint), SETTLE_MS);
    return () => clearTimeout(t);
  }, [fingerprint, cache, rankNow, clearRankNow]);

  /**
   * Fingerprints we tried and could not rank.
   *
   * Without this, a failed run would leave the map blank forever: the cache
   * still holds the old fingerprint, the profile still has the new one, so
   * "a new ranking is coming" would stay true with nothing on its way. On a
   * failure we fall back to showing the old list WITH the reason, which is
   * the existing honest behaviour — see the catch below.
   */
  const [failedFingerprint, setFailedFingerprint] = useState<string | null>(null);

  const inFlightFingerprint = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !fingerprint || !hasLifestyleSignal(profile.lifestyle)) return;
    if (settledFingerprint !== fingerprint) return; // still mid-conversation
    if (inFlightFingerprint.current === fingerprint) return;
    if (cache?.fingerprint === fingerprint) return; // already have this exact ranking
    inFlightFingerprint.current = fingerprint;

    computeShortlist(candidates, profile, profile.lifestyle, profile.areaCards, callAnthropicRanking, cache)
      .then((result) => {
        if (result.ranked.length === 0) {
          setRankingError('Every ranking request failed. Showing commute order instead.');
          setFailedFingerprint(fingerprint);
          return;
        }
        setRankingError(null);
        setResult(
          result.ranked,
          {
            fingerprint,
            ranked: result.ranked,
            computedAt: new Date().toISOString(),
            // Cached WITH the ranking so a returning user still gets told
            // why each area is on their list.
            evidence: result.evidence,
            anchors: result.anchors,
          },
          result.evidence,
          result.anchors,
        );
      })
      .catch((err: unknown) => {
        /**
         * The placeholder stays either way — a usable list beats a blank
         * screen. What changed is that the reason is no longer thrown away.
         *
         * A bare catch here meant a ranking that never ran looked exactly
         * like a ranking that ran and chose badly, so raw commute order read
         * as a considered recommendation. That is how the areas around
         * Canary Wharf looked like a decision (Nick, 2026-08-31).
         */
        if (err instanceof MonthlyLimitError) {
          setRankingError(
            "You've used this month's AI allowance, so these are ordered by commute, not by fit.",
          );
        } else if (err instanceof NotSignedInError) {
          setRankingError('Sign in to have these ranked by what suits you.');
        } else if (err instanceof AIUnavailableError) {
          setRankingError("The Agent's taking a breather, so these are ordered by commute for now.");
        } else {
          setRankingError(
            `Couldn't rank these — showing commute order. (${err instanceof Error ? err.message : String(err)})`,
          );
        }
        // Stops the "considering" state waiting for something that is not
        // coming, and puts the old list back with the reason attached.
        setFailedFingerprint(fingerprint);
        console.warn('[ranking] failed:', err);
      })
      .finally(() => {
        if (inFlightFingerprint.current === fingerprint) inFlightFingerprint.current = null;
      });
  }, [user, candidates, profile, cache, setResult, setRankingError, fingerprint, settledFingerprint]);

  // Built from ALL candidates, not top10 — 2026-08-26. It used to be top10,
  // which silently dropped every AI-ranked area outside the ten highest walk
  // budgets: since walk budget is derived from commute time, the visible
  // picks were being pre-filtered by commute no matter what the model
  // decided. That made ranking on lifestyle fit impossible to see, which is
  // the entire point of the Agent conversation. The placeholder above still
  // uses top10 deliberately — before there's any AI ranking, walking budget
  // is the only honest ordering available.
  const byName = useMemo(
    () => new Map(candidates.map((c) => [c.neighbourhood, c])),
    [candidates],
  );

  // How many make it onto the MAP and the carousel. The ranking still
  // considers every reachable area — this is purely how many are drawn.
  //
  // There used to be an accidental cap of 10 here: picks were matched
  // against the ten highest walk budgets, so anything the model ranked
  // outside those was silently dropped. Fixing that (walk budget is a
  // commute proxy, and was quietly overriding the lifestyle ranking) also
  // removed the cap, and ~38 numbered pins landed on the map at once
  // (Nick, 2026-08-27). Ten is now a deliberate display limit rather than
  // a side effect of a bug.
  // Five, not ten (Nick, 2026-09-07). Ten is more than anyone weighs up at
  // once, and a list that long makes the bottom half look like padding —
  // which it was: the tail is where the weakest matches sit. Five is a
  // shortlist you can actually hold in your head and go and look at.
  // The ranking still considers every reachable area; this is display only.
  const VISIBLE_PICKS = 5;

  // Everything the model ranked that we can place on a map. The full-list
  // screen shows all of it; the map and carousel take the top slice.
  const allPicks: PickWithLocation[] = useMemo(
    () =>
      entries
        .map((e: ShortlistEntry): PickWithLocation | null => {
          const c = byName.get(e.neighbourhood);
          // `why` is undefined on the placeholder and on the model-led
          // path — the UI treats that as "no reason to show", not an error.
          return c ? { ...e, lat: c.lat, lng: c.lng, why: evidence[e.neighbourhood] } : null;
        })
        .filter((p): p is PickWithLocation => p !== null),
    [entries, byName, evidence],
  );

  const picks = useMemo(() => allPicks.slice(0, VISIBLE_PICKS), [allPicks]);

  /**
   * True while what is on screen is the walk-budget placeholder rather than
   * a ranking of any kind.
   *
   * Exposed because the two are NOT interchangeable and were being shown
   * identically. The placeholder is "the areas with the shortest commute to
   * your office" — it knows nothing about what anyone said they wanted, so
   * for someone working at Canary Wharf it is Canary Wharf and every DLR
   * stop around it. Presented as "your picks", that reads as the app having
   * considered their answers and chosen this, which is the single worst
   * thing it could imply (Nick, 2026-08-30).
   */
  const provisional = entries.length > 0 && cache === null;

  /**
   * A ranking is on its way and what we hold is not it.
   *
   * Covers both halves of the wait — the settle window AND the request
   * itself — because from the outside they are the same thing: the app
   * knows the list is wrong and has not replaced it yet.
   *
   * Only when a ranking could actually arrive. Signed out, or with no
   * lifestyle signal, nothing is coming and the list on screen is the best
   * there is going to be.
   */
  const reranking =
    !!user &&
    hasLifestyleSignal(profile.lifestyle) &&
    fingerprint !== null &&
    fingerprint !== failedFingerprint &&
    (cache === null || cache.fingerprint !== fingerprint);

  return { picks, allPicks, ready: status === 'ready', provisional, reranking, anchors };
}
