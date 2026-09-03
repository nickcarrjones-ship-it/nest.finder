import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useHouseholdStore } from '../store/householdStore';
import { useVerdictsStore, EMPTY_DRAFT, type DraftVerdict } from '../store/verdictsStore';
import { saveVerdict } from '../lib/verdictSync';
import { verdictKey, type Tier, type Verdict } from '../lib/verdicts';

interface Options {
  /** What the app claimed about this area when it suggested it. */
  suggested?: Verdict['suggested'];
}

/**
 * One person's verdict on one area: the working draft, and getting it
 * saved.
 *
 * Writes go out on the tap, not on a timer. They were debounced 700ms
 * while the score was a slider — a drag from 0 to 10 passes through eleven
 * values and none of the ones in between is a separate opinion — but a
 * pill is one discrete press, so there is nothing to wait for, and Nick
 * asked for exactly that: "press those pills and that then saves onto your
 * account" (2026-09-02).
 *
 * Still fire-and-forget: a save that fails must never interrupt someone
 * mid-card, and the local store keeps the answer for the session either
 * way. Signed out, nothing persists — the verdict still shows in the card
 * for the session, which is honest (they can see what they said) without
 * inventing an account to attach it to.
 */
export function useVerdict(area: string, memberId: string, opts: Options = {}) {
  const saved = useVerdictsStore((s) => s.verdicts[verdictKey(area, memberId)]);
  const put = useVerdictsStore((s) => s.put);

  const [draft, setDraft] = useState<DraftVerdict>(() => fromSaved(saved));

  /**
   * The draft as the SETTERS see it, which is not the same as the draft the
   * render sees.
   *
   * Every setter here has to read the previous draft to build the next one —
   * a score change has to know the old score to decide whether the reasons
   * still apply. The obvious way to get it is `setDraft(prev => …)`, and
   * that was the bug: each setter also called commit() from inside that
   * updater, and React runs updaters DURING RENDER. commit writes to the
   * verdicts store, so opening a card put a Zustand update in the middle of
   * MemberVerdict's own render and React refused it ("Cannot update a
   * component while rendering a different component", 2026-09-01).
   *
   * A ref carries the previous value instead, so the updaters go away and
   * the write happens in the event handler where it belongs. It also fixes
   * a quieter bug: React may call an updater more than once, which was
   * double-committing and double-scheduling the Firebase write.
   */
  const draftRef = useRef(draft);

  // Re-seed when the card switches to a different area or person. Keyed on
  // the identity pair rather than on `saved`, so a write-back of what we
  // just typed cannot clobber a note mid-keystroke.
  const identity = verdictKey(area, memberId);
  const lastIdentity = useRef(identity);
  useEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    const next = fromSaved(saved);
    draftRef.current = next;
    setDraft(next);
  }, [identity, saved]);

  const commit = useCallback(
    (next: DraftVerdict) => {
      // No tier, nothing to record. Everything else on the card only
      // qualifies a verdict that must already exist.
      if (next.tier === null) return;

      const verdict: Verdict = {
        area,
        memberId,
        tier: next.tier,
        reasons: next.reasons,
        // Firebase drops undefined but stores empty strings — send the key
        // only when there is something in it.
        ...(next.note.trim() ? { note: next.note.trim() } : {}),
        at: Date.now(),
        ...(opts.suggested ? { suggested: opts.suggested } : {}),
      };

      put(verdict);

      const user = useAuthStore.getState().user;
      if (!user) return; // Session-only while signed out. By design.
      saveVerdict(user.uid, useHouseholdStore.getState().householdId, verdict);
    },
    [area, memberId, put, opts.suggested],
  );

  /**
   * The one way the draft changes: build the next value from the last one,
   * store it, then record it. In that order, and none of it during render.
   */
  const apply = useCallback(
    (make: (prev: DraftVerdict) => DraftVerdict) => {
      const next = make(draftRef.current);
      draftRef.current = next;
      setDraft(next);
      commit(next);
    },
    [commit],
  );

  const update = useCallback(
    (patch: Partial<DraftVerdict>) => apply((prev) => ({ ...prev, ...patch })),
    [apply],
  );

  return {
    draft,
    setTier: useCallback(
      (tier: Tier) => {
        // Changing your mind clears reasons that no longer apply — leaving
        // a "too quiet" chip attached to a "loved it" would record
        // something nobody said. Any change of tier does it: the three
        // tiers each have their own chip set, or none.
        apply((prev) => ({
          ...prev,
          tier,
          reasons: tier === prev.tier ? prev.reasons : [],
        }));
      },
      [apply],
    ),
    setNote: useCallback((note: string) => update({ note }), [update]),
    toggleReason: useCallback(
      (id: string) => {
        apply((prev) => ({
          ...prev,
          reasons: prev.reasons.includes(id)
            ? prev.reasons.filter((r) => r !== id)
            : [...prev.reasons, id],
        }));
      },
      [apply],
    ),
  };
}

/**
 * Record a verdict from somewhere there is no room for the full card —
 * the Top Picks row. Not a hook, so it can be called from inside a list
 * renderer.
 *
 * Anything already recorded is PRESERVED. Someone who ruled Nunhead out in
 * the detail card, with reasons, and then softens to "maybe" from the list
 * has changed their mind, not withdrawn their explanation — rebuilding the
 * verdict from scratch here would silently drop the most valuable half of
 * it.
 */
export function recordQuickVerdict(
  area: string,
  memberId: string,
  tier: Tier,
  opts: { suggested?: Verdict['suggested'] } = {},
): void {
  const store = useVerdictsStore.getState();
  const existing = store.verdicts[verdictKey(area, memberId)];

  // Reasons belong to the tier they were given at — see setTier above.
  const keepReasons = existing && existing.tier === tier ? existing.reasons : [];

  const verdict: Verdict = {
    area,
    memberId,
    tier,
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

function fromSaved(saved: Verdict | undefined): DraftVerdict {
  if (!saved) return { ...EMPTY_DRAFT };
  return {
    tier: saved.tier,
    reasons: saved.reasons,
    note: saved.note ?? '',
  };
}
