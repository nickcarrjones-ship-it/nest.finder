import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { clearSpeechCache, fetchSpeech } from '../lib/tts';

/**
 * Speaking half of the Agent conversation (the listening half is
 * MicButton/expo-speech-recognition). Kept as a hook so the voice UI can
 * show whether the Agent is currently talking and offer a stop control,
 * which matters more than it sounds: audio that can't be stopped is the
 * fastest way to make someone put the phone down.
 *
 * Every failure path here is deliberately silent. Speech is an enhancement
 * over text that is always on screen anyway, so a missing key, an exhausted
 * quota, a dead network or a dev build without expo-audio linked should all
 * end in "it didn't speak", never an error the person has to dismiss.
 */
export function useAgentVoice(): {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  speaking: boolean;
  /** True once a speech attempt has failed — the UI can stop offering audio. */
  unavailable: boolean;
} {
  const [speaking, setSpeaking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  // Guards against a reply that lands after the person has moved on: only
  // the most recent request is allowed to start playing.
  const requestRef = useRef(0);

  useEffect(() => {
    // Play through the silent switch — someone who tapped a microphone
    // button is expecting to be spoken to.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => {
      playerRef.current?.remove();
      playerRef.current = null;
      clearSpeechCache();
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
      const id = requestRef.current + 1;
      requestRef.current = id;

      try {
        const uri = await fetchSpeech(text);
        if (requestRef.current !== id) return; // superseded while fetching

        playerRef.current?.remove();
        const player = createAudioPlayer(uri);
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
