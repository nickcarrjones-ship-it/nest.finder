import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, type } from '../../theme';
import { AgentChatView } from '../../components/AgentChatView';
import { ConversationSummary } from '../../components/ConversationSummary';
import { summariseConversation } from '../../lib/conversationSummary';
import { useProfileStore } from '../../store/profileStore';
import { useAgentChatStore } from '../../store/agentChatStore';
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

  /**
   * BOTH conditions, not just the second (Nick, 2026-09-09).
   *
   * This was `summary.hasAnything` alone, and question one of setup is
   * "which areas are you already looking at?" — so the very first answer
   * put a loved area on the profile, hasAnything flipped true, and the
   * screen switched to the returning view MID-SETUP: the thread collapsed
   * out of sight and the standing "anything new since we last spoke?"
   * prompt replaced question two. Nick described it exactly — the
   * questions "fall over and skip straight through" right after naming
   * his areas.
   *
   * hasAnything answers "is there anything worth showing", which is a
   * necessary condition and was never the whole one. setupDoneAt is what
   * actually separates arriving from coming back, and it is the same flag
   * the store gates the scripted questions on — so the screen and the
   * conversation now change mode together instead of one switching a few
   * turns before the other.
   */
  const setupDone = Boolean(profile.setupDoneAt);
  const returning = setupDone && summary.hasAnything;
  const collapsed = returning && !historyOpen;

  /**
   * Whether there is anything for "show all messages" to show.
   *
   * The thread it opens is the conversation SINCE setup (see
   * setupEndedAt), and straight after setup that is empty - so the button
   * was offering to reveal nothing, which is one more thing to read on a
   * screen Nick already called cluttered (2026-09-22).
   */
  const messageCount = useAgentChatStore((s) => s.messages.length);
  const setupEndedAt = useAgentChatStore((s) => s.setupEndedAt);
  const hasHistory = messageCount > setupEndedAt;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>Maloca Agent</Text>
      {/*
        No keyboardVerticalOffset (was 90, removed 2026-09-22).
        
        That prop exists to correct for a view whose measured position is
        not its position on screen - KeyboardAvoidingView reads its own
        frame from onLayout, which is relative to its PARENT. Here the
        parent is this screen's root, which starts at the top of the tab
        content area, so the measured frame already is the screen frame and
        there is nothing to correct. 90 was simply added to the padding:
        90pt of dead cream between the text box and the top of the keys
        (Nick, 2026-09-22). Same mistake as app/setup.tsx carried the day
        before, for the same reason.
        
        The tab bar needs no allowance either. It sits BELOW this screen
        rather than over it, so the composer's own bottom edge is already
        above it, and the keyboard's overlap with that edge is exactly what
        gets measured with no offset at all.
      */}
      <KeyboardAvoidingView
        style={styles.chatWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {returning && (
          <View>
            <ConversationSummary
              summary={summary}
              open={summaryOpen}
              onToggle={() => setSummaryOpen((o) => !o)}
            />
            {hasHistory && (
              <Pressable
                onPress={() => setHistoryOpen((h) => !h)}
                style={styles.historyToggle}
                accessibilityRole="button"
              >
                <Text style={styles.historyToggleText}>
                  {historyOpen ? 'Hide messages' : 'Show all messages'}
                </Text>
              </Pressable>
            )}
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
