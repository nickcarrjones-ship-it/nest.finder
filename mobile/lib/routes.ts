/**
 * How each person actually gets to work from an area (Nick, 2026-10-02:
 * "Whats our route to work from Earlsfield" got "I don't have route level
 * transport data"). The route comes from TfL via the tflRoute function -
 * the fastest journey on a Tuesday at 08:30, the same question the commute
 * minutes were built from - and is drawn as a map in the Ask
 * (components/RouteCard.tsx).
 *
 * Pure: the lookup itself is in lib/routeLookup.ts.
 */

export interface RouteLeg {
  /** TfL's mode id: tube, national-rail, bus, walking, dlr, elizabeth-line, overground, tram... */
  mode: string;
  /** Line or service: "Jubilee", "South Western Railway", "59". Empty for a walk. */
  line: string;
  from: string;
  to: string;
  mins: number;
  /** [lat, lng] along the track or road. */
  path: [number, number][];
}

export interface Route {
  mins: number;
  legs: RouteLeg[];
}

export interface PersonRoute {
  name: string;
  /** Where they work, as they named it. */
  office: string;
  route: Route;
}

export function isValidRoute(r: unknown): r is Route {
  const route = r as Route;
  return Boolean(
    route && typeof route.mins === 'number' && Array.isArray(route.legs) && route.legs.length > 0
      && route.legs.every((l) => typeof l.mode === 'string' && typeof l.mins === 'number' && Array.isArray(l.path)),
  );
}

// --- names -------------------------------------------------------------

/** Termini a Londoner names without the "London": nobody says "London Waterloo". */
const TERMINI = /^London (Waterloo( East)?|Victoria|Euston|Paddington|Liverpool Street|Charing Cross|Cannon Street|Marylebone|Fenchurch Street|King'?s Cross|St\.? Pancras( International)?|Blackfriars)\b/i;

/**
 * TfL's stop names, as a person would say them: "London Waterloo Rail
 * Station" is Waterloo, "Waterloo Station / Tenison Way" (a bus stop) is
 * Waterloo too. London Bridge keeps its "London" - that is its name.
 */
export function placeName(common: string): string {
  let s = (common || '').split(' / ')[0].trim();
  s = s.replace(/\s+(Rail|Underground|DLR|Overground|Tram|Elizabeth line|Bus)\s+Station$/i, '');
  s = s.replace(/\s+Station$/i, '');
  s = s.replace(/\s+\(London\)$/i, '');
  if (TERMINI.test(s)) s = s.replace(/^London\s+/i, '');
  return s;
}

// --- colours -----------------------------------------------------------

/**
 * TfL's own line colours (Nick, 2026-10-02) - Londoners read them before
 * the words. The Elizabeth line is TfL purple: an exception to the app's
 * no-purple rule for the same reason the Instagram button is one - it is
 * someone else's identity, and changing it would make it wrong.
 * National Rail has no TfL colour, so charcoal.
 */
const LINE_COLOURS: Record<string, string> = {
  bakerloo: '#B36305',
  central: '#E32017',
  circle: '#FFD300',
  district: '#00782A',
  'hammersmith & city': '#F3A9BB',
  jubilee: '#A0A5A9',
  metropolitan: '#9B0056',
  northern: '#000000',
  piccadilly: '#003688',
  victoria: '#0098D4',
  'waterloo & city': '#95CDBA',
  'elizabeth line': '#6950A1',
  dlr: '#00A4A7',
  liberty: '#61686B',
  lioness: '#F1B41C',
  mildmay: '#437EC1',
  suffragette: '#39B97A',
  weaver: '#972861',
  windrush: '#EF4D5E',
  'london overground': '#EE7C0E',
  tram: '#84B817',
};
const MODE_COLOURS: Record<string, string> = {
  bus: '#DC241F',
  'national-rail': '#3C4248',
  dlr: '#00A4A7',
  'elizabeth-line': '#6950A1',
  overground: '#EE7C0E',
  tram: '#84B817',
  walking: '#8A8F94',
};
/** Light colours need dark writing on a chip. */
const LIGHT = new Set(['#FFD300', '#F3A9BB', '#95CDBA', '#F1B41C', '#A0A5A9']);

export function lineColour(leg: Pick<RouteLeg, 'mode' | 'line'>): string {
  return LINE_COLOURS[leg.line.trim().toLowerCase()] ?? MODE_COLOURS[leg.mode] ?? '#3C4248';
}

export function chipTextColour(colour: string): string {
  return LIGHT.has(colour) ? '#1F262E' : '#FFFFFF';
}

/** Rail operators by the names on the departure boards. */
const OPERATORS: Record<string, string> = {
  'south western railway': 'SWR',
  'great western railway': 'GWR',
  'london northwestern railway': 'LNR',
  'greater anglia': 'Greater Anglia',
};

/** The few words on a chip: "Jubilee", "SWR", "59 bus", "walk". */
export function chipLabel(leg: RouteLeg): string {
  if (leg.mode === 'walking') return 'walk';
  if (leg.mode === 'bus') return `${leg.line} bus`;
  if (leg.mode === 'national-rail') return OPERATORS[leg.line.toLowerCase()] ?? leg.line;
  return leg.line || leg.mode;
}

// --- the question --------------------------------------------------------

/**
 * "What's our route to work from Earlsfield", "how would I get to work
 * from Balham", "which line would we take", "what's the commute like".
 */
export function asksForARoute(said: string): boolean {
  return /\b(routes?|commutes?|commuting|which lines?|what lines?|which trains?|get (?:us |me |them )?(?:to|into|in to) (?:work|the office|town)|journeys? (?:to|into) (?:work|town|the office)|travel (?:to|into) (?:work|town)|how (?:do|would|will|does|did|could|can|should) (?:i|we|you|they|\w+) get (?:to|into|in)\b)/i
    .test(said);
}

/**
 * A short follow-up that only swaps the place: "what about Tooting?", "and
 * Balham?", "how about Brixton then", or just "Tooting?". After a route
 * answer it means the same question about the new place (Nick, 2026-10-02).
 * The caller also rules out anything with a subject of its own - "what
 * about the pubs in Tooting" is about pubs.
 */
export function swapsThePlace(said: string): boolean {
  const words = said.trim().split(/\s+/).length;
  return /^\s*(and|what about|how about|what of|ok(?:ay)?,? (?:and|what about|how about)|same for|now|then)\b/i.test(said)
    || words <= 3;
}

// --- the answer ----------------------------------------------------------

const sameLeg = (a: RouteLeg, b: RouteLeg) =>
  a.mode === b.mode && a.line === b.line && placeName(a.from) === placeName(b.from) && placeName(a.to) === placeName(b.to);

/** A leg in words: "South Western Railway to Waterloo", "the Jubilee line to Canary Wharf". */
function legInWords(leg: RouteLeg): string {
  const to = placeName(leg.to);
  switch (leg.mode) {
    case 'walking':
      return `walk ${leg.mins} minute${leg.mins === 1 ? '' : 's'}`;
    case 'bus':
      return `the ${leg.line} bus to ${to}`;
    case 'national-rail':
      return `${leg.line || 'the train'} to ${to}`;
    case 'dlr':
      return `the DLR to ${to}`;
    case 'tram':
      return `the tram to ${to}`;
    default: {
      const line = leg.line || leg.mode;
      return `the ${/ line$/i.test(line) ? line : `${line} line`} to ${to}`;
    }
  }
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The route in a sentence or two, by name. A stretch everyone shares at
 * the start is said once ("you'd both take South Western Railway to
 * Waterloo"); then each person's own way on, with their total. A walk at
 * the very end is left to the map - "and then walk to the office" is true
 * of every commute.
 */
export function describeRoutes(area: string, people: PersonRoute[]): string {
  if (!people.length) return '';

  /** Legs worth saying: no stroll under 3 minutes, no walk at the end. */
  const worthSaying = (legs: RouteLeg[]) => {
    const out = legs.filter((l) => !(l.mode === 'walking' && l.mins < 3));
    while (out.length && out[out.length - 1].mode === 'walking') out.pop();
    return out;
  };

  /** "takes X", "walks 5 minutes and gets Y", "then Z". */
  const onwardWords = (legs: RouteLeg[], imperative: boolean) => {
    const parts: string[] = [];
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (leg.mode === 'walking') {
        const next = legs[i + 1];
        if (!next) break;
        parts.push(imperative
          ? `walk ${leg.mins} minutes, then ${legInWords(next)}`
          : `walks ${leg.mins} minutes and gets ${legInWords(next)}`);
        i++;
      } else if (parts.length === 0) {
        parts.push(imperative ? legInWords(leg) : `takes ${legInWords(leg)}`);
      } else {
        parts.push(`then ${legInWords(leg)}`);
      }
    }
    return parts.join(', ');
  };

  if (people.length === 1) {
    const [p] = people;
    return `From ${area}, take ${onwardWords(worthSaying(p.route.legs), true)}. About ${p.route.mins} minutes in all.`;
  }

  // How many legs, from the start, everybody shares.
  let shared = 0;
  const first = people[0].route.legs;
  while (
    shared < first.length
    && first[shared].mode !== 'walking'
    && people.every((p) => p.route.legs[shared] && sameLeg(p.route.legs[shared], first[shared]))
  ) shared++;

  const each = people.map((p) => {
    const rest = worthSaying(p.route.legs.slice(shared));
    const how = rest.length ? onwardWords(rest, false) : `is already there`;
    return `${p.name} ${how} (${p.route.mins} min in all)`;
  });
  const joined = each.length === 2 ? `${each[0]}, and ${each[1]}` : joinAnd(each);

  if (shared > 0) {
    const start = first.slice(0, shared).map(legInWords);
    return `From ${area}, you'd ${people.length === 2 ? 'both' : 'all'} take ${joinAnd(start)}. Then ${joined}.`;
  }
  return `From ${area}, ${joined}.`;
}
