import { useEffect, useMemo, useRef } from 'react';
import { useMapDataStore } from '../store/mapDataStore';
import { useProfileStore } from '../store/profileStore';
import { useAuthStore } from '../store/authStore';
import { useShortlistStore, type ShortlistEntry } from '../store/shortlistStore';
import { computeAreaBudgets } from '../lib/walkBudget';
import { computeAreaCandidates } from '../lib/ranking/candidates';
import { computeShortlist, rankingFingerprint } from '../lib/ranking/rank';
import { callAnthropicRanking } from '../lib/ranking/anthropicClient';
import { hasLifestyleSignal } from '../lib/lifestyleSignal';
import type { AreaCandidate } from '../lib/ranking/prompt';
import type { PickWithLocation } from '../components/PicksCarousel';
import identities from '../assets/data/area-identities.json';

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
export function usePicks(): { picks: PickWithLocation[]; ready: boolean } {
  const status = useMapDataStore((s) => s.status);
  const stations = useMapDataStore((s) => s.stations);
  const journeyTimes = useMapDataStore((s) => s.journeyTimes);
  const profile = useProfileStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const entries = useShortlistStore((s) => s.entries);
  const cache = useShortlistStore((s) => s.cache);
  const setResult = useShortlistStore((s) => s.setResult);

  const candidates = useMemo<AreaCandidate[]>(() => {
    if (status !== 'ready') return [];
    const budgets = computeAreaBudgets(stations, journeyTimes, profile);
    return computeAreaCandidates(budgets, identities);
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

  // The real ranking — only when signed in, and only re-run when the
  // fingerprint actually changes (guarded here too, not just inside
  // computeShortlist, so a signed-in user doesn't refire this on every
  // unrelated re-render while a request is already in flight).
  const inFlightFingerprint = useRef<string | null>(null);
  useEffect(() => {
    if (!user || candidates.length === 0 || !hasLifestyleSignal(profile.lifestyle)) return;
    const fingerprint = rankingFingerprint(
      profile,
      profile.lifestyle,
      profile.areaCards,
      candidates.map((c) => c.neighbourhood),
    );
    if (inFlightFingerprint.current === fingerprint) return;
    if (cache?.fingerprint === fingerprint) return; // already have this exact ranking
    inFlightFingerprint.current = fingerprint;

    computeShortlist(candidates, profile, profile.lifestyle, profile.areaCards, callAnthropicRanking, cache)
      .then((result) => {
        if (result.ranked.length === 0) return; // total failure — leave the placeholder standing
        setResult(result.ranked, { fingerprint, ranked: result.ranked, computedAt: new Date().toISOString() });
      })
      .catch(() => {
        // Not signed in (race with the guard above), network failure, proxy
        // error — any of these leave the walk-budget placeholder in place,
        // which is a genuinely fine result to show, not a broken screen.
      })
      .finally(() => {
        if (inFlightFingerprint.current === fingerprint) inFlightFingerprint.current = null;
      });
  }, [user, candidates, profile, cache, setResult]);

  const byName = useMemo(() => new Map(top10.map((c) => [c.neighbourhood, c])), [top10]);

  const picks: PickWithLocation[] = useMemo(
    () =>
      entries
        .map((e: ShortlistEntry) => {
          const c = byName.get(e.neighbourhood);
          return c ? { ...e, lat: c.lat, lng: c.lng } : null;
        })
        .filter((p): p is PickWithLocation => p !== null),
    [entries, byName],
  );

  return { picks, ready: status === 'ready' };
}
