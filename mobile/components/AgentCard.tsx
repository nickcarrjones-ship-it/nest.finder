import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { MalocaLogo, MalocaMark } from './MalocaLogo';
import { FinalQuestionsCard } from './FinalQuestionsCard';
import { useAgentChatStore } from '../store/agentChatStore';
import { SPOKEN_QUESTIONS } from '../lib/agentChat/prompt';

/**
 * The Agent conversation, as a card over the map. First run only — the
 * Agent tab carries the thread on afterwards for follow-up questions.
 *
 * TEXT, not voice (Nick, 2026-08-28). The spoken version was built first and
 * removed after testing on a device. Chained speech recognition, an LLM and
 * TTS put three to eight seconds between an answer and a reply — and even
 * with every request instant, a spoken question takes five seconds to hear
 * and one to read. Real speech-to-speech would fix it but costs roughly ten
 * times as much per conversation: worth revisiting for a paid tier, not
 * before.
 *
 * Everything that was doing real work survives: the ordered questions, the
 * anchor, and the clarification when someone names a place that could mean
 * five different ones. That last is now INSTANT — composed and answered
 * locally with no model call at all (see agentChatStore.clarifyLocally), so
 * "Clapham" gets "Common, High Street, or Junction?" with no wait.
 *
 * Shaped like a messaging thread because that is what people already know
 * how to use, and because seeing what you said earlier genuinely helps when
 * you are describing where you want to live.
 */

const COUNTER_ON_TEAL = '#1F5C5A';

export function AgentCard({ onClose }: { onClose: () => void }) {
  const messages = useAgentChatStore((s) => s.messages);
  const status = useAgentChatStore((s) => s.status);
  const error = useAgentChatStore((s) => s.error);
  const send = useAgentChatStore((s) => s.send);
  const followUps = useAgentChatStore((s) => s.followUps);
  const complete = useAgentChatStore((s) => s.complete);

  const [started, setStarted] = useState(false);
  const [draft, setDraft] = useState('');
  const scroller = useRef<ScrollView>(null);
  // A fixed transcript height overflows a small screen once the keyboard is
  // up. A share of the window leaves room for the composer on any phone.
  const { height: windowHeight } = useWindowDimensions();
  const threadHeight = Math.max(140, Math.min(300, windowHeight * 0.32));

  /**
   * Answers to SCRIPTED questions. A clarification and its answer must not
   * consume one of the five, or answering "the Common end" would skip past
   * "what is it about there that you like?".
   */
  const answers = Math.max(0, messages.filter((m) => m.role === 'user').length - followUps);
  /**
   * Either signal finishes it.
   *
   * Counting answers alone works only while the app and the model agree on
   * where they are, and they can drift: the model wrapped up saying "just
   * two quick taps left" while the count still read four, so the final card
   * never appeared and the conversation dead-ended (Nick, 2026-08-28).
   */
  const done = complete || answers >= SPOKEN_QUESTIONS.length;
  const questionNumber = Math.min(answers + 1, SPOKEN_QUESTIONS.length);

  // Follow the conversation as it grows, the way a messaging app does.
  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, status]);

  function submit() {
    const text = draft.trim();
    if (!text || status === 'sending') return;
    setDraft('');
    send(text);
  }

  if (!started) {
    return (
      <Shell>
        <Intro onStart={() => setStarted(true)} />
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <FinalQuestionsCard onDone={onClose} />
      </Shell>
    );
  }

  return (
    <Shell>
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

      <ScrollView
        ref={scroller}
        style={[styles.thread, { maxHeight: threadHeight }]}
        contentContainerStyle={styles.threadInner}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) => (
          <View
            key={m.id}
            style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs]}
          >
            <Text style={m.role === 'user' ? styles.mineText : styles.theirsText}>{m.text}</Text>
          </View>
        ))}

        {/* The "typing" line, so a wait never looks like nothing happening. */}
        {status === 'sending' && (
          <View style={[styles.bubble, styles.theirs, styles.typingBubble]}>
            <ActivityIndicator size="small" color={colors.inkLt} />
            <Text style={styles.typingText}>Maloca Agent is typing…</Text>
          </View>
        )}
      </ScrollView>

      {status === 'error' && error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type your answer…"
          placeholderTextColor={colors.inkLt}
          multiline
          onSubmitEditing={submit}
          blurOnSubmit
          returnKeyType="send"
          accessibilityLabel="Your answer"
        />
        <Pressable
          onPress={submit}
          disabled={status === 'sending' || !draft.trim()}
          style={[styles.sendBtn, (status === 'sending' || !draft.trim()) && styles.sendDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>

      <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
        <Text style={styles.link}>Finish later</Text>
      </Pressable>
    </Shell>
  );
}

/**
 * The card sits centred over the map — until the keyboard opens, when
 * centring puts the text box behind it (Nick, on device 2026-08-28).
 * KeyboardAvoidingView lifts the whole card, and the transcript gives up
 * height first so the composer and the newest message stay visible.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      // That "Android is handled elsewhere" reasoning belongs to BottomSheet,
      // which sits inside an RN Modal — Android hardcodes adjustResize for
      // every Modal's own window, no matter what app.json says. This card is
      // a plain overlay on the map screen, not a Modal, so nothing was
      // actually watching the keyboard here and the composer stayed put
      // under it (Nick, on device 2026-08-29). Same fix as the Agent tab's
      // own screen (app/(tabs)/agent.tsx), which sits in that same kind of
      // plain window and already uses 'height' for exactly this reason.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      pointerEvents="box-none"
    >
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.card}>{children}</View>
    </KeyboardAvoidingView>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.introBlock}>
      <View style={styles.header}>
        <MalocaLogo scale={0.88} />
        <Text style={styles.agentWord}>Agent</Text>
      </View>

      <View style={styles.points}>
        <Point text="Five questions about the London you actually want to live in." />
        <Point text="Your map updates as we go." />
      </View>

      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.markBtn, pressed && styles.markBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Start the Maloca Agent conversation"
      >
        <MalocaMark height={30} markColor={colors.cream} counterColor={COUNTER_ON_TEAL} />
      </Pressable>

      <Text style={styles.caption}>Tap to start</Text>
    </View>
  );
}

function Point({ text }: { text: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.pointDot} />
      <Text style={styles.pointText}>{text}</Text>
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
    gap: spacing.lg,
  },

  introBlock: { alignItems: 'center', gap: spacing.lg },
  header: { alignItems: 'center', gap: 6 },
  agentWord: {
    ...type.label, fontSize: 11, letterSpacing: 3.4,
    color: colors.teal, textTransform: 'uppercase',
  },
  points: { gap: spacing.sm, alignSelf: 'stretch' },
  point: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  pointDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.teal, marginTop: 7 },
  pointText: { ...type.body, flex: 1, fontSize: 14, lineHeight: 20, color: colors.inkMid },
  markBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center',
  },
  markBtnPressed: { opacity: 0.85 },
  caption: { ...type.body, fontSize: 13, color: colors.inkLt },

  progressRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: spacing.md,
  },
  eyebrow: {
    ...type.label, fontSize: 10, letterSpacing: 1.4,
    color: colors.teal, textTransform: 'uppercase',
  },
  dots: { flexDirection: 'row', gap: 4 },
  dash: { width: 16, height: 3, borderRadius: 2, backgroundColor: colors.rule },
  dashDone: { backgroundColor: colors.teal },

  thread: {},
  threadInner: { gap: spacing.sm, paddingBottom: 2 },
  bubble: { maxWidth: '86%', paddingVertical: 9, paddingHorizontal: 13, borderRadius: radius.lg },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.tealSoft, borderTopLeftRadius: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.teal, borderTopRightRadius: 4 },
  theirsText: { ...type.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  mineText: { ...type.body, fontSize: 15, lineHeight: 21, color: colors.white },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typingText: { ...type.body, fontSize: 14, color: colors.inkLt, fontStyle: 'italic' },

  errorText: { ...type.body, fontSize: 13, color: colors.terracotta },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1, minHeight: 44, maxHeight: 110,
    paddingHorizontal: spacing.md, paddingVertical: 11,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.rule,
    backgroundColor: colors.white,
    ...type.body, fontSize: 15, color: colors.ink,
  },
  sendBtn: {
    minHeight: 44, paddingHorizontal: spacing.md,
    borderRadius: radius.lg, backgroundColor: colors.teal,
    alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },

  link: { ...type.body, fontSize: 13, color: colors.teal, textAlign: 'center' },
});
