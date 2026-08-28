import { useEffect, useRef, useState } from 'react';
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
import { useAgentChatStore, type DisplayMessage } from '../store/agentChatStore';
import { FinalQuestionsCard } from './FinalQuestionsCard';
import { SPOKEN_QUESTIONS } from '../lib/agentChat/prompt';

/**
 * The typed conversation, now used only by the Agent tab — the place to go
 * back and add to what you told the Agent later. The first run happens in
 * AgentCard over the map instead, which walks through the five questions
 * one at a time. Both are text: the spoken version was removed on
 * 2026-08-28 after testing on a device — see AgentCard's header for why.
 * Both read the same store, so the tab continues the same thread.
 *
 * No empty state to handle: the store always seeds an opening question (see
 * agentChatStore.ts), so there's always at least one message to render —
 * the Agent asks first, rather than a chip menu waiting to be tapped.
 *
 * No KeyboardAvoidingView of its own: the Agent tab wraps this in one —
 * see app/(tabs)/agent.tsx.
 */

export function AgentChatView() {
  const messages = useAgentChatStore((s) => s.messages);
  const status = useAgentChatStore((s) => s.status);
  const error = useAgentChatStore((s) => s.error);
  const send = useAgentChatStore((s) => s.send);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<DisplayMessage>>(null);
  const [finalDone, setFinalDone] = useState(false);

  // Speak each new Agent reply as it lands, keyed on the message id so a

  // The model asks five questions and is told not to ask the last two, so
  // the app has to. The store holds no turn number, so this counts ANSWERS
  // rather than the Agent's messages: an assistant count is inflated by any
  // turn where the model splits a reaction from its question, which would
  // pop this card up before all five had been asked. A person answers each
  // question once, so their turn count tracks progress far more closely.
  const answers = messages.filter((m) => m.role === 'user').length;
  const showFinalQuestions = !finalDone && answers >= SPOKEN_QUESTIONS.length;

  function submit(text: string) {
    if (!text.trim()) return;
    send(text);
    setInput('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => <MessageBubble message={item} />}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />


      {status === 'error' && error && <Text style={styles.errorText}>{error}</Text>}

      {showFinalQuestions && <FinalQuestionsCard onDone={() => setFinalDone(true)} />}

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
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleAgent]}>
        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messageList: { paddingVertical: spacing.sm, gap: spacing.sm },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  bubbleAgent: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.rule },
  bubbleMine: { backgroundColor: colors.ink },
  bubbleText: { ...type.body, fontSize: 14, color: colors.ink, lineHeight: 19 },
  bubbleTextMine: { color: colors.cream },
  speakingRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.tealSoft,
  },
  speakingText: {
    ...type.label,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.teal,
    textTransform: 'uppercase',
  },
  errorText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.red, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
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
