import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../../theme';
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
  const [expanded, setExpanded] = useState(false);

  // Nothing stored yet means setup is still running, and the scripted
  // conversation is exactly what should be on screen.
  const returning = summary.hasAnything;
  const collapsed = returning && !expanded;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>Maloca Agent</Text>
      <KeyboardAvoidingView
        style={styles.chatWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {returning && (
          // Scrolls on its own so a long summary can never squeeze the
          // conversation off the bottom of a small screen — the composer
          // has to stay reachable whatever is in here.
          <ScrollView style={styles.summaryWrap} showsVerticalScrollIndicator={false}>
            <ConversationSummary
              summary={summary}
              expanded={expanded}
              onToggle={() => setExpanded((e) => !e)}
            />
          </ScrollView>
        )}
        <AgentChatView
          collapsedPrompt={collapsed ? RETURNING_MESSAGE : null}
          onSendWhileCollapsed={() => setExpanded(true)}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: spacing.lg },
  title: { ...type.title, color: colors.ink, marginBottom: spacing.sm },
  chatWrap: { flex: 1 },
  // Capped rather than free-growing: the summary is context, the composer is
  // the point of the screen.
  summaryWrap: { flexGrow: 0, maxHeight: 260 },
});
