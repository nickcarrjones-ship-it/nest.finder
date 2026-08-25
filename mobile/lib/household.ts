import { ref, set, serverTimestamp } from 'firebase/database';
import { auth, db } from './firebase';
import type { Profile } from './types';

/**
 * The client side of the household backend (functions/index.js's
 * createHousehold/joinHousehold, deployed 2026-08-24). Two different
 * trust levels, matching how the server actually enforces them:
 *
 *   - Creating/joining a household is NEVER a direct database write from
 *     here — always through the Cloud Functions, which hold admin rights
 *     the database rules deliberately don't give any client.
 *   - Generating an INVITE CODE is a plain client write (same as the web
 *     app's existing partner-invite codes) — the rules already verify you
 *     can only create one pointing at a household you're actually in.
 */

const CREATE_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/createHousehold';
const JOIN_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/joinHousehold';

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in first.');
    this.name = 'NotSignedInError';
  }
}

export class HouseholdError extends Error {
  code: string;
  constructor(code: string) {
    super(HouseholdError.messageFor(code));
    this.name = 'HouseholdError';
    this.code = code;
  }
  static messageFor(code: string): string {
    switch (code) {
      case 'already_in_household': return "You're already in a household.";
      case 'profile_invalid': return "Add at least one person's workplace first.";
      case 'code_invalid': return 'That code doesn’t look right — codes are 6–8 letters and numbers.';
      case 'code_not_found': return "That code wasn't found — check it and try again.";
      case 'code_expired': return 'That code has expired — ask for a new one.';
      case 'household_not_found': return "That household doesn't exist any more.";
      case 'already_a_member': return "You're already in that household.";
      case 'household_full': return 'That household already has 4 people in it.';
      default: return 'Something went wrong — try again.';
    }
  }
}

async function callHouseholdFn<T>(url: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();
  const idToken = await user.getIdToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HouseholdError(data?.error ?? 'unknown');
  return data as T;
}

export function createHousehold(profile: Profile): Promise<{ householdId: string }> {
  return callHouseholdFn(CREATE_URL, { profile });
}

export function joinHousehold(code: string): Promise<{ householdId: string; profile: Profile | null }> {
  return callHouseholdFn(JOIN_URL, { code: code.trim().toUpperCase() });
}

// Excludes O/0 and I/1 — a code someone reads aloud or copies by hand
// shouldn't hinge on telling those apart. Matches the server's
// /^[A-Z0-9]{6,8}$/ check (a subset of it, so always valid).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** Collision odds at 8 chars from a 33-letter alphabet are astronomically
 *  low (33^8, ~1.4 trillion) — not worth a retry loop for this app's scale. */
export async function createHouseholdInvite(householdId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();
  const code = randomCode();
  await set(ref(db, `householdInvites/${code}`), {
    createdBy: user.uid,
    householdId,
    createdAt: serverTimestamp(),
  });
  return code;
}
