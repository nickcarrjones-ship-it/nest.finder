import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, type } from '../theme';
import type { Member } from '../lib/types';

interface Props {
  members: Member[];
  maxCommuteMins: number;
}

/** The rows only need the number now — who works where is a map bubble. */
interface RowProps {
  maxCommuteMins: number;
}

/**
 * What the two things on the map actually mean. Shown from the moment the
 * map first loads (Nick, 2026-08-23) rather than waiting for the sign-in
 * pitch — someone looking at unexplained shapes needs this immediately, not
 * three beats later.
 *
 * Exported in two forms so the same rows can't drift apart: the rows alone
 * (folded into MapExplainerPanel's pitch when that takes over the bottom of
 * the screen) and a standalone bottom card for the beats before it.
 */
export function MapLegendRows({ maxCommuteMins }: RowProps) {
  return (
    <>
      <View style={styles.legendRowLast}>
        <View style={styles.regionSwatch} />
        <Text style={styles.legendText}>
          <Text style={styles.legendTeal}>teal</Text> zone gets you all to work within{' '}
          {maxCommuteMins} minutes
        </Text>
      </View>
    </>
  );
}

export function MapLegendCard({ maxCommuteMins }: Props) {
  return (
    <View style={styles.card}>
      <MapLegendRows maxCommuteMins={maxCommuteMins} />
    </View>
  );
}

/** "You" / "You and Harriet" / "You, Harriet and Sam" */
export function formatNames(names: string[]): string {
  if (names.length === 0) return 'You';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const styles = StyleSheet.create({
  /**
   * No longer absolutely positioned: the legend and the commute slider now
   * share one bottom stack in the map screen, so their order is decided by
   * layout rather than by two sets of offsets that drift apart.
   */
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: colors.ink,
    // Shadow now falls downward: the card floats above the slider rather
    // than sitting against the bottom edge of the screen.
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  legendRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md, marginBottom: spacing.sm,
  },
  legendRowLast: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // Mirrors WorkplacePin exactly, at legend scale — a swatch that doesn't
  // match the thing it explains is worse than no swatch.
  pinSwatch: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.teal,
  },
  // Same fill/line tokens the map's region layer uses (REGION_FILL).
  regionSwatch: {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: colors.tealSoft, borderWidth: 1.5, borderColor: colors.tealLine,
  },
  legendText: { ...type.body, flex: 1, fontSize: 13.5, lineHeight: 18, color: colors.inkMid },
  /** Bold AND teal — the word names the colour, so it should be it. */
  legendTeal: { fontFamily: fonts.semibold, color: colors.teal },
  legendStrong: { fontFamily: fonts.bold, color: colors.ink },
});
