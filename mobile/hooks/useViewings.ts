import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useHouseholdStore } from '../store/householdStore';
import { useViewingsStore } from '../store/viewingsStore';
import { deleteViewing, saveViewing } from '../lib/viewingSync';
import { deleteAllViewingVideos, scopeFor } from '../lib/viewingVideos';
import type { Viewing } from '../lib/viewings';

/**
 * Add, change and remove viewings without every screen repeating the
 * uid/householdId plumbing — the same job hooks/useVerdict.ts does for
 * verdicts, and the same order of operations.
 *
 * The store is written FIRST and Firebase second, deliberately not awaited.
 * Someone who has just typed an address and hit save should see the sheet
 * close, not a spinner waiting on a network they may not have — and the
 * record is already safe in memory either way. A failed write is silent by
 * design (see viewingSync.ts); the next edit re-sends the whole record.
 */
export function useViewings() {
  const user = useAuthStore((s) => s.user);
  const put = useViewingsStore((s) => s.put);
  const drop = useViewingsStore((s) => s.drop);

  const save = useCallback(
    (viewing: Viewing) => {
      put(viewing);
      if (user) void saveViewing(user.uid, useHouseholdStore.getState().householdId, viewing);
    },
    [put, user],
  );

  const remove = useCallback(
    (id: string) => {
      drop(id);
      if (user) {
        const householdId = useHouseholdStore.getState().householdId;
        void deleteViewing(user.uid, householdId, id);
        // Its videos go with it, so nothing is left behind in Storage.
        void deleteAllViewingVideos(scopeFor(user.uid, householdId), id);
      }
    },
    [drop, user],
  );

  return { save, remove, uid: user?.uid ?? null };
}
