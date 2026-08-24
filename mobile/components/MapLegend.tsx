import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../theme';
import type { Member } from '../lib/types';

interface Props {
  members: Member[];
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
export function MapLegendRows({ members, maxCommuteMins }: Props) {
  const names = formatNames(members.map((m) => m.name));

  return (
    <>
      <View style={styles.legendRow}>
        {/* No initial inside it — the real pins each carry a different
            letter, so putting one person's here made the swatch look like
            it meant that specific person rather than "a workplace". */}
        <View style={styles.pinSwatch} />
        <Text style={styles.legendText}>
          <Text style={styles.legendStrong}>{names}</Text> work here
        </Text>
      </View>

      <View style={styles.legendRowLast}>
        <View style={styles.regionSwatch} />
        <Text style={styles.legendText}>
          Live anywhere in <Text style={styles.legendStrong}>orange</Text> and you'll all be at
          work within {maxCommuteMins} minutes
        </Text>
      </View>
    </>
  );
}

export function MapLegendCard({ members, maxCommuteMins }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.card, { paddingBottom: insets.bottom + spacing.md }]}>
      <MapLegendRows members={members} maxCommuteMins={maxCommuteMins} />
    </View>
  );
}

/** "You" / "You and Harriet" / "You, Harriet and Sam" */
function formatNames(names: string[]): string {
  if (names.length === 0) return 'You';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: -6 },
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
    backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.copper,
  },
  // Same fill/line tokens the map's region layer uses (REGION_FILL).
  regionSwatch: {
    width: 24, height: 24, borderRadius: 7,
    backgroundColor: colors.copperSoft, borderWidth: 1.5, borderColor: colors.copperLine,
  },
  legendText: { ...type.body, flex: 1, fontSize: 13.5, lineHeight: 18, color: colors.inkMid },
  legendStrong: { fontWeight: '700', color: colors.ink },
});
