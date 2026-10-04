import placeData from '../assets/data/area-places.json';
import { allAreaNames } from './similarity/features';
import { normaliseName } from './ranking/normaliseName';

/**
 * Every place named in an answer, as the person would say it, in the order
 * they said it.
 *
 * Built for one job: counting the areas in "which areas are you already
 * considering?" so that naming five can be narrowed to a favourite three
 * (Nick, 2026-10-04). The Agent's own matcher (areaBrief.ts) answers with
 * STATIONS, which is right for looking things up and wrong for a button: it
 * finds "Crouch" in Crouch End and nothing at all in Muswell Hill. So this
 * reads the map's neighbourhood names as well, and gives back those.
 */

/**
 * Single words that are a place on the map AND ordinary English, or that
 * would be in nearly every answer. "London" above all: "south London"
 * would otherwise count as an area. Multi-word names never need this.
 */
const NOT_ON_THEIR_OWN = new Set([
  'london', 'bank', 'hook', 'ham', 'hurst', 'temple', 'lee', 'cyprus', 'upton', 'hatton',
  'north', 'south', 'east', 'west', 'central', 'common', 'park', 'green', 'hill',
]);

/** "not Croydon", "never Brixton": named, but as a no. */
const SAID_NO = /\b(not|never|no|hate|avoid|except|without|rather than|instead of)\b[^,.;]{0,12}$/;

let names: string[] | null = null;
function candidates(): string[] {
  if (names) return names;
  const all = new Set([...Object.keys(placeData as Record<string, unknown>), ...allAreaNames()]);
  // Longest first, so "Clapham Common" is never also read as "Clapham".
  names = [...all]
    .filter((n) => n.includes(' ') || !NOT_ON_THEIR_OWN.has(normaliseName(n)))
    .sort((a, b) => b.length - a.length);
  return names;
}

export function areasNamedIn(text: string): string[] {
  const hay = normaliseName(text.replace(/[-–]/g, ' '));
  const spans: [number, number][] = [];
  const hits: { name: string; at: number }[] = [];
  const seen = new Set<string>();
  for (const name of candidates()) {
    const needle = normaliseName(name.replace(/[-–]/g, ' '));
    if (needle.length < 3) continue;
    let at = wholePhrase(hay, needle, 0);
    while (at >= 0 && spans.some(([s, e]) => at < e && at + needle.length > s)) {
      at = wholePhrase(hay, needle, at + 1);
    }
    if (at < 0) continue;
    spans.push([at, at + needle.length]);
    if (SAID_NO.test(hay.slice(Math.max(0, at - 30), at))) continue;
    if (seen.has(needle)) continue;
    seen.add(needle);
    hits.push({ name, at });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}

/** Where `needle` sits in `hay` as a whole phrase, from `from`, or -1. */
function wholePhrase(hay: string, needle: string, from: number): number {
  const alnum = /[a-z0-9]/;
  for (let i = from; i <= hay.length; ) {
    const at = hay.indexOf(needle, i);
    if (at < 0) return -1;
    if (!alnum.test(hay[at - 1] ?? '') && !alnum.test(hay[at + needle.length] ?? '')) return at;
    i = at + 1;
  }
  return -1;
}
