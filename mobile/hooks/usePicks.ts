import { useEffect, useMemo, useRef, useState } from 'react';
import { useMapDataStore } from '../store/mapDataStore';
import { useProfileStore } from '../store/profileStore';
import { useAuthStore } from '../store/authStore';
import { useShortlistStore, type ShortlistEntry } from '../store/shortlistStore';
import { computeAreaBudgets } from '../lib/walkBudget';
import { computeAreaCandidates } from '../lib/ranking/candidates';
import { applyZone1Filter } from '../lib/ranking/zones';
import { applyRuleOuts } from '../lib/ranking/ruleOuts';
import { computeShortlist, rankingFingerprint } from '../lib/ranking/rank';
import { callAnthropicRanking, MonthlyLimitError, NotSignedInError } from '../lib/ranking/anthropicClient';
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
} {
  const status = useMapDataStore((s) => s.status);
  const stations = useMapDataStore((s) => s.stations);
  const journeyTimes = useMapDataStore((s) => s.journeyTimes);
  const profile = useProfileStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const entries = useShortlistStore((s) => s.entries);
  const cache = useShortlistStore((s) => s.cache);
  const setResult = useShortlistStore((s) => s.setResult);
  const setRankingError = useShortlistStore((s) => s.setRankingError);

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
    return applyRuleOuts(applyZone1Filter(grouped, profile.lifestyle), profile.areaCards);
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
    if (!cache) {
      setSettledFingerprint(fingerprint);
      return;
    }
    const t = setTimeout(() => setSettledFingerprint(fingerprint), SETTLE_MS);
    return () => clearTimeout(t);
  }, [fingerprint, cache]);

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
          return;
        }
        setRankingError(null);
        setResult(result.ranked, { fingerprint, ranked: result.ranked, computedAt: new Date().toISOString() });
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
        } else {
          setRankingError(
            `Couldn't rank these — showing commute order. (${err instanceof Error ? err.message : String(err)})`,
          );
        }
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
  const VISIBLE_PICKS = 10;

  // Everything the model ranked that we can place on a map. The full-list
  // screen shows all of it; the map and carousel take the top slice.
  const allPicks: PickWithLocation[] = useMemo(
    () =>
      entries
        .map((e: ShortlistEntry) => {
          const c = byName.get(e.neighbourhood);
          return c ? { ...e, lat: c.lat, lng: c.lng } : null;
        })
        .filter((p): p is PickWithLocation => p !== null),
    [entries, byName],
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

  return { picks, allPicks, ready: status === 'ready', provisional };
}
