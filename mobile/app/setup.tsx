import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
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
import { useShortlistStore } from '../store/shortlistStore';
import { CHAT_STEPS, TAP_STEPS, currentStepNumber, setupProgress, TOTAL_STEPS } from '../lib/setupSteps';
import { widenCommuteForLovedAreas } from '../lib/commuteReset';
import { useTutorialStore } from '../store/tutorialStore';

/**
 * The setup screen: everything Maloca needs to know before it can show
 * anyone a map worth looking at.
 *
 * FULL SCREEN, and no map behind it (Nick, 2026-08-30). It used to be a
 * card floating over the map with the thread squeezed into 32% of the
 * window — a letterbox, which is most of why it never felt like the
 * messaging app it was shaped like. This owns the whole screen.
 *
 * TOTAL_STEPS questions (six, absent a clarification): three typed to
 * the Agent, three tapped (lib/setupSteps.ts owns that list - the count
 * has moved twice since this screen was written, so it is read from
 * there rather than repeated here as a number that can go stale again).
 * The hairline at the very top fills with teal as they go, which is the
 * answer to the feedback Rosie and Harriet gave — it has to be obvious
 * that question one leads to question two and that the end is getting
 * closer. The old card counted "Question N of 5" and then served two
 * more nobody had been warned about.
 *
 * Deliberately NOT reachable from the tab bar: this is a one-time gate
 * between signing in and the app. app/_layout.tsx routes here while
 * store/setupStore.ts says this account still owes us the questions — a
 * latch decided once at sign-in, NOT a live read of the profile. Coming
 * back later to change an answer is what the Agent tab is for.
 */
/**
 * Whether the keyboard is on screen.
 *
 * Needed because the composer clears the home indicator with its own
 * bottom padding, and while the keyboard is up the keyboard is covering
 * the home indicator — so that padding becomes a strip of dead cream
 * between the text box and the top of the keys (Nick, 2026-09-21).
 *
 * "Will" rather than "did" on iOS so the padding changes in the same
 * frame as the keyboard animates, instead of snapping once it lands.
 * Android only fires the "did" pair.
 */
function useKeyboardShowing(): boolean {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setShowing(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setShowing(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return showing;
}

export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const keyboardShowing = useKeyboardShowing();
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
   * A worked example in the composer, but only on the question it fits.
   *
   * The composer is shared by all three typed questions, and "e.g. Angel
   * and Stockwell" (Nick, 2026-09-22) is an answer to the first one only -
   * shown against "what is it about there that you like?" it would read
   * as two more areas rather than an example of naming several.
   */
  const currentChatStep = CHAT_STEPS[chatAnswers];
  const composerPlaceholder =
    currentChatStep?.id === 'anchor' ? 'e.g. Angel and Stockwell' : 'Type your answer…';

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
    // Also when the keyboard opens: the thread has just lost half its
    // height, and what matters is the newest message, not the oldest.
  }, [messages.length, keyboardShowing]);

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
    // Rank NOW rather than after the 20-second debounce. Every tap question
    // writes to the profile and restarts that timer, so the last thing
    // setup does is guarantee the longest possible wait — and the map they
    // land on has nothing to show for it (Nick, 2026-09-01).
    useShortlistStore.getState().requestRankNow();
    // Starts the first-load walkthrough CONCURRENTLY with that ranking
    // call, not after it — its whole job is to give someone something to
    // look at while "Maloca is cookin'" would otherwise be a blank wait
    // (Nick, 2026-09-11). No-ops after the first time ever (see start()).
    useTutorialStore.getState().start();
    // If the commute slider was left short of what a loved area actually
    // needs, widen it so the map they land on doesn't silently drop the
    // area they just said they loved (Nick, 2026-09-11).
    void widenCommuteForLovedAreas(useProfileStore.getState().profile).then((mins) => {
      if (mins !== null) useProfileStore.getState().updateCommuteSettings({ maxCommuteMins: mins });
    });
    // Every clarification in the queue has now been asked, so it is
    // emptied here rather than as each one is answered — see
    // clearDeferred() for why the two are not the same thing. Without it
    // the Agent tab, which renders the same queue, asks which Tooting you
    // meant again the moment you arrive (Nick, 2026-09-22).
    useAgentChatStore.getState().clearDeferred();
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

      {/*
        No keyboardVerticalOffset (was insets.top + 4, removed 2026-09-21).
        It is meant to declare content ABOVE this view that the keyboard
        does not know about — a navigation header, say. This screen has no
        header, and KeyboardAvoidingView already measures where it starts,
        so the offset was pure surplus: it pushed the computed padding up
        by another ~59pt, which is most of the "dead white space between
        the top of the keyboard and the type your answer box" Nick
        reported.
      */}
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* The headline is a greeting, and a greeting is for arriving —
            it has said its piece by question two, and after that it is
            four lines of the screen the conversation wants (Nick,
            2026-09-21). The step count stays: that one keeps answering a
            live question. */}
        <View style={[styles.header, stepNumber > 1 && styles.headerTight]}>
          <Text style={styles.stepCount}>
            STEP {stepNumber} OF {TOTAL_STEPS + extraTaps}
          </Text>
          {stepNumber === 1 && (
            // Nick's wording, 2026-09-22. TOTAL_STEPS rather than a
            // hardcoded 6, so this can never say a different number to
            // the STEP line directly above it - the exact drift that
            // "Question N of 5" caused before this screen existed
            // (2026-08-30, see the file header).
            <Text style={styles.headline}>
              Welcome to Maloca! You're just {TOTAL_STEPS} simple steps from getting your custom
              househunt map with areas we think you'll love...
            </Text>
          )}
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

            {/* The home indicator only needs clearing when the keyboard
                is not already covering it. */}
            <View
              style={[
                styles.composer,
                { paddingBottom: (keyboardShowing ? 0 : insets.bottom) + spacing.sm },
              ]}
            >
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder={composerPlaceholder}
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
  /** Once the headline has gone there is only a label left, and it does
   *  not need a headline's worth of room around it. */
  headerTight: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  stepCount: { ...type.label, color: colors.teal },
  headline: { ...type.display, fontSize: 23, lineHeight: 29, color: colors.ink },

  thread: { flex: 1 },
  /**
   * Messages sit at the BOTTOM, against the composer, the way every
   * messaging app does it — not at the top with a growing field of cream
   * underneath them (Nick, 2026-09-21: "it needs to act more like a
   * WhatsApp chat"). flexGrow means the container fills the thread when
   * there are two messages; once there are more than fit, it goes back to
   * behaving like an ordinary scroll view.
   */
  threadInner: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },

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
