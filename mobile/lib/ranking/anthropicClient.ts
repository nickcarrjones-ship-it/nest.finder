import { auth } from '../firebase';
import type { ModelCaller } from './rank';

/**
 * The real AI ranking call — mobile's counterpart to js/anthropic-call.js.
 * Same proxy, same Firebase project, same server-side model allowlist; the
 * mobile app just authenticates with the native Google sign-in session
 * instead of a browser one.
 *
 * The proxy (functions/index.js) enforces its own allowlist — ONLY
 * 'claude-sonnet-4-6' and 'claude-haiku-4-5-20251001' pass — so this must
 * send that exact string, not a newer bare model ID; anything else the
 * server itself rejects with 400 model_not_allowed regardless of what's
 * requested here.
 */

const PROXY_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/anthropicMessages';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096; // ranking responses are short JSON, well under the proxy's 8192 cap

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in to get AI-ranked picks.');
    this.name = 'NotSignedInError';
  }
}

export class MonthlyLimitError extends Error {
  constructor() {
    super("You've used your AI messages for this month.");
    this.name = 'MonthlyLimitError';
  }
}

export const callAnthropicRanking: ModelCaller = async (system, user) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new NotSignedInError();

  const idToken = await currentUser.getIdToken();
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 429 && data?.error === 'monthly_limit_reached') throw new MonthlyLimitError();
    throw new Error(`AI proxy error (${res.status}): ${data?.error ?? 'unknown'}`);
  }

  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('AI proxy returned no text content');
  return text;
};
