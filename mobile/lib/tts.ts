import { Directory, File, Paths } from 'expo-file-system';
import { auth } from './firebase';

/**
 * The Agent's voice. The speak Cloud Function returns base64 mp3 (it needs a
 * Bearer token, and an audio player fetching a URL cannot send one), so the
 * bytes are written to a cache file and played from there.
 *
 * expo-file-system ships inside the expo package, so the file half needs no
 * rebuild. expo-audio is a genuine native module and IS the reason this
 * needs a fresh dev build. THIS MODULE IS ONLY EVER REQUIRED LAZILY, from
 * inside hooks/useAgentVoice.ts's guarded loader — importing it at the top
 * of a component file would evaluate the native imports below at bundle
 * load and crash a binary that predates them.
 *
 * Speech is always optional: every caller must render the text on screen
 * regardless, so a missing key, a quota, a flaky network or an old binary
 * all end in "no audio", never "no question".
 */

const SPEAK_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/speak';

export class SpeechUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SpeechUnavailableError';
  }
}

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, 'agent-speech');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Audio already fetched this session, keyed by the exact text. The five
 * questions are fixed strings, so the same words are spoken to everyone —
 * fetching each one twice would be paying twice for silence the user waits
 * through (Nick, 2026-08-27). Lets prefetchSpeech warm the next question
 * while the current one is still being answered.
 */
const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

/** Stable, filesystem-safe name for a piece of text. */
function keyFor(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `s${(h >>> 0).toString(36)}`;
}

/**
 * Fetches audio WITHOUT playing it, so the next question is ready the
 * moment it is asked. Failures are swallowed: this is an optimisation, and
 * the real speak() call will surface anything that actually matters.
 */
export function prefetchSpeech(text: string): void {
  fetchSpeech(text).catch(() => {});
}

/** Fetches spoken audio and returns a local file URI, or throws. */
export async function fetchSpeech(text: string): Promise<string> {
  const key = keyFor(text);
  const cached = cache.get(key);
  if (cached) return cached;
  // Share one request when a prefetch and a real play race for the same
  // line — otherwise the prefetch is wasted and billed twice.
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = fetchSpeechUncached(text, key).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

async function fetchSpeechUncached(text: string, key: string): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new SpeechUnavailableError('not signed in');

  const idToken = await currentUser.getIdToken();
  const res = await fetch(SPEAK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ text }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || typeof data?.audio !== 'string') {
    throw new SpeechUnavailableError(data?.error ?? `speech failed (${res.status})`);
  }

  // Written straight through as base64 — expo-file-system decodes natively,
  // so this doesn't depend on atob, which React Native does not reliably
  // provide.
  const file = new File(cacheDir(), `${key}.mp3`);
  file.create({ overwrite: true });
  file.write(data.audio, { encoding: 'base64' });
  cache.set(key, file.uri);
  return file.uri;
}

/** Best-effort cleanup — speech files are disposable the moment they've played. */
export function clearSpeechCache(): void {
  cache.clear();
  try {
    const dir = cacheDir();
    for (const entry of dir.list()) entry.delete();
  } catch {
    // A cache we couldn't clear is not worth surfacing to anyone.
  }
}
