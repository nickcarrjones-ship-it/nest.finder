import type { AreaCards, Lifestyle } from '../types';

/**
 * Same defensive shape as lib/ranking/parse.ts — the model occasionally
 * wraps JSON in prose or a fence despite instructions not to, and a bad
 * response should degrade to "no reply this turn", never a crash.
 */

export interface ChatTurnResult {
  reply: string;
  lifestyle: Partial<Lifestyle>;
  areaCards: AreaCards;
  /** What they like about their anchor areas — null until they say. */
  anchorReason?: string;
}

const LIFESTYLE_ENUMS: Record<string, string[]> = {
  greenSpace: ['essential', 'nice', 'unimportant'],
  streetVibe: ['buzzy', 'quiet', 'village'],
  nightsOut: ['frequent', 'regular', 'rarely'],
  schoolsPriority: ['now', 'someday', 'no'],
  safetyPriority: ['veryimportant', 'important', 'flexible'],
};

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function cleanLifestyle(input: unknown): Partial<Lifestyle> {
  if (!input || typeof input !== 'object') return {};
  const src = input as Record<string, unknown>;
  const out: Partial<Lifestyle> = {};
  for (const [key, allowed] of Object.entries(LIFESTYLE_ENUMS)) {
    const value = src[key];
    if (typeof value === 'string' && allowed.includes(value)) {
      (out as Record<string, string>)[key] = value;
    }
  }
  // Booleans and the two button-collected fields sit outside LIFESTYLE_ENUMS
  // because they aren't string enums. zone1Ok must stay a strict boolean
  // check: it decides whether Zone 1 areas are dropped from the candidate
  // set entirely, so a truthy string like "maybe" must not slip through as
  // a yes.
  if (typeof src.zone1Ok === 'boolean') out.zone1Ok = src.zone1Ok;
  if (src.riverSide === 'north' || src.riverSide === 'south' || src.riverSide === 'either') {
    out.riverSide = src.riverSide;
  }
  if (src.socialCircle === 'N' || src.socialCircle === 'E' || src.socialCircle === 'S' || src.socialCircle === 'W') {
    out.socialCircle = src.socialCircle;
  }
  if (Array.isArray(src.dealbreakers)) {
    const list = src.dealbreakers.filter((d): d is string => typeof d === 'string');
    if (list.length) out.dealbreakers = list;
  }
  if (typeof src.freeText === 'string' && src.freeText.trim()) out.freeText = src.freeText.trim();
  return out;
}

/**
 * Accepts BOTH shapes: the list of {name, verdict} that structured outputs
 * requires (a strict schema cannot describe a free-form map), and the older
 * map of name -> verdict. Reading both means the enforced schema can be
 * turned off — or rejected by the API and retried without — without the
 * parser caring. What it returns is the map either way, so nothing
 * downstream changes.
 */
function cleanAreaCards(input: unknown): AreaCards {
  const out: AreaCards = {};
  if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue;
      const { name, verdict } = entry as { name?: unknown; verdict?: unknown };
      if (typeof name === 'string' && name.trim() && (verdict === 'love' || verdict === 'hate')) {
        out[name.trim()] = verdict;
      }
    }
    return out;
  }
  if (!input || typeof input !== 'object') return {};
  for (const [name, verdict] of Object.entries(input as Record<string, unknown>)) {
    if (name.trim() && (verdict === 'love' || verdict === 'hate')) out[name.trim()] = verdict;
  }
  return out;
}

function tryParse(text: string): ChatTurnResult | null {
  try {
    const data = JSON.parse(text);
    if (typeof data?.reply !== 'string' || !data.reply.trim()) return null;
    return {
      reply: data.reply,
      lifestyle: cleanLifestyle(data.lifestyle),
      areaCards: cleanAreaCards(data.areaCards),
      anchorReason:
        typeof data.anchorReason === 'string' && data.anchorReason.trim()
          ? data.anchorReason.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

export function parseChatTurn(raw: string): ChatTurnResult | null {
  return tryParse(raw) ?? (extractJsonObject(raw) ? tryParse(extractJsonObject(raw)!) : null);
}
