import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useHouseholdStore } from '../store/householdStore';
import { useVerdictsStore, EMPTY_DRAFT, type DraftVerdict } from '../store/verdictsStore';
import { saveVerdict } from '../lib/verdictSync';
import {
  HIGH_EXTREME,
  LOW_EXTREME,
  verdictKey,
  type Verdict,
  type VerdictBasis,
} from '../lib/verdicts';

/** How long the score must stop moving before it is worth a write. Long
 *  enough to cover a drag across the whole scale, short enough that
 *  closing the card straight after a tap still saves. */
const SETTLE_MS = 700;

interface Options {
  /** Pre-set the basis when the app already knows they went. */
  defaultBasis?: VerdictBasis;
  /** What the app claimed about this area when it suggested it. */
  suggested?: Verdict['suggested'];
}

/**
 * One person's verdict on one area: the working draft, and getting it
 * saved.
 *
 * Writes are debounced because the score is a slider — dragging from 0 to
 * 10 passes through eleven values, and each one is not a separate opinion.
 * They are also fire-and-forget: a save that fails must never interrupt
 * someone mid-card, and the local store keeps the answer for the session
 * either way.
 *
 * Signed out, nothing persists — the verdict still shows in the card for
 * the session, which is honest (they can see what they said) without
 * inventing an account to attach it to.
 */
export function useVerdict(area: string, memberId: string, opts: Options = {}) {
  const saved = useVerdictsStore((s) => s.verdicts[verdictKey(area, memberId)]);
  const put = useVerdictsStore((s) => s.put);

  const [draft, setDraft] = useState<DraftVerdict>(() => fromSaved(saved, opts.defaultBasis));

  // Re-seed when the card switches to a different area or person. Keyed on
  // the identity pair rather than on `saved`, so a write-back of what we
  // just typed cannot clobber a note mid-keystroke.
  const identity = verdictKey(area, memberId);
  const lastIdentity = useRef(identity);
  useEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    setDraft(fromSaved(saved, opts.defaultBasis));
  }, [identity, saved, opts.defaultBasis]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback(
    (next: DraftVerdict) => {
      // No score, nothing to record. Everything else on the card only
      // qualifies a score that must already exist.
      if (next.score === null) return;

      const verdict: Verdict = {
        area,
        memberId,
        score: next.score,
        basis: next.basis,
        reasons: next.reasons,
        // Firebase drops undefined but stores empty strings — send the key
        // only when there is something in it.
        ...(next.note.trim() ? { note: next.note.trim() } : {}),
        at: Date.now(),
        ...(opts.suggested ? { suggested: opts.suggested } : {}),
      };

      put(verdict);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const user = useAuthStore.getState().user;
        if (!user) return; // Session-only while signed out. By design.
        saveVerdict(user.uid, useHouseholdStore.getState().householdId, verdict);
      }, SETTLE_MS);
    },
    [area, memberId, put, opts.suggested],
  );

  // A card closed inside the settle window must still save. Without this,
  // the commonest interaction there is — tap a score, close the card —
  // would be the one that loses it.
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      const user = useAuthStore.getState().user;
      const current = useVerdictsStore.getState().verdicts[verdictKey(area, memberId)];
      if (user && current) {
        saveVerdict(user.uid, useHouseholdStore.getState().householdId, current);
      }
    },
    [area, memberId],
  );

  const update = useCallback(
    (patch: Partial<DraftVerdict>) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        commit(next);
        return next;
      });
    },
    [commit],
  );

  return {
    draft,
    setScore: useCallback(
      (score: number) => {
        // Moving off an extreme clears reasons that no longer apply —
        // leaving a "too quiet" chip attached to an 8 would record
        // something nobody said.
        setDraft((prev) => {
          const keepReasons = polarityOf(score) === polarityOf(prev.score);
          const next = { ...prev, score, reasons: keepReasons ? prev.reasons : [] };
          commit(next);
          return next;
        });
      },
      [commit],
    ),
    setBasis: useCallback((basis: VerdictBasis) => update({ basis }), [update]),
    setNote: useCallback((note: string) => update({ note }), [update]),
    toggleReason: useCallback(
      (id: string) => {
        setDraft((prev) => {
          const reasons = prev.reasons.includes(id)
            ? prev.reasons.filter((r) => r !== id)
            : [...prev.reasons, id];
          const next = { ...prev, reasons };
          commit(next);
          return next;
        });
      },
      [commit],
    ),
  };
}

/**
 * Set a score from somewhere there is no room for the full card — the
 * Top Picks row, the station card. Not a hook, so it can be called from
 * inside a list renderer.
 *
 * Anything already recorded is PRESERVED. Someone who gave Nunhead a 1 in
 * the detail card, with reasons, and then nudges it to a 2 from the list
 * has changed their score, not withdrawn their explanation — rebuilding
 * the verdict from scratch here would silently drop the most valuable
 * half of it.
 */
export function recordQuickScore(
  area: string,
  memberId: string,
  score: number,
  opts: { basis?: VerdictBasis; suggested?: Verdict['suggested'] } = {},
): void {
  const store = useVerdictsStore.getState();
  const existing = store.verdicts[verdictKey(area, memberId)];

  // Reasons belong to the end of the scale they were given at. Keeping
  // "too quiet" on a score that has moved to an 8 would record something
  // nobody said.
  const keepReasons =
    existing && polarityOf(score) === polarityOf(existing.score) ? existing.reasons : [];

  const verdict: Verdict = {
    area,
    memberId,
    score,
    basis: opts.basis ?? existing?.basis ?? 'guess',
    reasons: keepReasons,
    ...(existing?.note ? { note: existing.note } : {}),
    at: Date.now(),
    ...(opts.suggested ?? existing?.suggested
      ? { suggested: opts.suggested ?? existing!.suggested }
      : {}),
  };

  store.put(verdict);

  const user = useAuthStore.getState().user;
  if (!user) return; // Session-only while signed out, same as the card.
  saveVerdict(user.uid, useHouseholdStore.getState().householdId, verdict);
}

function fromSaved(saved: Verdict | undefined, defaultBasis?: VerdictBasis): DraftVerdict {
  if (!saved) return { ...EMPTY_DRAFT, basis: defaultBasis ?? EMPTY_DRAFT.basis };
  return {
    score: saved.score,
    basis: saved.basis,
    reasons: saved.reasons,
    note: saved.note ?? '',
  };
}

/** Which end of the scale a score sits at, or null through the middle.
 *  Reads the thresholds from lib/verdicts rather than repeating them —
 *  a second copy would silently drift the day they get tuned. */
function polarityOf(score: number | null): 'low' | 'high' | null {
  if (score === null) return null;
  if (score <= LOW_EXTREME) return 'low';
  if (score >= HIGH_EXTREME) return 'high';
  return null;
}
