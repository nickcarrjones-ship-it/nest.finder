import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, type } from '../theme';
import { useAgentChatStore, type DisplayMessage } from '../store/agentChatStore';
import { MicButton } from './MicButton';

/**
 * The Agent conversation itself — built once, rendered by both surfaces
 * (a ~1/3-screen card launched from the Map, and full-screen on the Agent
 * tab). Both read the same store, so switching between them mid-conversation
 * shows the same thread, not two.
 *
 * No empty state to handle: the store always seeds an opening question (see
 * agentChatStore.ts), so there's always at least one message to render —
 * the Agent asks first, rather than a chip menu waiting to be tapped.
 *
 * No KeyboardAvoidingView of its own (2026-08-24, moved out): one of this
 * component's two homes (AgentChatCard) is a BottomSheet, which now handles
 * keyboard avoidance itself for every sheet in the app — wrapping here too
 * would double-apply it there. The other home (the full-screen Agent tab)
 * isn't inside a sheet, so IT wraps this component in its own
 * KeyboardAvoidingView instead — see app/(tabs)/agent.tsx.
 */
export function AgentChatView() {
  const messages = useAgentChatStore((s) => s.messages);
  const status = useAgentChatStore((s) => s.status);
  const error = useAgentChatStore((s) => s.error);
  const send = useAgentChatStore((s) => s.send);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<DisplayMessage>>(null);

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

      <View style={styles.inputRow}>
        <MicButton onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))} />
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
  errorText: { fontSize: 12.5, color: colors.red, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.ink,
    maxHeight: 100,
  },
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
