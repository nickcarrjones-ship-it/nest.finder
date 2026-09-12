import { create } from 'zustand';
import { isValidMustHave, MAX_MUST_HAVES, moveMustHave, type MustHave } from '../lib/mustHaves';

/**
 * What the household will not compromise on, in priority order.
 *
 * In memory and hydrated from Firebase on sign-in, exactly like
 * viewingsStore — not persisted to the device. One person's edit has to
 * reach the other, so Firebase is the source of truth and a local copy
 * would only be something to reconcile.
 *
 * Every mutation returns the whole new list to the caller's hook, which
 * writes it to Firebase in one go. See mustHavesSync.ts for why the list
 * is written whole.
 */
interface MustHavesState {
  items: MustHave[];
  /** Set once by the Firebase load, so a screen can tell "none yet" from
   *  "not loaded yet" — an empty list and an unfinished fetch look
   *  identical otherwise, and the empty state is a whole screen of copy. */
  hydrated: boolean;

  hydrate: (items: MustHave[]) => void;
  add: (mustHave: MustHave) => MustHave[];
  rename: (id: string, text: string) => MustHave[];
  remove: (id: string) => MustHave[];
  move: (id: string, direction: -1 | 1) => MustHave[];
  clear: () => void;
}

export const useMustHavesStore = create<MustHavesState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: (items) => set({ items: items.filter(isValidMustHave), hydrated: true }),

  add: (mustHave) => {
    if (!isValidMustHave(mustHave)) return get().items;
    if (get().items.length >= MAX_MUST_HAVES) return get().items;
    const next = [...get().items, mustHave];
    set({ items: next });
    return next;
  },

  rename: (id, text) => {
    const trimmed = text.trim();
    if (!trimmed) return get().items;
    const next = get().items.map((m) => (m.id === id ? { ...m, text: trimmed } : m));
    set({ items: next });
    return next;
  },

  remove: (id) => {
    const next = get().items.filter((m) => m.id !== id);
    set({ items: next });
    return next;
  },

  move: (id, direction) => {
    const next = moveMustHave(get().items, id, direction);
    // moveMustHave hands back the SAME array when nothing moved, so a tap
    // on a disabled arrow never re-renders and never re-syncs.
    if (next !== get().items) set({ items: next });
    return next;
  },

  clear: () => set({ items: [], hydrated: false }),
}));
