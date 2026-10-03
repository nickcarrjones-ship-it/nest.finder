import type { PreferenceTag } from './similarity/tags';

/**
 * Planning a day out in an area (Nick, 2026-10-02/03): built from what the
 * household says it likes doing at weekends - brunch, a walk, the pub -
 * fitted to the hours they actually have ("actually I just have an
 * afternoon" must not plan a morning brunch), in time order, each stop a
 * short walk from the last. Shown as a swipeable day strip
 * (components/DayCard.tsx, option B of two mock-ups).
 *
 * PURE: the places come from Google via placesClient in the store; this
 * decides what to look for, when, and which result to take.
 */

export type Activity =
  | 'brunch' | 'coffee' | 'walk' | 'market' | 'shopping' | 'gallery' | 'lunch' | 'pub' | 'drinks' | 'dinner';

interface Spec {
  /** On the card: "Brunch", "A walk". */
  label: string;
  /** In a sentence: "brunch", "a walk", "the pub". */
  phrase: string;
  /** What Google is asked for. */
  query: string;
  /** Best start time, and the earliest and latest it makes sense to start (hours, 13.5 = 1:30pm). */
  prefer: number;
  earliest: number;
  latest: number;
  /** Roughly how long it takes, in minutes. */
  mins: number;
  /** How people say they like it. */
  words: RegExp;
}

export const ACTIVITIES: Record<Activity, Spec> = {
  // Starts by half eleven: a brunch at noon is lunch, and "just an afternoon"
  // must never be handed a brunch (Nick).
  brunch: { label: 'Brunch', phrase: 'brunch', query: 'brunch', prefer: 10, earliest: 9, latest: 11.5, mins: 75, words: /\bbrunch(?:es|ing)?\b/i },
  coffee: { label: 'Coffee', phrase: 'coffee', query: 'independent coffee shop', prefer: 9.5, earliest: 8, latest: 17, mins: 40, words: /\b(coffees?|caf[eé]s?|flat whites?)\b/i },
  walk: { label: 'A walk', phrase: 'a walk', query: 'park', prefer: 11.5, earliest: 8, latest: 18.5, mins: 60, words: /\b(walks?|walking|strolls?|parks?|the common|heath|green space|runs?|running)\b/i },
  market: { label: 'A market', phrase: 'a market', query: 'market', prefer: 11, earliest: 9, latest: 16, mins: 60, words: /\bmarkets?\b/i },
  shopping: { label: 'A browse', phrase: 'a browse round the shops', query: 'independent shops', prefer: 13.5, earliest: 10, latest: 17.5, mins: 60, words: /\b(shops|shopping|browse|browsing|boutiques?|vintage)\b/i },
  gallery: { label: 'A gallery', phrase: 'a gallery', query: 'art gallery', prefer: 14.5, earliest: 10, latest: 17, mins: 75, words: /\b(galler(?:y|ies)|museums?|exhibitions?|culture)\b/i },
  lunch: { label: 'Lunch', phrase: 'lunch', query: 'lunch restaurant', prefer: 13, earliest: 11.75, latest: 14.5, mins: 75, words: /\blunch(?:es)?\b/i },
  pub: { label: 'The pub', phrase: 'the pub', query: 'pub', prefer: 15.5, earliest: 12, latest: 22.5, mins: 75, words: /\b(pubs?|pints?|beer gardens?|beers?)\b/i },
  drinks: { label: 'Drinks', phrase: 'drinks', query: 'cocktail bar', prefer: 18, earliest: 17, latest: 23, mins: 75, words: /\b(drinks|cocktails?|bars?|wine bars?|wine)\b/i },
  dinner: { label: 'Dinner', phrase: 'dinner', query: 'restaurant', prefer: 19.5, earliest: 18, latest: 21.5, mins: 90, words: /\b(dinner|supper|evening meal|eat out|dine)\b/i },
};

const ORDER = Object.keys(ACTIVITIES) as Activity[];

/** The activities a piece of text mentions, in the order it mentions them. */
export function activitiesIn(text: string): Activity[] {
  const found: { a: Activity; at: number }[] = [];
  for (const a of ORDER) {
    const m = ACTIVITIES[a].words.exec(text);
    if (m) found.push({ a, at: m.index });
  }
  return found.sort((x, y) => x.at - y.at).map((f) => f.a);
}

/** What their area preferences suggest they would enjoy on a day out. */
const FROM_TAGS: Partial<Record<PreferenceTag, Activity>> = {
  cafe_culture: 'coffee',
  nightlife: 'drinks',
  good_restaurants: 'dinner',
  cosmopolitan: 'dinner',
  big_park_nearby: 'walk',
  lots_of_green: 'walk',
  family_area: 'walk',
  weekend_destination: 'market',
  independent_shops: 'shopping',
  local_and_lowkey: 'pub',
  quiet: 'pub',
};

export function activitiesFromTags(tags: readonly string[]): Activity[] {
  const out: Activity[] = [];
  for (const t of tags) {
    const a = FROM_TAGS[t as PreferenceTag];
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

// --- when they are free --------------------------------------------------

export interface Window {
  start: number;
  end: number;
  /** For the title: "A morning in", "An afternoon in"... */
  part: 'morning' | 'afternoon' | 'evening' | 'day';
}

/** "2pm", "2:30", "14:00" -> hours. Bare 1-7 are afternoons; 8-11 mornings. */
function hourOf(h: string, m: string | undefined, ap: string | undefined): number {
  let hour = Number(h) + (m ? Number(m) / 60 : 0);
  const mer = ap?.toLowerCase();
  if (mer === 'pm' && hour < 12) hour += 12;
  else if (mer === 'am' && hour >= 12) hour -= 12;
  else if (!mer && hour >= 1 && hour < 8) hour += 12;
  return hour;
}

const T = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?';

/**
 * The hours they have. Named parts of the day, "from 2", "until 5",
 * "2 to 6"; a whole day if they say nothing about it.
 */
export function parseWindow(said: string): Window {
  const s = said.toLowerCase();
  /**
   * A range: "between 2 and 6" (Nick, 2026-10-03 - read as a plain
   * "afternoon", so the day began at 12), "2 to 6", "2-6pm", "from 2 till
   * 6". "and" only counts after "between", so "2 and 6 year olds" is not
   * a time.
   */
  const between = new RegExp(`\\bbetween\\s+${T}\\s*(?:and|-|–|to)\\s*${T}`).exec(s);
  const range = between ?? new RegExp(`\\b(?:from\\s+)?${T}\\s*(?:-|–|to|until|till)\\s*${T}`).exec(s);
  if (range && (between || range[3] || range[6] || /\bfrom\b/.test(s) || /\d\s*[-–]\s*\d/.test(s))) {
    const start = hourOf(range[1], range[2], range[3]);
    const end = hourOf(range[4], range[5], range[6]);
    if (end > start) return { start, end, part: partOf(start, end) };
  }
  let start: number | null = null;
  let end: number | null = null;
  const from = new RegExp(`\\b(?:from|after|after about|starting(?: at)?)\\s+${T}`).exec(s);
  if (from) start = hourOf(from[1], from[2], from[3]);
  const until = new RegExp(`\\b(?:until|till|before|by)\\s+${T}`).exec(s);
  if (until) end = hourOf(until[1], until[2], until[3]);

  const morning = /\bmorning\b/.test(s);
  const afternoon = /\bafternoon\b/.test(s);
  const evening = /\b(evening|tonight|night|after work)\b/.test(s);
  const allDay = /\b(all day|whole day|full day)\b/.test(s);

  let base: Window = { start: 9.5, end: 21.5, part: 'day' };
  if (!allDay) {
    if (morning && afternoon) base = { start: 9, end: 18, part: 'day' };
    else if (afternoon && evening) base = { start: 12, end: 22.5, part: 'day' };
    else if (morning) base = { start: 9, end: 12.75, part: 'morning' };
    else if (afternoon) base = { start: 12, end: 18, part: 'afternoon' };
    else if (evening) base = { start: 17.5, end: 23, part: 'evening' };
    else if (/\blunch ?time\b/.test(s)) base = { start: 11.5, end: 15, part: 'afternoon' };
  }
  const w = { start: start ?? base.start, end: end ?? base.end };
  if (w.end <= w.start + 1) return base;
  return { ...w, part: start !== null || end !== null ? partOf(w.start, w.end) : base.part };
}

function partOf(start: number, end: number): Window['part'] {
  if (end <= 13) return 'morning';
  if (start >= 17) return 'evening';
  if (start >= 11.5 && end <= 18.5) return 'afternoon';
  return 'day';
}

// --- the plan ----------------------------------------------------------

export interface PlannedSlot {
  activity: Activity;
  /** Start, in hours. */
  at: number;
}

const DEFAULTS: Record<Window['part'], Activity[]> = {
  morning: ['brunch', 'walk', 'market'],
  afternoon: ['walk', 'shopping', 'pub'],
  evening: ['drinks', 'dinner'],
  day: ['brunch', 'walk', 'pub', 'dinner'],
};

const fits = (a: Activity, w: Window) =>
  Math.max(ACTIVITIES[a].earliest, w.start) <= Math.min(ACTIVITIES[a].latest, w.end - ACTIVITIES[a].mins / 60);

/**
 * What to do and when. What they asked for in THIS message comes first,
 * then what they have told us they like, then what their area preferences
 * suggest, then a sensible day for the time they have. Only what fits the
 * window; one morning meal at most; no two of the same.
 */
export function planSlots(
  w: Window,
  asked: Activity[],
  likes: Activity[],
  fromTags: Activity[],
): PlannedSlot[] {
  const hours = w.end - w.start;
  const max = Math.min(5, Math.max(2, Math.round(hours / 2.3)));
  const chosen: Activity[] = [];
  const add = (a: Activity, force = false) => {
    if (chosen.includes(a) || !fits(a, w)) return;
    if (!force && chosen.length >= max) return;
    // One morning meal: brunch makes coffee and lunch redundant, and so on.
    if (a === 'coffee' && chosen.includes('brunch')) return;
    if (a === 'brunch' && (chosen.includes('lunch') || chosen.includes('coffee')) && !force) return;
    if (a === 'lunch' && chosen.includes('brunch')) return;
    chosen.push(a);
  };
  asked.forEach((a) => add(a, true));
  [...likes, ...fromTags, ...DEFAULTS[w.part]].forEach((a) => add(a));
  // A day with one thing in it is not a day out.
  if (chosen.length < 2) DEFAULTS.day.forEach((a) => add(a));

  // In time order, each starting once the last has finished and they have
  // walked to it - and dropped if it no longer fits the window.
  const sorted = chosen
    .map((a) => ({ a, want: clampHour(ACTIVITIES[a].prefer, Math.max(w.start, ACTIVITIES[a].earliest), Math.min(ACTIVITIES[a].latest, w.end)) }))
    .sort((x, y) => x.want - y.want);
  const slots: PlannedSlot[] = [];
  let free = w.start;
  for (const { a, want } of sorted) {
    const at = roundQuarter(Math.max(want, free));
    if (at > ACTIVITIES[a].latest + 0.01 || at + ACTIVITIES[a].mins / 60 > w.end + 0.26) continue;
    slots.push({ activity: a, at });
    free = at + ACTIVITIES[a].mins / 60 + 0.25;
  }
  return slots;
}

const clampHour = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundQuarter = (h: number) => Math.round(h * 4) / 4;

/** 13.5 -> "1:30pm", 10 -> "10am". */
export function clock(h: number): string {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const twelve = ((hr + 11) % 12) + 1;
  return `${twelve}${min ? `:${String(min).padStart(2, '0')}` : ''}${hr >= 12 ? 'pm' : 'am'}`;
}

// --- choosing among Google's results -----------------------------------

export interface Candidate {
  id: string;
  lat: number;
  lng: number;
  rating: number | null;
  ratingCount: number | null;
}

/** Minutes on foot, allowing a quarter for real streets. */
export function walkBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const metres = 2 * R * Math.asin(Math.sqrt(h));
  return Math.max(1, Math.round((metres * 1.25) / 80));
}

/**
 * The best place for a stop: well rated, but a short walk from the last
 * one beats a slightly better rating across town. Never one already used;
 * nothing further than about fifteen minutes from the area itself.
 */
export function choosePlace<T extends Candidate>(
  found: T[],
  area: { lat: number; lng: number },
  prev: { lat: number; lng: number } | null,
  used: Set<string>,
): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const p of found) {
    if (used.has(p.id) || walkBetween(area, p) > 15) continue;
    // A rating is only as good as the reviews behind it: pulled towards an
    // ordinary 4.0 until enough people agree, so five 5-stars cannot beat a
    // 4.5 from four hundred.
    const count = p.ratingCount ?? 0;
    const rating = ((p.rating ?? 4) * count + 4 * 50) / (count + 50);
    const walk = prev ? walkBetween(prev, p) : 0;
    const score = rating - walk * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

// --- the words -----------------------------------------------------------

const PART_TITLE: Record<Window['part'], string> = {
  morning: 'A morning in',
  afternoon: 'An afternoon in',
  evening: 'An evening in',
  day: 'A day in',
};

export function dayTitle(area: string, w: Window): string {
  return `${PART_TITLE[w.part]} ${area}`;
}

/** "Brunch, a walk, the pub, then dinner". */
export function daySubtitle(slots: PlannedSlot[]): string {
  const p = slots.map((s) => ACTIVITIES[s.activity].phrase);
  if (p.length <= 1) return cap(p.join(''));
  return cap(`${p.slice(0, -1).join(', ')}, then ${p[p.length - 1]}`);
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// --- changing a plan they have just seen ---------------------------------

/** Talks about WHEN: "actually just an afternoon", "from 2", "this evening". */
export function hasTimeWords(said: string): boolean {
  return /\b(morning|afternoon|evening|tonight|night|lunch ?time|after work|all day|whole day|full day)\b/i.test(said)
    || new RegExp(`\\b(?:from|after|until|till|before|by|between|starting(?: at)?)\\s+${T}`, 'i').test(said);
}

/** "No brunch", "skip the pub", "without the gallery". */
export function excludedIn(said: string): Activity[] {
  const out: Activity[] = [];
  for (const m of said.matchAll(/\b(?:no|skip|without|not|drop|lose)\s+(?:the\s+|a\s+|an\s+)?([a-z]+(?:\s+[a-z]+)?)/gi)) {
    for (const a of activitiesIn(m[1])) if (!out.includes(a)) out.push(a);
  }
  return out;
}

/**
 * A follow-up that changes the plan just shown rather than asking
 * something new: different hours, something added, something dropped,
 * or a plain "actually...".
 */
export function changesTheDay(said: string): boolean {
  return hasTimeWords(said) || excludedIn(said).length > 0
    || /\b(actually|instead|rather|only|just|add|swap|change)\b/i.test(said) && activitiesIn(said).length > 0;
}

/** One stop as the card shows it, kept with the message. */
export interface DayStopCard {
  activity: Activity;
  label: string;
  /** "10am". */
  time: string;
  /** Hours, for placing it on the morning-to-evening line. */
  at: number;
  placeId: string;
  name: string;
  /** "Café", "Pub", "Italian". */
  kind: string | null;
  rating: number | null;
  photoUrl: string | null;
  mapsUrl: string;
  /** Minutes on foot from the stop before; null for the first. */
  walkFromPrev: number | null;
  /** Dinner only: the restaurant's own site to book on, or its Maps page. */
  bookUrl: string | null;
  phone: string | null;
}

export interface DayCardData {
  title: string;
  subtitle: string;
  start: number;
  end: number;
  stops: DayStopCard[];
}

/** The answer above the card: the day in a sentence or two. */
export function describeDay(area: string, card: DayCardData): string {
  if (!card.stops.length) return `I couldn't find enough well-rated places near ${area} for that. Try a different time, or another area.`;
  const steps = card.stops.map((s) => `${ACTIVITIES[s.activity].phrase} at ${s.name} (${s.time})`);
  const day = steps.length === 1 ? steps[0] : `${steps.slice(0, -1).join(', ')}, then ${steps[steps.length - 1]}`;
  const book = card.stops.some((s) => s.bookUrl) ? ' Tap Book a table on the dinner card to reserve.' : '';
  return `${card.title}: ${day}. Each stop is a short walk from the last.${book}`;
}
