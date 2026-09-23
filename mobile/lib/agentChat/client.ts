import { auth } from '../firebase';
import {
  NotSignedInError,
  MonthlyLimitError,
  AIUnavailableError,
  isUpstreamUnavailable,
  describeProxyError,
  fetchWithTimeout,
} from '../ranking/anthropicClient';
import { extractText } from '../ranking/extractText';
import { parseChatTurn, type ChatTurnResult } from './parse';
import { AGENT_TURN_SCHEMA, AREA_ANSWER_SCHEMA } from './schema';

/**
 * The Agent chat's network call — sibling to lib/ranking/anthropicClient.ts,
 * same proxy/auth, but sends the growing conversation
 * history instead of one ranking batch. Reuses that module's error classes
 * rather than redefining "not signed in" / "monthly limit" twice.
 */

const PROXY_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/anthropicMessages';
const MODEL = 'claude-sonnet-5';
// The reply is short, but the model restates its ENTIRE understanding
// every turn — every lifestyle field, every loved and hated area, plus a
// freeText synthesis — so the JSON grows with the conversation. At 1024 a
// late turn can hit the ceiling and come back truncated or empty.
const MAX_TOKENS = 2048;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Shorter than the ranking's 90s: a chat turn is capped at 2,048 tokens
 * and someone is sitting looking at the thread waiting for it, so the
 * point at which giving up beats carrying on arrives much sooner.
 */
const CHAT_TIMEOUT_MS = 45_000;

async function post(idToken: string, body: object) {
  const res = await fetchWithTimeout(
    PROXY_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    },
    CHAT_TIMEOUT_MS,
  );
  return { res, data: await res.json().catch(() => null) };
}

export async function callAgentChat(system: string, messages: ChatMessage[]): Promise<ChatTurnResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new NotSignedInError();

  const idToken = await currentUser.getIdToken();
  /**
   * `effort: 'low'` (2026-09-23).
   *
   * Omitting it runs this at the default effort of `high`, and on Sonnet 5
   * that means adaptive thinking, billed as OUTPUT at $10/MTok. This call
   * reads fixed fields out of one sentence somebody just typed - which
   * areas, what they like, how they spend an evening. It is extraction
   * against a fixed schema, not reasoning, and it was quietly the more
   * expensive half of every chat turn.
   *
   * It lives on `base` rather than only on the structured request below,
   * so the plain-request fallback keeps it too.
   *
   * NOT applied to callAgentProse. That one writes the words somebody
   * actually reads, and Nick already finds the answers clunky - spending
   * less thought on them is the wrong direction, and it is the cheaper
   * call anyway.
   */
  const base = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    output_config: { effort: 'low' },
  };

  // Ask the API to ENFORCE the response shape rather than trusting the
  // prompt to produce it. Structured outputs is what stops a malformed
  // reply throwing away an answer the user already spoke.
  let { res, data } = await post(idToken, {
    ...base,
    output_config: { ...base.output_config, format: { type: 'json_schema', schema: AGENT_TURN_SCHEMA } },
  });

  // If the proxy or the model won't take it, fall back to a plain request
  // rather than failing the turn. This could not be verified against the
  // live API before shipping (no key on the build machine), so the worst
  // case has to be "behaves like it did yesterday", never a dead Agent.
  if (res.status === 400) {
    console.warn('Structured outputs rejected, retrying without:', data?.error);
    ({ res, data } = await post(idToken, base));
  }

  if (!res.ok) {
    if (res.status === 429 && data?.error === 'monthly_limit_reached') throw new MonthlyLimitError();
    if (isUpstreamUnavailable(data)) throw new AIUnavailableError();
    throw new Error(`AI proxy error (${res.status}): ${describeProxyError(data)}`);
  }

  const text = extractText(data);
  if (text === null) {
    throw new Error(`The Agent returned nothing (stop_reason: ${data?.stop_reason ?? 'unknown'})`);
  }

  const parsed = parseChatTurn(text);
  if (!parsed) throw new Error('Could not parse the Agent’s reply');
  return parsed;
}

/**
 * A plain-prose turn, for answering a question about an area.
 *
 * Sibling to callAgentChat above, and deliberately NOT the same call: that
 * one enforces a JSON schema because its whole output is a structured
 * profile, and its prose is discarded. This one's prose IS the product —
 * it's what the household reads — so there is no schema to enforce and
 * nothing to parse.
 *
 * Lower token ceiling than the extractor: the extractor restates its entire
 * understanding every turn and grows with the conversation, while an answer
 * to "what about Fulham?" is two or three sentences by instruction.
 */
export { weaveReply } from './parse';

export interface AreaAnswer {
  /** What the measured brief supports. */
  answer: string;
  /**
   * What came from the model's own knowledge of London, if anything.
   *
   * Kept SEPARATE from `answer` only so recordDataGap can log whether a
   * question needed it (store/agentChatStore.ts) — that is an internal
   * signal for Nick, never something a household sees split apart. Use
   * weaveReply below to get the single sentence that actually reaches the
   * chat; nothing should render `unmeasured` on its own any more (Nick,
   * 2026-09-09 — the separate "not from our data" block "looked awful").
   */
  unmeasured: string | null;
}


export async function callAgentProse(system: string, messages: ChatMessage[]): Promise<AreaAnswer> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new NotSignedInError();

  const idToken = await currentUser.getIdToken();
  /**
   * 512 truncated a real answer mid-sentence, and because the reply is
   * JSON, a truncated one is unparseable — so the fail-safe below treated
   * a perfectly good, fully measured answer as though it had come from the
   * model's imagination, and showed the raw JSON to prove it (Nick's
   * screenshot, 2026-09-07). The ceiling has to sit above what the prompt
   * actually asks for, not at it.
   */
  const base = { model: MODEL, max_tokens: 1200, system, messages };
  let { res, data } = await post(idToken, {
    ...base,
    output_config: { format: { type: 'json_schema', schema: AREA_ANSWER_SCHEMA } },
  });
  if (res.status === 400) {
    ({ res, data } = await post(idToken, base));
  }

  if (!res.ok) {
    if (res.status === 429 && data?.error === 'monthly_limit_reached') throw new MonthlyLimitError();
    if (isUpstreamUnavailable(data)) throw new AIUnavailableError();
    throw new Error(`AI proxy error (${res.status}): ${describeProxyError(data)}`);
  }
  const text = extractText(data);
  if (!text) throw new Error('The Agent came back empty.');

  /**
   * Fails SAFE, in the one direction that matters.
   *
   * If the split cannot be read — structured outputs was refused, or the
   * model returned prose — the whole reply is treated as UNMEASURED rather
   * than as measured fact. Mislabelling our own data as "not from our data"
   * costs a little credit; presenting the model's recollection of London as
   * something we measured spends the only real advantage this app has.
   */
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && typeof parsed.answer === 'string') {
      return {
        answer: parsed.answer.trim(),
        unmeasured: typeof parsed.unmeasured === 'string' && parsed.unmeasured.trim()
          ? parsed.unmeasured.trim()
          : null,
      };
    }
  } catch {
    /**
     * Salvage a truncated reply before giving up on it.
     *
     * A response cut off by the token ceiling is unparseable but not
     * useless — the "answer" field comes first and is usually complete or
     * nearly so, and what it holds IS measured, whatever the closing brace
     * says. Reading it out beats both showing raw JSON and throwing away a
     * good answer because its punctuation went missing.
     */
    const salvaged = /"answer"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text);
    if (salvaged?.[1]) {
      const answer = salvaged[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\')
        .trim();
      if (answer.length > 0) return { answer, unmeasured: null };
    }
  }
  /**
   * Genuinely unreadable. Treated as UNMEASURED, which is the safe
   * direction: mislabelling our own data costs a little credit, while
   * passing off a model's recollection of London as something we measured
   * spends the only real advantage this app has.
   */
  return { answer: '', unmeasured: text.trim() };
}
