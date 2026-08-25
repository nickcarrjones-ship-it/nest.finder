import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../theme';

interface RatingDotsProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

const SCALE = Array.from({ length: 11 }, (_, i) => i); // 0 (hate it) .. 10 (love it)

/**
 * Matches the web app's Shortlist rating dots exactly (.sl-rating-dot,
 * css/styles.css:744-746) — unselected: white + rule border + ghost text;
 * selected: teal fill + a bolder ink border so the active dot reads
 * clearly, not just via colour. Extended to 0-10 (Nick's scale) rather
 * than the web app's 1-10, since he specifically wants 0 as "hate it".
 *
 * Dot size is a deliberate size-vs-fit tradeoff, corrected once against
 * real on-device testing: an earlier 30px pass wrapped to two lines on
 * Nick's actual phone and looked bad, so this sizes with real safety
 * margin (24px, comfortably one row on ~360dp+ screens) rather than
 * another borderline estimate. hitSlop and the bolder active-state
 * border below do more of the real tap-comfort work than raw dot size.
 * flexWrap stays on as a defensive fallback, not the primary plan.
 */
export function RatingDots({ value, onChange }: RatingDotsProps) {
  return (
    <View style={styles.row}>
      {SCALE.map((n) => {
        const active = value === n;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={[styles.dot, active && styles.dotActive]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${n} out of 10`}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.dotText, active && styles.dotTextActive]}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: colors.teal,
    borderColor: colors.ink,
    borderWidth: 2,
  },
  dotText: { fontSize: 9, fontFamily: fonts.bold, color: colors.inkGhost },
  dotTextActive: { color: colors.white },
});
