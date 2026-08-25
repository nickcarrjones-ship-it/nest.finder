import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';

interface Props {
  maxCommuteMins: number;
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
export function CommuteHintCard({ maxCommuteMins, onDismiss }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.body}>
        The orange area grows and shrinks as you change the time. Live anywhere inside
        it and you'll <Text style={styles.strong}>all be at work within {maxCommuteMins} minutes</Text>.
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
  strong: { fontFamily: fonts.bold, color: colors.white },
  btn: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  btnText: { ...type.bodyStrong, fontSize: 13, color: colors.white },
});
