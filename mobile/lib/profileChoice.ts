import type { Profile } from './types';

/**
 * Deciding between the profile saved against an account and the one someone
 * has just typed in.
 *
 * Signing in used to overwrite local state with whatever Firebase held, in
 * silence. That is right for a returning user opening the app, and wrong
 * for the case Nick hit (2026-08-31): he entered his and Harriet's names
 * and both workplaces, signed in, and watched all of it vanish behind an
 * old saved profile — a single dummy person at Canary Wharf. Every
 * suggestion after that was computed for the wrong household, which is why
 * the picks looked broken rather than merely stale.
 *
 * The app cannot tell "I'm coming back" from "I'm starting again" on its
 * own, so it stops guessing and asks.
 */

/** A person's identity for comparison: who they are and where they work. */
function memberKey(m: { name: string; workId: string }): string {
  return `${m.name.trim().toLowerCase()}|${m.workId}`;
}

/**
 * Whether these two profiles describe a materially different household.
 *
 * Compares who is in it and where they work — the answers that change which
 * areas are reachable. Deliberately ignores lifestyle, saved areas and
 * commute minutes: those are preferences that legitimately drift between
 * sessions, and asking about a changed slider would turn a rare, meaningful
 * question into a nag.
 */
export function profilesDiffer(a: Profile, b: Profile): boolean {
  const left = (a.members ?? []).map(memberKey).sort();
  const right = (b.members ?? []).map(memberKey).sort();
  if (left.length !== right.length) return true;
  return left.some((k, i) => k !== right[i]);
}

/**
 * Whether what is held locally is worth offering to keep.
 *
 * The seeded demo couple never counts: it is sample data the app invented,
 * not something anyone typed, so silently replacing it with a real saved
 * profile is exactly right and must not raise a question.
 */
export function isWorthKeeping(profile: Profile): boolean {
  return !profile.isDemo && (profile.members?.length ?? 0) > 0;
}

/** "Nick and Harriet" / "Nick, Harriet and Sam" / "Nick" */
export function describeMembers(profile: Profile): string {
  const names = (profile.members ?? []).map((m) => m.name.trim()).filter(Boolean);
  if (names.length === 0) return 'Nobody named yet';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Canary Wharf and Holborn" — where this household commutes to. */
export function describeWorkplaces(profile: Profile): string {
  const seen = new Set<string>();
  const places: string[] = [];
  for (const m of profile.members ?? []) {
    const label = m.workLabel?.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    places.push(label);
  }
  if (places.length === 0) return 'No workplaces set';
  if (places.length === 1) return places[0];
  return `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}`;
}
