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

/**
 * The proxy's OWN account with Anthropic failing — out of credit, rate
 * limited, or Anthropic itself having an outage — as opposed to anything
 * this household did. The proxy (functions/index.js) tags this shape
 * specifically so it can never be confused with a genuine app bug; see
 * isUpstreamUnavailable below.
 */
export class AIUnavailableError extends Error {
  constructor() {
    super('The Agent is taking a breather — please try again shortly.');
    this.name = 'AIUnavailableError';
  }
}

export function isUpstreamUnavailable(data: unknown): boolean {
  return (data as { error?: { type?: unknown } })?.error?.type === 'upstream_unavailable';
}

/**
 * fetch with a deadline.
 *
 * Neither AI call had one, and a request that never settles is the worst
 * of all the failure modes: the map sits on "Maloca Agent is cookin'"
 * forever, with no error, no retry and nothing to say it has given up —
 * because the code that marks a ranking failed only runs when the promise
 * settles, and a hung request never does (Nick's simulator, 2026-09-12).
 *
 * A timeout surfaces as AIUnavailableError rather than a class of its own:
 * to the person waiting, "no answer came back in time" and "the service
 * said no" are the same event and want the same sentence. The distinction
 * is kept in the console, where it is the part worth diagnosing.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error | undefined)?.name === 'AbortError') {
      console.warn(`[ai] request gave up after ${Math.round(ms / 1000)}s: ${url}`);
      throw new AIUnavailableError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generous, because this is the big one — up to 8,000 tokens of ranked
 * JSON over 120 areas, which legitimately takes the best part of a minute
 * on a slow connection. The ceiling exists to guarantee the promise
 * settles, not to cut short a request that is still working.
 */
const RANKING_TIMEOUT_MS = 90_000;

export const callAnthropicRanking: ModelCaller = async (system, user) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new NotSignedInError();

  const idToken = await currentUser.getIdToken();
  const res = await fetchWithTimeout(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  }, RANKING_TIMEOUT_MS);

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 429 && data?.error === 'monthly_limit_reached') throw new MonthlyLimitError();
    if (isUpstreamUnavailable(data)) throw new AIUnavailableError();
    throw new Error(`AI proxy error (${res.status}): ${describeProxyError(data)}`);
  }

  const text = extractText(data);
  if (text === null) {
    throw new Error(`AI returned no text (stop_reason: ${data?.stop_reason ?? 'unknown'})`);
  }
  return text;
};
