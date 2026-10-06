import { useEffect, useRef } from 'react';
import { lookupListing } from '../lib/listingLookup';
import { useViewings } from './useViewings';
import { useViewingsStore } from '../store/viewingsStore';
import type { Viewing } from '../lib/viewings';

/** At most this many listings re-read per visit to the tab. */
const PER_VISIT = 10;

/**
 * Fills in the estate agent's name and number on properties saved before
 * the app read them (Nick, 2026-10-06: "allow them to phone them from the
 * app"). Quietly, one listing at a time, each one once: a listing with no
 * number is marked with an empty string, which the card reads as "no
 * number" and this reads as "already looked". Network failures are not
 * marked, so they are tried again on a later visit.
 *
 * If the server has not been updated yet, its answer has no agent fields
 * at all; that is not taken as "no number", so nothing is marked and the
 * next visit tries again.
 */
export function useAgentBackfill(viewings: Viewing[], ready: boolean): void {
  const { save, uid } = useViewings();
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!ready || !uid) return;
    const todo = viewings
      .filter((v) => v.source === 'rightmove' && v.listingUrl && v.agentPhone === undefined && !tried.current.has(v.id))
      .slice(0, PER_VISIT);
    if (todo.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const v of todo) {
        if (cancelled) return;
        tried.current.add(v.id);
        try {
          const listing = await lookupListing(v.listingUrl as string);
          if (!('agentPhone' in listing)) continue;
          // The stored copy as it is NOW, not as it was when this started,
          // so a note typed in the meantime is not overwritten.
          const latest = useViewingsStore.getState().get(v.id);
          if (!latest) continue;
          save({ ...latest, agentName: listing.agentName ?? '', agentPhone: listing.agentPhone ?? '' });
        } catch {
          // Offline or Rightmove slow: leave it unmarked for next time.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [viewings, ready, uid, save]);
}
