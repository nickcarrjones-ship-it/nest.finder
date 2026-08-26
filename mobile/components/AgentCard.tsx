import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { colors, fonts, radius, spacing, type } from '../theme';
import { MalocaLogo, MalocaMark } from './MalocaLogo';
import { FinalQuestionsCard } from './FinalQuestionsCard';
import { useAgentChatStore } from '../store/agentChatStore';
import { useAgentVoice } from '../hooks/useAgentVoice';
import { SPOKEN_QUESTIONS } from '../lib/agentChat/prompt';

/**
 * The Agent, as one centred card over the map — the whole conversation,
 * not just its front door.
 *
 * This replaces the bottom-sheet chat that used to open from here, which
 * Nick called out as legacy (2026-08-26): a scrolling transcript with a
 * text box is what you build when typing is the point, and here it isn't.
 * Someone is being asked five questions out loud, so the card shows the
 * question being asked and gets out of the way. Typing is still available,
 * because speech recognition fails often enough that it can never be the
 * only way through.
 *
 * Three phases in one container, so the card never unmounts mid-flow and
 * the visual frame stays put:
 *   intro   — what this is, and the button to start talking
 *   talking — the current question, spoken and on screen
 *   final   — the two questions that are quicker to tap than to say
 */

/** A deeper teal so the counter still reads as a void on the teal disc. */
const COUNTER_ON_TEAL = '#1E5754';

type Phase = 'intro' | 'talking' | 'final';

interface Props {
  onClose: () => void;
}

export function AgentCard({ onClose }: Props) {
  const messages = useAgentChatStore((s) => s.messages);
  const status = useAgentChatStore((s) => s.status);
  const error = useAgentChatStore((s) => s.error);
  const send = useAgentChatStore((s) => s.send);
  const { speak, stop: stopSpeaking, speaking, unavailable: voiceUnavailable } = useAgentVoice();

  const [phase, setPhase] = useState<Phase>('intro');
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [micDenied, setMicDenied] = useState(false);

  const lastAgent = [...messages].reverse().find((m) => m.role === 'assistant');
  const answers = messages.filter((m) => m.role === 'user').length;
  const questionNumber = Math.min(answers + 1, SPOKEN_QUESTIONS.length);

  // ── Speaking ────────────────────────────────────────────────────────
  // Spoken once per message id, tracked module-side in useAgentVoice's
  // consumer so reopening never replays a line.
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'talking' || !lastAgent || lastAgent.id === spokenFor.current) return;
    spokenFor.current = lastAgent.id;
    speak(lastAgent.text);
  }, [phase, lastAgent, speak]);

  // ── Listening ───────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      // No microphone means the typed path is the only path — switch to it
      // rather than leaving someone staring at a question they can't answer.
      setMicDenied(true);
      setTyping(true);
      return;
    }
    setHeard('');
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: 'en-GB', interimResults: true, continuous: false });
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    setHeard(transcript);
    // Final result ends the turn: send it and let the reply drive the next
    // question. Nothing is auto-sent while it's still interim.
    if (event.isFinal && transcript.trim()) {
      setListening(false);
      send(transcript.trim());
    }
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', () => {
    setListening(false);
    setTyping(true); // recognition failed — never a dead end
  });

  // Hand off from speaking to listening: once the Agent has finished its
  // question and the reply isn't still in flight, open the mic. Keyed on the
  // message id so it happens exactly once per question.
  const listenedFor = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'talking' || typing || micDenied) return;
    if (speaking || status === 'sending' || listening) return;
    if (!lastAgent || lastAgent.id === listenedFor.current) return;
    listenedFor.current = lastAgent.id;
    startListening();
  }, [phase, typing, micDenied, speaking, status, listening, lastAgent, startListening]);

  // Move to the button questions once all five have been answered.
  useEffect(() => {
    if (phase === 'talking' && answers >= SPOKEN_QUESTIONS.length && status === 'idle') {
      setPhase('final');
    }
  }, [phase, answers, status]);

  function begin(withTyping: boolean) {
    setTyping(withTyping);
    setPhase('talking');
  }

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    send(text);
  }

  function finish() {
    ExpoSpeechRecognitionModule.stop();
    stopSpeaking();
    onClose();
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.card}>
        {phase === 'intro' && <Intro onStart={() => begin(false)} onType={() => begin(true)} />}

        {phase === 'talking' && (
          <View style={styles.talking}>
            <View style={styles.progressRow}>
              <Text style={styles.eyebrow}>
                Question {questionNumber} of {SPOKEN_QUESTIONS.length}
              </Text>
              <View style={styles.dots}>
                {SPOKEN_QUESTIONS.map((_, i) => (
                  <View key={i} style={[styles.dash, i < answers && styles.dashDone]} />
                ))}
              </View>
            </View>

            <ScrollView style={styles.questionScroll} contentContainerStyle={styles.questionWrap}>
              <Text style={styles.question}>{lastAgent?.text ?? ''}</Text>
            </ScrollView>

            {status === 'sending' ? (
              <View style={styles.stateRow}>
                <ActivityIndicator size="small" color={colors.teal} />
                <Text style={styles.stateText}>Thinking</Text>
              </View>
            ) : (
              !typing && (
                <Pressable onPress={listening ? () => ExpoSpeechRecognitionModule.stop() : startListening} style={styles.stateRow}>
                  <Waveform active={listening || speaking} />
                  <Text style={styles.stateText}>
                    {speaking ? 'Speaking' : listening ? 'Listening — tap to stop' : 'Tap to answer'}
                  </Text>
                </Pressable>
              )
            )}

            {!typing && heard.length > 0 && <Text style={styles.heard}>“{heard}”</Text>}

            {typing && (
              <View style={styles.inputRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Type your answer…"
                  placeholderTextColor={colors.inkGhost}
                  style={styles.input}
                  multiline
                />
                <Pressable
                  onPress={submitDraft}
                  disabled={status === 'sending' || !draft.trim()}
                  style={[styles.sendBtn, (status === 'sending' || !draft.trim()) && styles.sendBtnOff]}
                  accessibilityRole="button"
                >
                  <Text style={styles.sendText}>Send</Text>
                </Pressable>
              </View>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.footerRow}>
              <Pressable onPress={() => setTyping((t) => !t)} hitSlop={8}>
                <Text style={styles.link}>{typing ? 'Answer out loud instead' : 'Type instead'}</Text>
              </Pressable>
              <Pressable onPress={finish} hitSlop={8}>
                <Text style={styles.linkMuted}>Close</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === 'final' && <FinalQuestionsCard onDone={finish} />}
      </View>
    </View>
  );
}

function Intro({ onStart, onType }: { onStart: () => void; onType: () => void }) {
  return (
    <View style={styles.introBlock}>
      <View style={styles.header}>
        <MalocaLogo scale={0.88} />
        <Text style={styles.agentWord}>Agent</Text>
      </View>

      <View style={styles.voicePill}>
        <Waveform active />
        <Text style={styles.voicePillText}>Voice conversation</Text>
      </View>

      <View style={styles.points}>
        <Point text="Five questions about the London you actually want to live in." />
        <Point text="Just talk — I'll listen, and your map updates as we go." />
      </View>

      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.markBtn, pressed && styles.markBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Start talking to the Maloca Agent"
      >
        <MalocaMark height={30} markColor={colors.cream} counterColor={COUNTER_ON_TEAL} />
      </Pressable>

      <View style={styles.introFooter}>
        <Text style={styles.caption}>Tap to start talking</Text>
        <Pressable onPress={onType} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>Or tap here to type your answers instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Point({ text }: { text: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.dot} />
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

/** Four bars that rise and fall while there is sound; flat when there isn't. */
function Waveform({ active }: { active?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 140);
    return () => clearInterval(id);
  }, [active]);
  const heights = [0.45, 1, 0.7, 0.9];
  return (
    <View style={styles.wave}>
      {heights.map((h, i) => {
        const scale = active ? 0.35 + Math.abs(Math.sin((tick + i * 2) / 2)) * h : 0.3;
        return <View key={i} style={[styles.waveBar, { height: 14 * scale }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', inset: 0, backgroundColor: 'rgba(34,40,46,0.32)' },
  card: {
    width: '100%',
    maxWidth: 346,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radius.lg * 2,
    paddingVertical: spacing.xl + 2,
    paddingHorizontal: spacing.xl - 2,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 40,
    elevation: 16,
  },

  introBlock: { alignItems: 'center', gap: spacing.lg + 2 },
  header: { alignItems: 'center', gap: 7 },
  agentWord: { ...type.label, fontSize: 12, letterSpacing: 4, color: colors.inkLt, textTransform: 'uppercase' },
  points: { gap: 11, alignSelf: 'stretch' },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal, marginTop: 7 },
  pointText: { ...type.body, flex: 1, lineHeight: 20, color: colors.inkMid },
  markBtn: {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.teal, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42, shadowRadius: 22, elevation: 8,
  },
  markBtnPressed: { opacity: 0.88, transform: [{ scale: 0.96 }] },
  introFooter: { alignItems: 'center', gap: spacing.md + 2 },
  caption: { ...type.body, fontSize: 13, color: colors.inkLt },

  talking: { gap: spacing.lg },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  eyebrow: { ...type.label, fontSize: 10, letterSpacing: 1.4, color: colors.teal, textTransform: 'uppercase' },
  dots: { flexDirection: 'row', gap: 4 },
  dash: { width: 16, height: 3, borderRadius: 2, backgroundColor: colors.rule },
  dashDone: { backgroundColor: colors.teal },
  questionScroll: { maxHeight: 160 },
  questionWrap: { paddingRight: 2 },
  question: { fontFamily: fonts.medium, fontSize: 21, lineHeight: 28, letterSpacing: -0.4, color: colors.ink },
  stateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.rule,
  },
  stateText: { ...type.label, fontSize: 10, letterSpacing: 1.4, color: colors.teal, textTransform: 'uppercase' },
  heard: { fontFamily: fonts.italic, fontSize: 14, lineHeight: 21, color: colors.inkLt },

  voicePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: colors.tealSoft, borderWidth: 1, borderColor: colors.tealLine,
    borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md,
  },
  voicePillText: { ...type.label, fontSize: 10, letterSpacing: 1.4, color: colors.teal, textTransform: 'uppercase' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 14 },
  waveBar: { width: 2, borderRadius: 1, backgroundColor: colors.teal },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    fontFamily: fonts.regular, flex: 1, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.rule, borderRadius: radius.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    fontSize: 15, color: colors.ink, maxHeight: 90,
  },
  sendBtn: {
    backgroundColor: colors.ink, borderRadius: radius.pill,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.4 },
  sendText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },

  errorText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.red },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.teal },
  linkMuted: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkGhost },
});
