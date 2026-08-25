import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../../theme';

interface BottomSheetProps extends ViewProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
}

/**
 * Native equivalent of the web app's slide-up drawers (e.g.
 * #mobile-settings-drawer, css/styles.css:1049-1063: translateY(100%) -> 0,
 * rounded top corners, dimmed backdrop). Uses RN's built-in Modal with
 * animationType="slide" rather than a hand-rolled Animated value — it's the
 * same visual result with far less to get wrong, and it comes with the
 * back-button/backdrop dismissal behaviour for free.
 *
 * Drag-to-dismiss is a nice-to-have, not needed for the app to work — leave
 * it for a later polish pass rather than blocking here.
 *
 * Keyboard-aware (2026-08-24): a bare RN Modal doesn't inherit the app's
 * usual keyboard handling — it's effectively a separate native window, so
 * text inputs inside one get covered by the keyboard on Android with
 * nothing here to push them clear (confirmed on device). Wrapping in
 * KeyboardAvoidingView, with the backdrop's existing flex:1 acting as the
 * spacer that absorbs the shrink, fixes both platforms at the one shared
 * component every sheet in the app already goes through — rather than
 * patching whichever sheet happens to have a text input in it this week.
 * (AgentChatView handles its OWN keyboard avoidance when used outside a
 * sheet, on the full-screen Agent tab — see the note there for why it
 * doesn't also wrap itself when reached through here.)
 */
export function BottomSheet({ visible, onClose, title, children, style, ...viewProps }: BottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.kbFill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }, style]} {...viewProps}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kbFill: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(34,40,46,0.4)',
  },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.lg * 2,
    borderTopRightRadius: radius.lg * 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.creamDk,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...type.title,
    color: colors.ink,
    marginBottom: spacing.md,
  },
});
