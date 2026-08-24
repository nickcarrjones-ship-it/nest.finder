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
  if (Array.isArray(src.dealbreakers)) {
    const list = src.dealbreakers.filter((d): d is string => typeof d === 'string');
    if (list.length) out.dealbreakers = list;
  }
  if (typeof src.freeText === 'string' && src.freeText.trim()) out.freeText = src.freeText.trim();
  return out;
}

function cleanAreaCards(input: unknown): AreaCards {
  if (!input || typeof input !== 'object') return {};
  const out: AreaCards = {};
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
    };
  } catch {
    return null;
  }
}

export function parseChatTurn(raw: string): ChatTurnResult | null {
  return tryParse(raw) ?? (extractJsonObject(raw) ? tryParse(extractJsonObject(raw)!) : null);
}
