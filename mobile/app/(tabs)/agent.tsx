import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../../theme';
import { AgentChatView } from '../../components/AgentChatView';

/**
 * The Agent's full-screen home — same conversation as the compact card on
 * the Map (shared store), for coming back later to tweak or add to what
 * you've already told it.
 *
 * Not inside a sheet here, so this screen owns its own keyboard avoidance
 * — AgentChatView itself stopped wrapping in one (2026-08-24) once
 * BottomSheet started handling it for the compact-card version, and two
 * nested KeyboardAvoidingViews double up rather than adding up.
 */
export default function AgentScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>Maloca Agent</Text>
      <KeyboardAvoidingView
        style={styles.chatWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <AgentChatView />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: spacing.lg },
  title: { ...type.title, color: colors.ink, marginBottom: spacing.sm },
  chatWrap: { flex: 1 },
});
