import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The bit of AsyncStorage this needs, injectable — the same pattern
 * lib/ranking/rank.ts uses for the model call, and for the same reason:
 * the logic here is worth testing under plain Node, and a module-level
 * import of a native package is not testable there without mocking the
 * loader, which is a lot of machinery to verify some counting.
 */
export interface GapStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const deviceStorage: GapStorage = AsyncStorage;

/**
 * What people ask that we cannot answer.
 *
 * Nick's requirement (2026-09-07): "I need to be able to understand if
 * patterns pop up where people are asking questions the model is lacking,
 * so we can enhance it over time." The point is a data roadmap driven by
 * real demand rather than by guesswork about what a house-hunter wants.
 *
 * WHAT IS DELIBERATELY NOT STORED: the question. Not the wording, not a
 * paraphrase, not a user id. Logging what someone typed would make this a
 * pile of personal data needing a lawful basis, a purpose declared before
 * collection, and a retention policy — for a feature whose entire job is
 * answered by counting. "Twelve people asked about an area where we hold
 * no crime data" is the finding; which twelve, and how they phrased it,
 * adds nothing and costs a great deal.
 *
 * So a gap is a dimension name and a count. That shape is aggregate by
 * construction, which is the cheapest way to stay on the right side of the
 * privacy question in [[project_agent_learning_loop]] — you cannot leak
 * what you never held.
 *
 * ON DEVICE for now. Cross-user aggregation is the actual goal and needs a
 * Firebase path plus a rules deploy; this is the capture, and it is written
 * so that moving it later changes where it goes, not what is in it.
 */

const KEY = 'maloca-data-gaps';

export interface GapTally {
  /** Dimension or subject we hold nothing on, e.g. "schools near this area". */
  subject: string;
  count: number;
  /** How often answering it needed the model's own knowledge instead. */
  fellBackToModel: number;
  lastAt: number;
}

/** Areas are counted separately from subjects: "people keep asking about
 *  places we have thin data for" is a different finding from "people keep
 *  asking about crime". */
export interface DataGapLog {
  subjects: Record<string, GapTally>;
  /** Area name -> times a question about it hit a gap. */
  areas: Record<string, number>;
  /** Questions answered with no gap at all — the denominator, without
   *  which a rising count could just mean rising usage. */
  answeredCleanly: number;
}

/**
 * A FUNCTION, not a shared constant. Returning one frozen-looking object
 * from every empty read looked tidy and was a bug: the caller below mutates
 * what it gets back, so the "empty" log accumulated every tally ever made
 * and handed the total to the next reader as their starting point. Caught
 * by the tests rather than in the wild, which is the only reason it is a
 * footnote.
 */
const empty = (): DataGapLog => ({ subjects: {}, areas: {}, answeredCleanly: 0 });

export async function readDataGaps(storage: GapStorage = deviceStorage): Promise<DataGapLog> {
  try {
    const raw = await storage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    return {
      subjects: parsed?.subjects ?? {},
      areas: parsed?.areas ?? {},
      answeredCleanly: parsed?.answeredCleanly ?? 0,
    };
  } catch {
    return empty();
  }
}

/**
 * Records one answered question. Fire-and-forget: a failure to log must
 * never disturb the conversation, which is the thing the person came for.
 */
export async function recordDataGap(
  area: string,
  missing: string[],
  fellBackToModel: boolean,
  storage: GapStorage = deviceStorage,
): Promise<void> {
  try {
    const log = await readDataGaps(storage);
    if (missing.length === 0 && !fellBackToModel) {
      log.answeredCleanly += 1;
    } else {
      log.areas[area] = (log.areas[area] ?? 0) + 1;
      for (const subject of missing) {
        const t = log.subjects[subject] ?? { subject, count: 0, fellBackToModel: 0, lastAt: 0 };
        t.count += 1;
        if (fellBackToModel) t.fellBackToModel += 1;
        t.lastAt = Date.now();
        log.subjects[subject] = t;
      }
      // A question answered from the model with no named gap still says
      // something was missing — it just was not a dimension we track.
      if (fellBackToModel && missing.length === 0) {
        const t = log.subjects.unclassified
          ?? { subject: 'unclassified', count: 0, fellBackToModel: 0, lastAt: 0 };
        t.count += 1;
        t.fellBackToModel += 1;
        t.lastAt = Date.now();
        log.subjects.unclassified = t;
      }
    }
    await storage.setItem(KEY, JSON.stringify(log));
  } catch {
    // See above: never disturb the conversation.
  }
}

/** Biggest gaps first — the reading order for a data roadmap. */
export function rankGaps(log: DataGapLog): GapTally[] {
  return Object.values(log.subjects).sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject));
}

export async function clearDataGaps(storage: GapStorage = deviceStorage): Promise<void> {
  try {
    await storage.removeItem(KEY);
  } catch {
    // Nothing to do; the next write overwrites anyway.
  }
}
