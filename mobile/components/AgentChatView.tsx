import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { PendingChangeCard } from './PendingChangeCard';
import { ClarifyTapQuestion } from './ClarifyTapQuestion';
import { OutingCard } from './OutingCard';
import { useProfileStore } from '../store/profileStore';
import { useAgentChatStore, type DisplayMessage } from '../store/agentChatStore';
import { FinalQuestionsCard } from './FinalQuestionsCard';
import { SETUP_QUESTIONS } from '../lib/agentChat/prompt';
import { useShortlistStore } from '../store/shortlistStore';
import { widenCommuteForLovedAreas } from '../lib/commuteReset';
import { useTutorialStore } from '../store/tutorialStore';

/**
 * The typed conversation, now used only by the Agent tab — the place to go
 * back and add to what you told the Agent later. The first run happens in
 * the full-screen setup instead, which walks through the three typed
 * questions one at a time. Both are text: the spoken version was removed on
 * 2026-08-28 after testing on a device: chained speech recognition, an
 * LLM and TTS put 3-8 seconds between an answer and a reply.
 * Both read the same store, so the tab continues the same thread.
 *
 * No empty state to handle: the store always seeds an opening question (see
 * agentChatStore.ts), so there's always at least one message to render —
 * the Agent asks first, rather than a chip menu waiting to be tapped.
 *
 * No KeyboardAvoidingView of its own: the Agent tab wraps this in one —
 * see app/(tabs)/agent.tsx.
 */

interface AgentChatViewProps {
  /**
   * When set, the message history is replaced by this single prompt — the
   * Agent tab's collapsed state, where the summary card above is standing in
   * for the thread and re-showing the whole conversation would bury the one
   * thing they came to do: say something new.
   */
  collapsedPrompt?: string | null;
  /** Called when they send while collapsed, so the thread can open up and
   *  show the exchange they just started. */
  onSendWhileCollapsed?: () => void;
}

export function AgentChatView({ collapsedPrompt, onSendWhileCollapsed }: AgentChatViewProps = {}) {
  const messages = useAgentChatStore((s) => s.messages);
  const status = useAgentChatStore((s) => s.status);
  const error = useAgentChatStore((s) => s.error);
  const send = useAgentChatStore((s) => s.send);
  const pending = useAgentChatStore((s) => s.pending);
  const applyPending = useAgentChatStore((s) => s.applyPending);
  const dismissPending = useAgentChatStore((s) => s.dismissPending);
  /**
   * "Which Tooting did you mean?" — asked HERE too, not only in setup
   * (Nick, 2026-09-21).
   *
   * Every message goes through the same send(), so naming an ambiguous
   * area in this tab already queued the question. Only app/setup.tsx read
   * that queue, though, so here it was detected, recorded as handled, and
   * then silently swallowed — and this tab is precisely where somebody
   * goes to change their mind about an area later.
   *
   * One at a time, oldest first: two of these stacked above the composer
   * would bury the thread they belong to.
   */
  const clarification = useAgentChatStore((s) => s.deferred)[0] ?? null;
  const resolveDeferred = useAgentChatStore((s) => s.resolveDeferred);
  const requestRankNow = useShortlistStore((s) => s.requestRankNow);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<DisplayMessage>>(null);
  const [finalDone, setFinalDone] = useState(false);
  /**
   * The authoritative "setup is over" flag, and it has to come from the
   * PROFILE rather than from this component.
   *
   * showFinalQuestions used to be `!finalDone && answers >= 3`, where
   * finalDone was local state. That worked only for as long as the
   * conversation died on restart: once the thread was persisted
   * (2026-09-07) the answer count stayed above three forever while
   * finalDone reset to false on every mount — so opening the Agent tab
   * re-showed the setup's tap questions, every time, for good (Nick's
   * screenshot). Local state cannot be the memory of something that has
   * already happened.
   */
  const setupDone = useProfileStore((s) => Boolean(s.profile.setupDoneAt));

  /**
   * "See my areas" has to actually show them.
   *
   * It used to only dismiss the card, leaving someone on the Agent tab
   * looking at the conversation they had just finished, with no indication
   * that anything had happened (Nick, 2026-09-01). It now does both halves
   * of what it says: start the ranking immediately rather than after the
   * 20-second debounce, and go to the map where the answer appears.
   */
  function seeAreas() {
    setFinalDone(true);
    /**
     * Record that setup is OVER, from this path too.
     *
     * There are two ways to finish setup — app/setup.tsx and this card on
     * the map — and only the first was writing setupDoneAt. Anyone who
     * finished here was left permanently mid-setup, which after the
     * 2026-09-07 changes meant: the Agent re-asked the tap questions on
     * every visit, replied with the setup closing line to everything, and
     * refused to answer questions about areas at all — because all three
     * are gated on this one flag. Nick hit all of it after a sign-out and
     * back in.
     *
     * Written through setProfile rather than a patch helper because
     * setupDoneAt sits on the profile itself, not inside lifestyle.
     */
    const profile = useProfileStore.getState().profile;
    if (!profile.setupDoneAt) {
      useProfileStore.getState().setProfile({ ...profile, setupDoneAt: Date.now() });
    }
    requestRankNow();
    // Same first-load walkthrough as app/setup.tsx's finish() — this is the
    // other of the two paths setup can end on, and both need it starting
    // concurrently with the ranking call above (Nick, 2026-09-11).
    useTutorialStore.getState().start();
    // Same widening as app/setup.tsx's finish() — this is the other of the
    // two paths setup can end on, and both need to leave the slider
    // covering whatever was just loved (Nick, 2026-09-11).
    void widenCommuteForLovedAreas(useProfileStore.getState().profile).then((mins) => {
      if (mins !== null) useProfileStore.getState().updateCommuteSettings({ maxCommuteMins: mins });
    });
    router.navigate('/(tabs)');
  }

  // The model asks three questions and is told not to ask the tapped four,
  // so the app has to. The store holds no turn number, so this counts
  // ANSWERS rather than the Agent's messages: an assistant count is inflated
  // by any turn where the model splits a reaction from its question, which
  // would pop this card up before all three had been asked. A person answers
  // each question once, so their turn count tracks progress far more
  // closely.
  const answers = messages.filter((m) => m.role === 'user').length;
  const showFinalQuestions = !setupDone && !finalDone && answers >= SETUP_QUESTIONS.length;

  /**
   * Keep the last message in view when the confirm card appears.
   *
   * The card renders BELOW the list, so it does not change the list's
   * content size and onContentSizeChange never fires — but it does take
   * space, pushing the reply they just received up out of sight. Which
   * makes the card ask "update your map?" about an answer they cannot read
   * (Nick, 2026-09-07). Two frames because the card's own layout has to
   * settle before the list knows how much room it has left.
   */
  useEffect(() => {
    if (!pending) return;
    const t = requestAnimationFrame(() =>
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })),
    );
    return () => cancelAnimationFrame(t);
  }, [pending]);

  function submit(text: string) {
    if (!text.trim()) return;
    if (collapsedPrompt) onSendWhileCollapsed?.();
    send(text);
    setInput('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <View style={styles.container}>
      {collapsedPrompt ? (
        // Rendered as a normal assistant bubble rather than as a label, so
        // it reads as the Agent having just said it. Deliberately NOT
        // appended to the stored thread: it is a standing invitation shown
        // every time they arrive, and adding it for real would stack up a
        // pile of identical unanswered questions in the history.
        <View style={styles.collapsedPrompt}>
          <MessageBubble message={{ id: 'returning', role: 'assistant', text: collapsedPrompt }} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => <MessageBubble message={item} />}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
      )}


      {/* A visible thinking row. send() adds the message and returns —
          the answer arrives later on a chained promise — so the only sign
          anything was happening was a small spinner in the send button, and
          a second question queued behind a slow first one looked exactly
          like being ignored (Nick, 2026-09-08). */}
      {status === 'sending' && (
        <View style={styles.thinkingRow}>
          <ActivityIndicator size="small" color={colors.teal} />
          <Text style={styles.thinkingText}>Looking that up…</Text>
        </View>
      )}

      {pending && (
        <PendingChangeCard
          change={pending}
          onApply={applyPending}
          onDismiss={dismissPending}
        />
      )}

      {/* Above the composer, below the thread — the same slot as a pending
          change, because it is the same kind of thing: something the Agent
          needs from you before what you said can mean anything. */}
      {clarification && (
        <ClarifyTapQuestion
          compact
          clarification={clarification}
          onAnswered={() => resolveDeferred(clarification.stem)}
        />
      )}

      {status === 'error' && error && <Text style={styles.errorText}>{error}</Text>}

      {showFinalQuestions && <FinalQuestionsCard onDone={seeAreas} />}

      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Tell the Agent what you're after…"
          placeholderTextColor={colors.inkGhost}
          style={styles.input}
          multiline
        />
        <Pressable
          onPress={() => submit(input)}
          disabled={status === 'sending' || !input.trim()}
          style={[styles.sendBtn, (status === 'sending' || !input.trim()) && styles.sendBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          {status === 'sending' ? (
            <ActivityIndicator size="small" color={colors.cream} />
          ) : (
            <Text style={styles.sendBtnText}>Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const mine = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      {/*
        One bubble, one paragraph (Nick, 2026-09-09). This used to be two
        blocks — the measured answer, then a separately bordered,
        separately labelled "not from our data" aside for anything the
        model added from its own knowledge. It "looked awful" as two
        pieces of furniture, and the fix is not a softer border: it is not
        splitting it at all. weaveReply (lib/agentChat/parse.ts) has
        already combined the two into this single string, so what protects
        the reader now is the PROMPT's own rule that anything added from
        the model's memory must never contradict the brief — there is no
        visible seam left for a human to catch a contradiction at, so the
        model has to not make one.
      */}
      <View style={styles.bubbleStack}>
        {/*
          A day out arrives as cards rather than as the paragraph in
          `text`, which is kept only so anything that understands text
          alone still shows something. The intro line is the first
          paragraph of that text; the stops are the cards below it.
        */}
        {message.stops?.length ? (
          <View style={styles.outing}>
            <View style={[styles.bubble, styles.bubbleAgent]}>
              <Text style={styles.bubbleText}>{message.text.split('\n')[0]}</Text>
            </View>
            {message.stops.map((stop) => (
              <OutingCard key={stop.placeId} stop={stop} />
            ))}
          </View>
        ) : message.text.length > 0 ? (
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleAgent]}>
            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.text}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  collapsedPrompt: { flex: 1, justifyContent: 'flex-end' },
  messageList: { paddingVertical: spacing.sm, gap: spacing.sm },
  bubbleStack: { flexShrink: 1, gap: 6, maxWidth: '86%' },
  // Wider than a bubble: a photo at bubble width is a postage stamp.
  outing: { gap: spacing.sm, width: '100%' },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  bubbleAgent: { backgroundColor: colors.tealSoft, borderWidth: 1, borderColor: colors.tealLine },
  bubbleMine: { backgroundColor: colors.ink },
  bubbleText: { ...type.body, fontSize: 14, color: colors.ink, lineHeight: 19 },
  bubbleTextMine: { color: colors.cream },
  thinkingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm, paddingBottom: spacing.xs,
  },
  thinkingText: { fontFamily: fonts.italic, fontSize: 12.5, color: colors.inkMid },
  errorText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.red, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  input: { fontFamily: fonts.regular, flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.ink,
    maxHeight: 100 },
  sendBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { ...type.bodyStrong, fontSize: 13, color: colors.cream },
});
