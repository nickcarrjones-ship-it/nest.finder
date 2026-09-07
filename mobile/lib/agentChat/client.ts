import { auth } from '../firebase';
import { NotSignedInError, MonthlyLimitError, describeProxyError } from '../ranking/anthropicClient';
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

async function post(idToken: string, body: object) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  return { res, data: await res.json().catch(() => null) };
}

export async function callAgentChat(system: string, messages: ChatMessage[]): Promise<ChatTurnResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new NotSignedInError();

  const idToken = await currentUser.getIdToken();
  const base = { model: MODEL, max_tokens: MAX_TOKENS, system, messages };

  // Ask the API to ENFORCE the response shape rather than trusting the
  // prompt to produce it. Structured outputs is what stops a malformed
  // reply throwing away an answer the user already spoke.
  let { res, data } = await post(idToken, {
    ...base,
    output_config: { format: { type: 'json_schema', schema: AGENT_TURN_SCHEMA } },
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
export interface AreaAnswer {
  /** What the measured brief supports. */
  answer: string;
  /** What came from the model's own knowledge of London, if anything. The
   *  app labels this; the model only has to separate it. */
  unmeasured: string | null;
}

export async function callAgentProse(system: string, messages: ChatMessage[]): Promise<AreaAnswer> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new NotSignedInError();

  const idToken = await currentUser.getIdToken();
  const base = { model: MODEL, max_tokens: 512, system, messages };
  let { res, data } = await post(idToken, {
    ...base,
    output_config: { format: { type: 'json_schema', schema: AREA_ANSWER_SCHEMA } },
  });
  if (res.status === 400) {
    ({ res, data } = await post(idToken, base));
  }

  if (!res.ok) {
    if (res.status === 429 && data?.error === 'monthly_limit_reached') throw new MonthlyLimitError();
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
    // Not JSON — fall through to the safe reading below.
  }
  return { answer: '', unmeasured: text.trim() };
}
