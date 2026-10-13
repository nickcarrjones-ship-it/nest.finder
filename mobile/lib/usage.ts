/**
 * Anonymous usage counts (Nick, 2026-10-13: analytics before the public
 * TestFlight link goes out).
 *
 * First-party and deliberately small: a row says WHICH moment happened,
 * in which version of the app, on which install, and at most one number
 * or one short label. Never a uid, a name, an email, an area somebody
 * typed, or anything else they wrote. The install id is random, made on
 * the phone, and is not linked to the account anywhere.
 *
 * Rows go to `usage/` in the Realtime Database, which the rules
 * (database.rules.json) make write-once and unreadable from any client,
 * and which householdClaim (functions/index.js) prunes after
 * USAGE_RETENTION_DAYS. Switched off from Settings, declared in
 * privacy.html.
 *
 * Pure: the sending lives in store/usageTracker.ts.
 */

export const USAGE_EVENTS = [
  'app_open',
  'get_started',
  'household_set',
  'signed_in',
  'setup_answer',
  'setup_done',
  'commute_set',
  'tab_view',
  'ask_sent',
  'find_properties',
  'viewing_added',
  'scorecard_open',
  'household_joined',
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

export interface UsageProps {
  /** A small whole number: people in the household, commute minutes. */
  n?: number;
  /** A short label: which tab, which sign-in method. */
  k?: string;
}

export interface UsageRow {
  e: UsageEvent;
  /** The random install id. */
  i: string;
  /** App version, "1.1.0". */
  v: string;
  /** First characters of the over-the-air update id, or "embedded". */
  u: string;
  n?: number;
  k?: string;
}

/** Kept for about 13 months, so a year can be compared with the last. */
export const USAGE_RETENTION_DAYS = 400;

export const INSTALL_ID = /^[a-f0-9]{32}$/;
const VERSION = /^[0-9.]{1,12}$/;
const UPDATE = /^[a-z0-9]{1,12}$/;
const LABEL = /^[a-z0-9_]{1,24}$/;

/** Turns anything into a label the rules accept, or nothing. */
export function toLabel(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const k = raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  return LABEL.test(k) ? k : undefined;
}

/** 16 random bytes as 32 hex characters. */
export function installIdFrom(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The short form of an update id: "01a12be7…" → "01a12be7", none → "embedded". */
export function updateLabel(updateId: string | null | undefined): string {
  const short = (updateId ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return short || 'embedded';
}

/**
 * The row to send, or null when anything about it would be refused by the
 * database rules. Mirrors those rules exactly, so a bad row is dropped on
 * the phone instead of failing on the server.
 */
export function usageRow(
  event: UsageEvent,
  props: UsageProps,
  installId: string,
  version: string,
  update: string,
): UsageRow | null {
  if (!(USAGE_EVENTS as readonly string[]).includes(event)) return null;
  if (!INSTALL_ID.test(installId) || !VERSION.test(version) || !UPDATE.test(update)) return null;
  const row: UsageRow = { e: event, i: installId, v: version, u: update };
  if (props.n !== undefined) {
    const n = Math.round(props.n);
    if (Number.isFinite(n) && n >= 0 && n <= 999) row.n = n;
  }
  const k = toLabel(props.k);
  if (k) row.k = k;
  return row;
}
