import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

/**
 * Points at the commute slider once the workplace callouts have faded —
 * the first-run sequence's second beat. Deliberately tiny and arrow-led
 * rather than a card with a dismiss button: it's a pointer, not a message
 * to be read and acknowledged, and it disappears the moment the slider is
 * actually moved.
 */
export function SliderNudge() {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pointer} />
      <View style={styles.pill}>
        <Text style={styles.text}>Drag to change your commute time</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  // Upward pointer, aimed back at the slider sitting above it.
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.terracotta,
  },
  pill: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  text: { ...type.bodyStrong, fontSize: 12.5, color: colors.white },
});
