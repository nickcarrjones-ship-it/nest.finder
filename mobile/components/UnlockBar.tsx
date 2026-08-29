import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';

interface Props {
  areaCount: number;
  maxCommuteMins: number;
  onPress: () => void;
}

/**
 * The way in, and deliberately the smallest one that works.
 *
 * It replaces a full pitch panel that used to appear on a twelve-second
 * timer after someone touched the slider (Nick, 2026-08-29: "the final CTA
 * displays after X number of timeline play arounds, or after a certain
 * amount of time"). A stopwatch interrupts the person still exploring and
 * arrives far too late for the person who understood it immediately.
 *
 * So this is triggered by the moment instead — see the interaction count in
 * app/(tabs)/index.tsx. By the time someone has moved the slider a few
 * times they have their answer to "where COULD we live", and it is several
 * hundred areas long. That is exactly the point at which the free map stops
 * being enough, and it is the question the Agent exists to answer.
 *
 * Both numbers are read out of their own map rather than written as copy —
 * "212 areas" and "45 minutes" are their result, "lots of areas" is
 * marketing. Reworded 2026-08-29 (Nick: "we need a slightly stronger CTA")
 * from "N areas fit your commute" to the concrete commitment used
 * everywhere else in the app for this same number (MapLegendRows) — a
 * benefit stated in their own terms is a stronger pull than a description.
 */
export function UnlockBar({ areaCount, maxCommuteMins, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${areaCount} areas will get you to work within ${maxCommuteMins} minutes. Which ones actually suit you?`}
    >
      <View style={styles.copy}>
        <Text style={styles.count}>
          <Text style={styles.number}>{areaCount}</Text> areas will get you to work within{' '}
          <Text style={styles.number}>{maxCommuteMins}</Text> minutes
        </Text>
        <Text style={styles.ask}>Which ones actually suit you?</Text>
      </View>
      <View style={styles.chev}>
        <Text style={styles.chevText}>→</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  pressed: { opacity: 0.9 },
  copy: { flex: 1, gap: 1 },
  count: { ...type.body, fontSize: 12.5, color: colors.inkLt },
  number: { fontFamily: fonts.bold, color: colors.teal },
  ask: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  chev: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white, marginTop: -1 },
});
