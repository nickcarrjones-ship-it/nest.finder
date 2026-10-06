import { asksForARoute } from '../routes';
import { asksForTheRest, rankingAsked, type ThemeId } from '../areaRanking';
import { friendTopic, type FriendTopic } from './friend';
import { areasAskedAbout } from './areaBrief';
import { normaliseName } from '../ranking/normaliseName';

/**
 * Follow-up questions after every answer, tailored to what was just
 * answered and to what has already been asked this session (Nick,
 * 2026-10-06: "designed to maximise the insights from the data the app
 * has").
 *
 * Built here, not written by the model, for three reasons. Every one is a
 * question the app answers from its own data (a TfL route map, Land
 * Registry prices, named schools, a planned day from real venues, an area
 * ranking, a comparison), so tapping one never lands on a guess. They cost
 * nothing and appear the instant the answer does. And a suggestion the
 * app then answers badly would be worse than none.
 *
 * Each one moves sideways from the last answer: same place, different
 * data, or same question, another of their areas. Never the same thing
 * twice in a session.
 */

/** What the last answer was, as far as suggesting the next question goes. */
export type LastAnswer =
  | { kind: 'route'; area: string }
  | { kind: 'ranking'; theme: ThemeId; winner: string | null; more: boolean }
  | { kind: 'day'; area: string }
  | { kind: 'topic'; area: string; topic: FriendTopic }
  | { kind: 'compare'; areas: [string, string]; topic: FriendTopic | null }
  | { kind: 'area'; area: string }
  | { kind: 'none' };

export interface FollowUpContext {
  /** The household's areas, loved first, then the shortlist. */
  areas: string[];
  /** Everything they have asked this session. */
  asked: string[];
  /** False when they said schools are not a factor. */
  schools: boolean;
}

/** Three is one line and a bit; more is a menu. */
const MAX_FOLLOW_UPS = 3;

/** Ranking questions, worded so rankingAsked() recognises each one. */
const RANK_QUESTION: Record<ThemeId, string> = {
  nightlife: 'Which of my areas is liveliest at night?',
  food: 'Which of my areas is best for food?',
  cafes: 'Which of my areas is best for cafés?',
  quiet: 'Which of my areas is quietest?',
  busy: 'Which of my areas is busiest?',
  young: 'Which of my areas has the youngest crowd?',
  families: 'Which of my areas is most family-friendly?',
  safety: 'Which of my areas is safest?',
  commute: 'Which of my areas has the shortest commute?',
};

/** After one ranking, the next most useful one to offer. */
const NEXT_THEME: Record<ThemeId, ThemeId[]> = {
  nightlife: ['quiet', 'food', 'safety'],
  food: ['nightlife', 'cafes', 'commute'],
  cafes: ['food', 'quiet', 'commute'],
  quiet: ['safety', 'families', 'nightlife'],
  busy: ['quiet', 'nightlife', 'food'],
  young: ['nightlife', 'food', 'quiet'],
  families: ['safety', 'quiet', 'commute'],
  safety: ['quiet', 'families', 'commute'],
  commute: ['nightlife', 'quiet', 'food'],
};

/** A friend-style topic as a word for a comparison: "X or Y for pubs?". */
const TOPIC_WORD: Partial<Record<FriendTopic, string>> = {
  drink: 'pubs',
  food: 'restaurants',
  cafe: 'cafés',
  shops: 'shops',
};

/** The topic's ranking, for "which of ALL my areas" after comparing two. */
const TOPIC_THEME: Partial<Record<FriendTopic, ThemeId>> = {
  drink: 'nightlife',
  food: 'food',
  cafe: 'cafes',
};

const route = (a: string) => `What's our route to work from ${a}?`;
const prices = (a: string) => `What do flats cost in ${a}?`;
const schools = (a: string) => `What are the schools like in ${a}?`;
const saturday = (a: string) => `Plan a Saturday in ${a}`;
const evening = (a: string) => `Plan an evening in ${a}`;
const pubs = (a: string) => `What are the pubs like in ${a}?`;
const brunch = (a: string) => `Where's good for brunch in ${a}?`;
const food = (a: string) => `What's the food like in ${a}?`;
const versus = (a: string, b: string, topic: FriendTopic | null) =>
  `${a} or ${b} for ${(topic && TOPIC_WORD[topic]) || 'pubs'}?`;

/** The next thing to try in the same place, after a question about one topic. */
function otherTopic(area: string, topic: FriendTopic): string {
  if (topic === 'drink') return brunch(area);
  if (topic === 'cafe') return food(area);
  return pubs(area);
}

export function followUpQuestions(last: LastAnswer, ctx: FollowUpContext): string[] {
  const other = (from: string) => ctx.areas.find((a) => !sameName(a, from)) ?? null;
  const school = (a: string) => (ctx.schools ? schools(a) : null);
  let candidates: (string | null)[] = [];

  switch (last.kind) {
    case 'route': {
      const y = other(last.area);
      candidates = [prices(last.area), y && route(y), saturday(last.area), pubs(last.area)];
      break;
    }
    case 'ranking': {
      const w = last.winner;
      const nightOut = last.theme === 'nightlife' || last.theme === 'food';
      candidates = [
        last.more ? 'Show me the rest of the order' : null,
        w && (nightOut ? evening(w) : saturday(w)),
        w && route(w),
        ...NEXT_THEME[last.theme]
          .filter((t) => ctx.schools || t !== 'families')
          .map((t) => RANK_QUESTION[t]),
      ];
      break;
    }
    case 'day': {
      const y = other(last.area);
      candidates = [route(last.area), prices(last.area), y && saturday(y), school(last.area)];
      break;
    }
    case 'topic': {
      const y = other(last.area);
      candidates = [
        otherTopic(last.area, last.topic),
        y && versus(last.area, y, last.topic),
        saturday(last.area),
        route(last.area),
      ];
      break;
    }
    case 'compare': {
      const [a, b] = last.areas;
      const theme = last.topic ? TOPIC_THEME[last.topic] : undefined;
      candidates = [theme ? RANK_QUESTION[theme] : RANK_QUESTION.nightlife, route(a), route(b), prices(a)];
      break;
    }
    case 'area': {
      const y = other(last.area);
      candidates = [
        route(last.area),
        prices(last.area),
        y && versus(last.area, y, 'drink'),
        saturday(last.area),
        school(last.area),
      ];
      break;
    }
    case 'none':
      return [];
  }

  const done = new Set(ctx.asked.map(intentOf));
  const out: string[] = [];
  for (const q of candidates) {
    if (!q) continue;
    const key = intentOf(q);
    if (done.has(key)) continue;
    done.add(key);
    out.push(q);
    if (out.length >= MAX_FOLLOW_UPS) break;
  }
  return out;
}

/**
 * What a question is really asking, so a suggestion is never something
 * already asked in other words: "how do we get to work from Balham" and
 * "What's our route to work from Balham?" are the same question.
 */
export function intentOf(question: string): string {
  const areas = areasAskedAbout(question).map(normaliseName);
  const place = areas[0] ?? '';
  if (asksForTheRest(question)) return 'rest';
  const theme = rankingAsked(question);
  if (theme) return `rank:${theme}`;
  if (asksForARoute(question)) return `route:${place}`;
  if (/\b(cost|costs|price|prices|pricey|expensive|cheap|afford)\b/i.test(question)) return `price:${place}`;
  if (/\bschools?\b/i.test(question)) return `schools:${place}`;
  if (/\bplan\b/i.test(question)) return `day:${place}`;
  const topic = friendTopic(question);
  if (topic && areas.length >= 2) return `compare:${[...areas].sort().join('|')}:${topic}`;
  if (topic) return `topic:${topic}:${place}`;
  return normaliseName(question);
}

function sameName(a: string, b: string): boolean {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (na === nb) return true;
  const ra = areasAskedAbout(a)[0];
  return ra !== undefined && ra === areasAskedAbout(b)[0];
}

/** The parts of a reply that say what kind of answer it was. */
export interface ReplyShape {
  route?: { area: string } | null;
  ranking?: { theme: ThemeId; rows: { name: string }[] } | null;
  day?: unknown;
  places?: unknown[] | null;
}

/**
 * What the last answer was, read from the reply itself and the question
 * that asked for it. `lastArea` and `lastDayArea` are the chat's own
 * memory of the place under discussion, for the answers that do not carry
 * it ("and the schools?").
 */
export function lastAnswerFrom(
  question: string,
  reply: ReplyShape,
  lastArea: string | null,
  lastDayArea: string | null,
): LastAnswer {
  if (reply.route) return { kind: 'route', area: reply.route.area };
  if (reply.ranking) {
    return {
      kind: 'ranking',
      theme: reply.ranking.theme,
      winner: reply.ranking.rows[0]?.name ?? null,
      more: reply.ranking.rows.length > 3,
    };
  }
  const named = areasAskedAbout(question);
  if (reply.day) {
    const area = lastDayArea ?? named[0] ?? lastArea;
    return area ? { kind: 'day', area } : { kind: 'none' };
  }
  const topic = friendTopic(question);
  if (named.length >= 2) return { kind: 'compare', areas: [named[0], named[1]], topic };
  const area = named[0] ?? lastArea;
  if (!area) return { kind: 'none' };
  if (topic && topic !== 'general' && reply.places?.length) return { kind: 'topic', area, topic };
  return { kind: 'area', area };
}
