import { auth } from '../firebase';
import { NotSignedInError, MonthlyLimitError } from '../ranking/anthropicClient';
import { extractText } from '../ranking/extractText';
import { parseChatTurn, type ChatTurnResult } from './parse';

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

export async function callAgentChat(system: string, messages: ChatMessage[]): Promise<ChatTurnResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new NotSignedInError();

  const idToken = await currentUser.getIdToken();
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }),
  });

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 429 && data?.error === 'monthly_limit_reached') throw new MonthlyLimitError();
    throw new Error(`AI proxy error (${res.status}): ${data?.error ?? 'unknown'}`);
  }

  const text = extractText(data);
  if (text === null) {
    throw new Error(`The Agent returned nothing (stop_reason: ${data?.stop_reason ?? 'unknown'})`);
  }

  const parsed = parseChatTurn(text);
  if (!parsed) throw new Error('Could not parse the Agent’s reply');
  return parsed;
}
