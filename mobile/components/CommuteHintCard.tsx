import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';

interface Props {
  onDismiss: () => void;
}

/**
 * Fires once, the first time someone moves the commute slider — the moment
 * they've just made the polygon change shape is the one moment that
 * explanation actually lands, rather than as up-front instructions nobody
 * reads (Nick's call, 2026-08-23).
 *
 * Session-scoped for now: it reappears on a fresh launch. Persisting
 * "already seen" belongs with the rest of the onboarding state once that
 * syncs to Firebase — worth doing, not worth a lone AsyncStorage key here.
 */
export function CommuteHintCard({ onDismiss }: Props) {
  return (
    <View style={styles.card}>
      {/* One sentence. The second half — "live anywhere inside it and you'll
          all be at work within N minutes" — is now the legend directly below
          this card, so saying it twice was just noise (Nick, 2026-08-29). */}
      <Text style={styles.body}>
        The teal area grows and shrinks as you change your max commute.
      </Text>
      <Pressable onPress={onDismiss} style={styles.btn} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.btnText}>Got it</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  body: { ...type.body, flex: 1, fontSize: 13, lineHeight: 18, color: colors.cream },
  btn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  btnText: { ...type.bodyStrong, fontSize: 13, color: colors.white },
});
