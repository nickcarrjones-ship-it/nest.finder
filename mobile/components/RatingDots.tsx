import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

interface RatingDotsProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

const SCALE = Array.from({ length: 11 }, (_, i) => i); // 0 (hate it) .. 10 (love it)

/**
 * Matches the web app's Shortlist rating dots exactly (.sl-rating-dot,
 * css/styles.css:744-746) — unselected: white + rule border + ghost text;
 * selected: copper fill. Extended to 0-10 (Nick's scale) rather than the
 * web app's 1-10, since he specifically wants 0 as a valid "hate it".
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
  row: { flexDirection: 'row', gap: 3 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: colors.copper,
    borderColor: colors.copper,
  },
  dotText: { fontSize: 9, fontWeight: '700', color: colors.inkGhost },
  dotTextActive: { color: colors.white },
});
