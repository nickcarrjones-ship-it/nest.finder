import { auth } from '../firebase';
import { extractText } from './extractText';
import type { ModelCaller } from './rank';

/**
 * The real AI ranking call — mobile's counterpart to js/anthropic-call.js.
 * Same proxy, same Firebase project, same server-side model allowlist; the
 * mobile app just authenticates with the native Google sign-in session
 * instead of a browser one.
 *
 * The proxy (functions/index.js) enforces its own allowlist by EXACT string
 * match, so the model here must appear in ALLOWED_MODELS there or the
 * server rejects it with 400 model_not_allowed regardless of what's
 * requested. Changing the model is therefore always a two-part change:
 * this constant AND a redeploy of the function.
 */

const PROXY_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/anthropicMessages';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 8000; // 120 ranked areas of JSON; the proxy caps at 8192

/**
 * The proxy answers with a string error of its own ("model_not_allowed"),
 * but an upstream failure comes back as Anthropic's error OBJECT. Template
 * that straight into a message and you get "AI proxy error (400):
 * [object Object]", which is exactly what Nick saw — and it hid the real
 * cause for a whole debugging round (2026-08-31).
 */
export function describeProxyError(data: unknown): string {
  const err = (data as { error?: unknown })?.error ?? data;
  if (typeof err === 'string') return err;
  const message = (err as { message?: unknown })?.message;
  if (typeof message === 'string') return message;
  try {
    return JSON.stringify(err);
  } catch {
    return 'unknown';
  }
}

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
    throw new Error(`AI proxy error (${res.status}): ${describeProxyError(data)}`);
  }

  const text = extractText(data);
  if (text === null) {
    throw new Error(`AI returned no text (stop_reason: ${data?.stop_reason ?? 'unknown'})`);
  }
  return text;
};
