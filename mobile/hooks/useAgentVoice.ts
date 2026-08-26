import { useCallback, useEffect, useRef, useState } from 'react';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { AudioPlayer } from 'expo-audio';

/**
 * Speaking half of the Agent conversation (the listening half is
 * MicButton/expo-speech-recognition). Kept as a hook so the voice UI can
 * show whether the Agent is currently talking and offer a stop control,
 * which matters more than it sounds: audio that can't be stopped is the
 * fastest way to make someone put the phone down.
 *
 * NOTHING about speech is imported at module load. expo-audio is a native
 * module, so a JS bundle running on a binary built before it was added
 * throws "Cannot find native module 'ExpoAudio'" the moment it is required
 * — and because this hook is reached from the Agent tab, that error took
 * the whole router down rather than just disabling audio (2026-08-26, hit
 * on device). Both the audio module and lib/tts are therefore pulled in
 * lazily inside a guarded require, so an unlinked binary loses the voice
 * and keeps the app.
 *
 * The `import type` above is erased at compile time and never becomes a
 * runtime require — that one is safe.
 *
 * Every other failure path is silent for the same reason: speech is an
 * enhancement over text that is always on screen anyway, so a missing key,
 * an exhausted quota or a dead network should all end in "it didn't
 * speak", never an error the person has to dismiss.
 */

type AudioModule = typeof import('expo-audio');
type TtsModule = typeof import('../lib/tts');

// undefined = not tried yet, null = tried and unavailable on this binary.
let audio: AudioModule | null | undefined;
let tts: TtsModule | null | undefined;

function loadSpeech(): { audio: AudioModule; tts: TtsModule } | null {
  if (audio === undefined) {
    // ASK FIRST, don't require-and-catch. When a module throws while Metro
    // is loading it, Metro remembers it as broken, and a later require can
    // hand back a half-initialised module whose exports are undefined —
    // which surfaced on device as "Cannot read property 'EventEmitter' of
    // undefined" at startup, a worse and far more confusing failure than
    // the original one (2026-08-26). requireOptionalNativeModule returns
    // null instead of throwing, so on a binary without the native side we
    // never touch expo-audio's JS at all and nothing gets poisoned.
    // expo-modules-core itself is in every build, so this probe is safe.
    audio = requireOptionalNativeModule('ExpoAudio') ? (require('expo-audio') as AudioModule) : null;
  }
  if (tts === undefined) {
    try {
      tts = require('../lib/tts') as TtsModule;
    } catch {
      tts = null;
    }
  }
  return audio && tts ? { audio, tts } : null;
}

export function useAgentVoice(): {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  speaking: boolean;
  /** True once speech has proved impossible — the UI can stop offering it. */
  unavailable: boolean;
} {
  const [speaking, setSpeaking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  // Guards against a reply that lands after the person has moved on: only
  // the most recent request is allowed to start playing.
  const requestRef = useRef(0);

  useEffect(() => {
    const speech = loadSpeech();
    if (!speech) {
      setUnavailable(true);
      return;
    }
    // Play through the silent switch — someone who tapped a microphone
    // button is expecting to be spoken to.
    speech.audio.setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      playerRef.current?.remove();
      playerRef.current = null;
      speech.tts.clearSpeechCache();
    };
  }, []);

  const stop = useCallback(() => {
    requestRef.current += 1; // invalidate anything in flight
    playerRef.current?.remove();
    playerRef.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (unavailable || !text.trim()) return;
      const speech = loadSpeech();
      if (!speech) {
        setUnavailable(true);
        return;
      }

      const id = requestRef.current + 1;
      requestRef.current = id;

      try {
        const uri = await speech.tts.fetchSpeech(text);
        if (requestRef.current !== id) return; // superseded while fetching

        playerRef.current?.remove();
        const player = speech.audio.createAudioPlayer(uri);
        playerRef.current = player;
        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish && requestRef.current === id) setSpeaking(false);
        });
        setSpeaking(true);
        player.play();
      } catch {
        // One failure is enough to stop trying: the causes (no key, no
        // quota, no native module) are all sticky for the session, and
        // retrying every turn would just add latency to every question.
        if (requestRef.current === id) {
          setUnavailable(true);
          setSpeaking(false);
        }
      }
    },
    [unavailable],
  );

  return { speak, stop, speaking, unavailable };
}
