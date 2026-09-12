import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useHouseholdStore } from '../store/householdStore';
import { useMustHavesStore } from '../store/mustHavesStore';
import { saveMustHaves } from '../lib/mustHavesSync';
import { makeMustHave, type MustHave } from '../lib/mustHaves';

/**
 * Edit the must-haves without every screen repeating the uid/householdId
 * plumbing — the same job useViewings does for viewings, and the same
 * order of operations: the store first, Firebase second and not awaited,
 * so a list reorders under the thumb rather than after a round trip.
 */
export function useMustHaves() {
  const user = useAuthStore((s) => s.user);
  const store = useMustHavesStore();

  const push = useCallback(
    (next: MustHave[], previous: MustHave[]) => {
      // Nothing actually changed — a tap on an already-top item's up
      // arrow, or a rename to the same words. No write.
      if (next === previous) return;
      if (user) void saveMustHaves(user.uid, useHouseholdStore.getState().householdId, next);
    },
    [user],
  );

  const add = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const previous = useMustHavesStore.getState().items;
      push(useMustHavesStore.getState().add(makeMustHave(trimmed)), previous);
    },
    [push],
  );

  const rename = useCallback(
    (id: string, text: string) => {
      const previous = useMustHavesStore.getState().items;
      push(useMustHavesStore.getState().rename(id, text), previous);
    },
    [push],
  );

  const remove = useCallback(
    (id: string) => {
      const previous = useMustHavesStore.getState().items;
      push(useMustHavesStore.getState().remove(id), previous);
    },
    [push],
  );

  const move = useCallback(
    (id: string, direction: -1 | 1) => {
      const previous = useMustHavesStore.getState().items;
      push(useMustHavesStore.getState().move(id, direction), previous);
    },
    [push],
  );

  return { items: store.items, hydrated: store.hydrated, add, rename, remove, move };
}
