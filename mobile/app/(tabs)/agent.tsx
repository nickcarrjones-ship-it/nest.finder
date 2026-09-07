import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, type } from '../../theme';
import { AgentChatView } from '../../components/AgentChatView';
import { ConversationSummary } from '../../components/ConversationSummary';
import { summariseConversation } from '../../lib/conversationSummary';
import { useProfileStore } from '../../store/profileStore';
import { RETURNING_MESSAGE } from '../../lib/agentChat/prompt';

/**
 * The Agent's full-screen home — same conversation as the compact card on
 * the Map (shared store), for coming back later to tweak or add to what
 * you've already told it.
 *
 * COMING BACK IS A DIFFERENT SCREEN FROM ARRIVING (Nick, 2026-09-07). This
 * used to reopen on the setup opener — "are there any areas you're already
 * looking at?" — asked of someone who answered it days ago. Re-asking is
 * worse than redundant: it reads as though nothing was kept, which makes
 * answering a second time feel pointless too.
 *
 * So once there is anything to remember, the tab leads with what it knows,
 * keeps the thread folded away behind "Show all messages", and asks
 * something that assumes the history instead of restarting it. Before then
 * — mid-setup, nothing stored — it is exactly the conversation it always
 * was, because at that point the scripted questions ARE the right thing to
 * show.
 *
 * Not inside a sheet here, so this screen owns its own keyboard avoidance
 * — AgentChatView itself stopped wrapping in one (2026-08-24) once
 * BottomSheet started handling it for the compact-card version, and two
 * nested KeyboardAvoidingViews double up rather than adding up.
 */
export default function AgentScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const summary = useMemo(() => summariseConversation(profile), [profile]);
  /**
   * Two separate things, deliberately not one flag.
   *
   * `summaryOpen` is whether the green card is showing everything it knows;
   * `historyOpen` is whether the message thread is on screen instead of the
   * standing "anything new?" prompt. Conflating them meant opening the
   * summary also dumped the whole history, and neither could be sized
   * sensibly against the other.
   */
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Nothing stored yet means setup is still running, and the scripted
  // conversation is exactly what should be on screen.
  const returning = summary.hasAnything;
  const collapsed = returning && !historyOpen;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>Maloca Agent</Text>
      <KeyboardAvoidingView
        style={styles.chatWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {returning && (
          <View>
            <ConversationSummary
              summary={summary}
              open={summaryOpen}
              onToggle={() => setSummaryOpen((o) => !o)}
            />
            <Pressable
              onPress={() => setHistoryOpen((h) => !h)}
              style={styles.historyToggle}
              accessibilityRole="button"
            >
              <Text style={styles.historyToggleText}>
                {historyOpen ? 'Hide messages' : 'Show all messages'}
              </Text>
            </Pressable>
          </View>
        )}
        <AgentChatView
          collapsedPrompt={collapsed ? RETURNING_MESSAGE : null}
          onSendWhileCollapsed={() => {
            // Sending makes what they just said the important thing on the
            // screen, so the summary gets out of the way and the thread
            // opens to show the exchange.
            setSummaryOpen(false);
            setHistoryOpen(true);
          }}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: spacing.lg },
  title: { ...type.title, color: colors.ink, marginBottom: spacing.sm },
  chatWrap: { flex: 1 },
  // No height cap and no inner scroll. The card is either shut — one line —
  // or open and complete; a summary that clips what it knows behind a
  // gesture nobody expects is worse than one that takes the room.
  historyToggle: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: spacing.xs },
  historyToggleText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.teal },
});
