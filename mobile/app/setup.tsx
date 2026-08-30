import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, fonts, radius, spacing, type } from '../theme';
import { SetupProgress } from '../components/SetupProgress';
import { SetupTapQuestions } from '../components/SetupTapQuestions';
import { ClarifyTapQuestion } from '../components/ClarifyTapQuestion';
import { useAgentChatStore } from '../store/agentChatStore';
import { useProfileStore } from '../store/profileStore';
import { useSetupStore } from '../store/setupStore';
import { CHAT_STEPS, TAP_STEPS, currentStepNumber, setupProgress, TOTAL_STEPS } from '../lib/setupSteps';

/**
 * The setup screen: everything Maloca needs to know before it can show
 * anyone a map worth looking at.
 *
 * FULL SCREEN, and no map behind it (Nick, 2026-08-30). It used to be a
 * card floating over the map with the thread squeezed into 32% of the
 * window — a letterbox, which is most of why it never felt like the
 * messaging app it was shaped like. This owns the whole screen.
 *
 * Seven questions: three typed to the Agent, four tapped (lib/setupSteps.ts
 * owns that list). The hairline at the very top fills with teal as they go,
 * which is the answer to the feedback Rosie and Harriet gave — it has to be
 * obvious that question one leads to question two and that the end is
 * getting closer. The old card counted "Question N of 5" and then served
 * two more nobody had been warned about.
 *
 * Deliberately NOT reachable from the tab bar: this is a one-time gate
 * between signing in and the app. app/_layout.tsx routes here while
 * store/setupStore.ts says this account still owes us the questions — a
 * latch decided once at sign-in, NOT a live read of the profile. Coming
 * back later to change an answer is what the Agent tab is for.
 */
export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const messages = useAgentChatStore((s) => s.messages);
  const error = useAgentChatStore((s) => s.error);
  const send = useAgentChatStore((s) => s.send);
  const followUps = useAgentChatStore((s) => s.followUps);
  const complete = useAgentChatStore((s) => s.complete);
  const deferred = useAgentChatStore((s) => s.deferred);

  const [draft, setDraft] = useState('');
  const [tapIndex, setTapIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const setProfile = useProfileStore((s) => s.setProfile);
  const finishSetup = useSetupStore((s) => s.finish);

  /**
   * Answers to SCRIPTED questions only. A clarification and its answer must
   * not consume one of the three, or answering "the Common end" would skip
   * past "what is it about there that you like?" — and the progress line
   * would run ahead of where they actually are.
   */
  const chatAnswers = Math.max(0, messages.filter((m) => m.role === 'user').length - followUps);

  /**
   * Either signal ends the conversation. Counting answers alone works only
   * while the app and the model agree on where they are, and they drift:
   * the model wrapped up saying "just a few taps left" while the count
   * still read short, and the conversation dead-ended (Nick, 2026-08-28).
   */
  const chatDone = complete || chatAnswers >= CHAT_STEPS.length;

  /**
   * The tap stage is the deferred clarifications FIRST, then the fixed
   * four. Clarifications come first because they pin down the anchor —
   * which Clapham they meant — and everything the app suggests hangs off
   * that, so it is the answer worth having soonest.
   */
  const extraTaps = deferred.length;
  const totalTaps = extraTaps + TAP_STEPS.length;
  const progress = setupProgress(chatAnswers, tapIndex, extraTaps);
  const stepNumber = currentStepNumber(chatAnswers, tapIndex, extraTaps);

  // Follow the conversation as it grows, the way a messaging app does.
  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length]);

  function submit() {
    // Deliberately NOT gated on status. The next question is already on
    // screen from the local script, so making someone wait for the previous
    // turn's background extraction would put the delay straight back —
    // sends are queued in order by the store (Nick, 2026-08-30).
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    send(text);
  }

  function finish() {
    // Persisted on the profile, so abandoning setup and relaunching resumes
    // it rather than dropping someone on the map half-built. This also
    // syncs to Firebase like any other profile change, so finishing on one
    // phone means the other one does not ask again.
    setProfile({ ...useProfileStore.getState().profile, setupDoneAt: Date.now() });
    // Clears the gate. Routing alone would not: _layout re-renders and
    // would send them straight back here.
    finishSetup();
    // replace, not push: setup is a gate, not somewhere to come back to
    // with a back gesture.
    router.replace('/(tabs)');
  }

  return (
    <View style={styles.screen}>
      {/* Above everything, hard against the top of the safe area — a rule,
          not a widget. */}
      <View style={{ paddingTop: insets.top }}>
        <SetupProgress progress={progress} />
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 4 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.stepCount}>
            STEP {stepNumber} OF {TOTAL_STEPS + extraTaps}
          </Text>
          <Text style={styles.headline}>
            Before we get stuck in, Maloca needs to know a bit more about you and your search.
          </Text>
        </View>

        {chatDone ? (
          <ScrollView
            style={styles.taps}
            contentContainerStyle={[styles.tapsInner, { paddingBottom: insets.bottom + spacing.xl }]}
            keyboardShouldPersistTaps="handled"
          >
            {tapIndex < extraTaps ? (
              <ClarifyTapQuestion
                clarification={deferred[tapIndex]}
                onAnswered={() => setTapIndex((i) => i + 1)}
              />
            ) : (
              <SetupTapQuestions
                index={tapIndex - extraTaps}
                onAnswered={() => setTapIndex((i) => i + 1)}
                onFinished={() => {
                  setTapIndex(totalTaps);
                  finish();
                }}
              />
            )}
          </ScrollView>
        ) : (
          <>
            <ScrollView
              ref={scroller}
              style={styles.thread}
              contentContainerStyle={styles.threadInner}
              keyboardShouldPersistTaps="handled"
            >
              {messages.map((m) => (
                <View
                  key={m.id}
                  style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs]}
                >
                  <Text style={m.role === 'user' ? styles.mineText : styles.theirsText}>
                    {m.text}
                  </Text>
                </View>
              ))}

            </ScrollView>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type your answer…"
                placeholderTextColor={colors.inkGhost}
                multiline
                returnKeyType="send"
                onSubmitEditing={submit}
                blurOnSubmit
              />
              <Pressable
                style={[styles.send, !draft.trim() && styles.sendOff]}
                onPress={submit}
                disabled={!draft.trim()}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                <Text style={styles.sendText}>↑</Text>
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  body: { flex: 1 },

  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: 6 },
  stepCount: { ...type.label, color: colors.teal },
  headline: { ...type.display, fontSize: 23, lineHeight: 29, color: colors.ink },

  thread: { flex: 1 },
  threadInner: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },

  bubble: { maxWidth: '86%', paddingVertical: 10, paddingHorizontal: 13, borderRadius: 16 },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderBottomLeftRadius: 5,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.teal, borderBottomRightRadius: 5 },
  theirsText: { ...type.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  mineText: { ...type.body, fontSize: 15, lineHeight: 21, color: colors.white },


  error: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.red,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    backgroundColor: colors.paper,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 22,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { backgroundColor: colors.creamDk },
  sendText: { color: colors.white, fontSize: 20, fontFamily: fonts.bold, lineHeight: 22 },

  taps: { flex: 1 },
  tapsInner: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
