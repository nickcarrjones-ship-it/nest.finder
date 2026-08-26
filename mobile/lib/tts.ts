import { Directory, File, Paths } from 'expo-file-system';
import { auth } from './firebase';

/**
 * The Agent's voice. The speak Cloud Function returns base64 mp3 (it needs a
 * Bearer token, and an audio player fetching a URL cannot send one), so the
 * bytes are written to a cache file and played from there.
 *
 * expo-file-system ships inside the expo package, so no rebuild was needed
 * for the file half. expo-audio is a genuine native module and IS the reason
 * this needs a fresh dev build — it is imported lazily below so that a
 * binary without it degrades to silent text rather than crashing on import.
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

/** Fetches spoken audio and returns a local file URI, or throws. */
export async function fetchSpeech(text: string): Promise<string> {
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
  const file = new File(cacheDir(), `turn-${Date.now()}.mp3`);
  file.create({ overwrite: true });
  file.write(data.audio, { encoding: 'base64' });
  return file.uri;
}

/** Best-effort cleanup — speech files are disposable the moment they've played. */
export function clearSpeechCache(): void {
  try {
    const dir = cacheDir();
    for (const entry of dir.list()) entry.delete();
  } catch {
    // A cache we couldn't clear is not worth surfacing to anyone.
  }
}
