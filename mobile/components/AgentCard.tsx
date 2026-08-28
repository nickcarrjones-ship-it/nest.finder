import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { colors, fonts, radius, spacing, type } from '../theme';
import { MalocaLogo, MalocaMark } from './MalocaLogo';
import { FinalQuestionsCard } from './FinalQuestionsCard';
import { useAgentChatStore } from '../store/agentChatStore';
import { useAgentVoice } from '../hooks/useAgentVoice';
import { SPOKEN_QUESTIONS } from '../lib/agentChat/prompt';
import { clarifyQuestion } from '../lib/agentChat/clarify';
import { ambiguityInText } from '../lib/ranking/anchor';
import { RECOGNITION_HINTS } from '../lib/recognitionHints';

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
  const error = useAgentChatStore((s) => s.error);
  const send = useAgentChatStore((s) => s.send);
  const { speak, prefetch, stop: stopSpeaking, speaking } = useAgentVoice();

  const [phase, setPhase] = useState<Phase>('intro');
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [micHint, setMicHint] = useState<string | null>(null);
  const [pendingReply, setPendingReply] = useState(false);

  const lastAgent = [...messages].reverse().find((m) => m.role === 'assistant');
  const rawAnswers = messages.filter((m) => m.role === 'user').length;
  const followUps = useAgentChatStore((s) => s.followUps);
  const pendingClarification = useAgentChatStore((s) => s.pendingClarification);
  /**
   * Answers to SCRIPTED questions. A clarification and its answer must not
   * consume one of the five, or answering "the Common end" would skip
   * straight past "what is it about there that you like?".
   */
  const answers = Math.max(0, rawAnswers - followUps);
  const questionNumber = Math.min(answers + 1, SPOKEN_QUESTIONS.length);

  // The five questions are KNOWN, so waiting on the model to phrase the
  // next one is a wait for nothing (Nick, 2026-08-27: "it's not really
  // back and forth"). The question on screen comes from the local script
  // and appears the instant an answer is sent; the model's reply arrives
  // behind it as an acknowledgement. Question one is the exception — the
  // seeded opener IS the model's, and it's already there with no wait.
  /**
   * Normally the NEXT SCRIPTED question, which is why it appears instantly
   * instead of waiting on the network. But when the Agent has asked
   * something off-script — "the Common side or the Junction?" — its reply
   * IS the question, and speaking the script over it was the bug Nick found
   * on device (2026-08-28).
   */
  /**
   * Always locally-known text, so it can be spoken the instant it appears.
   *
   * A clarification takes priority when there is one — the app composed it
   * itself, so there is no network wait — otherwise the next scripted
   * question. The model's reply is NEVER on this path: it arrives seconds
   * later and is shown as text, which is what made the voice feel slow and
   * out of order.
   */
  const question =
    pendingClarification ??
    (answers === 0 ? (lastAgent?.text ?? SPOKEN_QUESTIONS[0]) : SPOKEN_QUESTIONS[answers]);
  // Shown above the question once it lands, so you can see it heard you
  // without having waited for it.
  const acknowledgement =
    !pendingClarification && answers > 0 && lastAgent && !pendingReply ? lastAgent.text : null;

  // ── Speaking ────────────────────────────────────────────────────────
  // Spoken once per message id, tracked module-side in useAgentVoice's
  // consumer so reopening never replays a line.
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'talking' || !question) return;
    /**
     * Hold the script when a clarification is on its way.
     *
     * Normally the next scripted question is spoken the instant an answer is
     * sent, so there is no dead air waiting on the network. But when the app
     * has just asked the Agent to clarify something, speaking ahead produces
     * exactly what Nick heard on device: question two, then the
     * clarification, then question two again (2026-08-28). We asked for the
     * interruption, so we wait for it.
     */

    /**
     * Keyed on the QUESTION, not the answer count.
     *
     * `answers` deliberately does not move during a follow-up — that is what
     * stops a clarification eating one of the five — so keying on it meant
     * the clarification shared a key with the question before it and was
     * skipped as already-spoken. The Agent asked "the Common or the
     * Junction?" and the card said nothing (found on device, 2026-08-28).
     */
    const key = pendingClarification ? `c${pendingClarification}` : `q${answers}`;
    if (spokenFor.current === key) return;
    spokenFor.current = key;

    /**
     * Close the microphone before speaking, always.
     *
     * Recognition runs continuous, so an open recogniser survives the answer
     * being sent and then transcribes the NEXT question as if the user had
     * said it (Nick, on device 2026-08-28). The guard inside startListening
     * stops us OPENING the mic while talking; nothing was closing one that
     * was already open.
     */
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Nothing was listening, which is the normal case.
    }
    speak(question);
    // Fetch the NEXT question's audio while this one is being answered, so
    // it plays the instant it appears rather than after a round trip. The
    // questions are fixed strings, so this is the same request either way —
    // just made early, and cached by text so it is never paid for twice.
    const next = SPOKEN_QUESTIONS[answers + 1];
    if (next) prefetch(next);
  }, [phase, question, answers, pendingClarification, lastAgent, speak, prefetch]);

  /**
   * Warm the clarification's audio while they are still reviewing what was
   * heard, rather than at the moment it is needed.
   *
   * Ambiguity is detected from their own words, so the app knows a
   * clarification is coming as soon as the transcript appears — several
   * seconds before they tap send. Fetching then turns the wait into no wait
   * at all, which is the whole complaint about the voice feeling slow.
   */
  useEffect(() => {
    if (!heard) return;
    const options = ambiguityInText(heard);
    if (options.length) prefetch(clarifyQuestion(options));
  }, [heard, prefetch]);

  // ── Listening ───────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    // Never open the mic while the Agent is talking OR while its audio is
    // still being fetched — on a phone speaker it hears itself and
    // transcribes its own question as the answer. `speaking` covers both.
    if (speaking || listening) return;
    // Stop anything still running before starting again: a second start on
    // a live recogniser throws, and that error used to dump people into
    // typing mode (Nick, 2026-08-27).
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Nothing was running — which is the normal case.
    }
    setMicHint(null);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      // No microphone means the typed path is the only path — switch to it
      // rather than leaving someone staring at a question they can't answer.
      setTyping(true);
      return;
    }
    setHeard('');
    setListening(true);
    ExpoSpeechRecognitionModule.start({
      lang: 'en-GB',
      interimResults: true,
      // Keep listening through pauses. The questions ask people to talk
      // through an evening or a weekend, and the default ends the turn at
      // the first breath — which is why answers were getting cut off
      // (Nick, 2026-08-26). The user decides when they're done.
      continuous: true,
      // Place names are what it mishears, and the app happens to know every
      // one of them. Biasing recognition toward real London areas is the
      // single biggest win available here.
      contextualStrings: RECOGNITION_HINTS,
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
        EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 2000,
      },
    });
  }, [speaking]);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    setHeard(transcript);
    // Recognising is NOT answering. What it heard is shown back and waits
    // for a tap, so a misheard answer can be redone instead of being sent
    // and then argued with (Nick, 2026-08-26).
    if (event.isFinal) setListening(false);
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    // Do NOT force typing mode. Recognition errors are routine — no speech
    // detected, a network blip, the recogniser busy — and switching modes
    // on any of them meant a single tap of the mic silently became "type
    // your answer instead", which is what Nick hit. Say what happened and
    // leave the choice with the person.
    const code = (event as { error?: string })?.error ?? '';
    setMicHint(
      code === 'no-speech'
        ? "Didn't catch that — tap and try again."
        : 'Speech recognition had a problem. Tap to try again, or type instead.',
    );
  });

  // NO automatic hand-off from speaking to listening. It was wrong twice
  // over (Nick, 2026-08-26): the mic opened while the Agent's own audio was
  // still coming out of the speaker, so the phone transcribed the Agent and
  // submitted it as the answer — which then advanced the question before he
  // had said anything. And even working perfectly, a conversation that
  // moves on the instant you stop talking gives you no moment to check it
  // heard you right. Answering is a deliberate tap now, and so is moving on.

  // Move to the button questions once all five have been answered.
  useEffect(() => {
    if (phase === 'talking' && answers >= SPOKEN_QUESTIONS.length) setPhase('final');
  }, [phase, answers]);

  function begin(withTyping: boolean) {
    setTyping(withTyping);
    setPhase('talking');
  }

  // The intro card sits on screen while someone reads it — long enough to
  // have the opening line ready before they press anything.
  useEffect(() => {
    if (phase === 'intro' && lastAgent) prefetch(lastAgent.text);
  }, [phase, lastAgent, prefetch]);

  function answer(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setHeard('');
    setMicHint(null);
    setPendingReply(true);
    // Deliberately not awaited: the next question is already on screen by
    // the time this resolves. The reply still matters — it carries the
    // preferences the model extracted — but nobody should sit and watch a
    // spinner for it.
    send(trimmed).finally(() => setPendingReply(false));
  }

  function submitDraft() {
    const text = draft;
    setDraft('');
    answer(text);
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
              {acknowledgement && <Text style={styles.ack}>{acknowledgement}</Text>}
              <Text style={styles.question}>{question}</Text>
            </ScrollView>

            {!typing && (
              <Pressable
                onPress={listening ? () => ExpoSpeechRecognitionModule.stop() : startListening}
                disabled={speaking || heard.length > 0}
                style={styles.stateRow}
              >
                <Waveform active={listening || speaking} />
                <Text style={styles.stateText}>
                  {speaking
                    ? 'Speaking — listen, then answer'
                    : listening
                      ? 'Listening — tap when you\'re done'
                      : heard.length > 0
                        ? 'Check what I heard'
                        : 'Tap to answer'}
                </Text>
              </Pressable>
            )}

            {micHint && <Text style={styles.micHint}>{micHint}</Text>}

            {!typing && heard.length > 0 && (
              <View style={styles.heardBlock}>
                <Text style={styles.heardLabel}>You said</Text>
                <Text style={styles.heard}>“{heard}”</Text>
                {!listening && (
                  <View style={styles.heardActions}>
                    <Pressable onPress={() => { setHeard(''); startListening(); }} style={styles.redoBtn} hitSlop={6}>
                      <Text style={styles.redoText}>Say it again</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => answer(heard)}
                      style={styles.answerBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.answerText}>Send answer</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

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
                  disabled={!draft.trim()}
                  style={[styles.sendBtn, !draft.trim() && styles.sendBtnOff]}
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
  ack: { fontFamily: fonts.italic, fontSize: 14, lineHeight: 20, color: colors.inkLt, marginBottom: spacing.sm },
  micHint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.inkLt },
  heardBlock: { gap: spacing.sm },
  heardLabel: { ...type.label, fontSize: 10, letterSpacing: 1.4, color: colors.inkGhost, textTransform: 'uppercase' },
  heard: { fontFamily: fonts.italic, fontSize: 15, lineHeight: 22, color: colors.inkMid },
  heardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  redoBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  redoText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkLt },
  answerBtn: {
    backgroundColor: colors.teal, borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg,
  },
  answerText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },

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
