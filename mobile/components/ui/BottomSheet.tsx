import { Modal, Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
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
 */
export function BottomSheet({ visible, onClose, title, children, style, ...viewProps }: BottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }, style]} {...viewProps}>
        <View style={styles.handle} />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,23,20,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
