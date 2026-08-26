import { auth } from '../firebase';
import { NotSignedInError, MonthlyLimitError } from '../ranking/anthropicClient';
import { parseChatTurn, type ChatTurnResult } from './parse';

/**
 * The Agent chat's network call — sibling to lib/ranking/anthropicClient.ts,
 * same proxy/auth, but sends the growing conversation
 * history instead of one ranking batch. Reuses that module's error classes
 * rather than redefining "not signed in" / "monthly limit" twice.
 */

const PROXY_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/anthropicMessages';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024; // a reply plus a small structured object, not a ranking batch

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

  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('AI proxy returned no text content');

  const parsed = parseChatTurn(text);
  if (!parsed) throw new Error('Could not parse the Agent’s reply');
  return parsed;
}
