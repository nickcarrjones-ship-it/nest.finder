import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './ui';
import { SignInButtons } from './SignInButtons';
import { colors, spacing, type } from '../theme';
import { useAuthStore } from '../store/authStore';

/**
 * "Sign in to carry on" — the shared prompt for the moments that need an
 * account before they can continue.
 *
 * It exists for Apple's guideline 4.8. Three flows used to call Google
 * sign-in directly the moment they found nobody signed in, which meant
 * that however many Apple buttons the settings screen grew, somebody
 * joining a household still had exactly one way in. A sheet is the small
 * change that turns those into a choice.
 *
 * It closes itself the moment a session appears, so whatever the caller
 * was doing can resume without anyone dismissing anything.
 */
interface Props {
  visible: boolean;
  onClose: () => void;
  /** Why the account is needed, in the caller's own words. */
  reason?: string;
}

export function SignInSheet({ visible, onClose, reason }: Props) {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (visible && user) onClose();
  }, [visible, user, onClose]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sign in">
      <View style={styles.body}>
        <Text style={styles.reason}>
          {reason ?? 'Signing in keeps your search on every device, and lets you share it with whoever you’re house-hunting with.'}
        </Text>
        <SignInButtons />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.lg },
  reason: { ...type.body, color: colors.inkMid, lineHeight: 20 },
});
