import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { colors, radius } from '../theme';

interface MicButtonProps {
  onTranscript: (text: string) => void;
}

/**
 * Tap-to-start / tap-to-stop, on-device speech-to-text (SFSpeechRecognizer
 * on iOS, Android's SpeechRecognizer — no audio ever leaves the phone, no
 * added API cost). One-shot per tap rather than continuous listening: the
 * transcript lands in the text input, editable, never auto-sent — the
 * chat's Send button is still the only thing that actually posts a message.
 */
export function MicButton({ onTranscript }: MicButtonProps) {
  const [recording, setRecording] = useState(false);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (event.isFinal && transcript) onTranscript(transcript);
  });
  useSpeechRecognitionEvent('end', () => setRecording(false));
  useSpeechRecognitionEvent('error', () => setRecording(false));

  async function toggle() {
    if (recording) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return;
    setRecording(true);
    ExpoSpeechRecognitionModule.start({ lang: 'en-GB', interimResults: false, continuous: false });
  }

  return (
    <Pressable
      onPress={toggle}
      style={[styles.btn, recording && styles.btnRecording]}
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Speak instead of typing'}
    >
      <Text style={styles.icon}>{recording ? '■' : '🎙'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRecording: { backgroundColor: colors.red },
  icon: { fontSize: 16, color: colors.cream },
});
