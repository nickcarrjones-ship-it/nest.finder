import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { RatingDots } from './RatingDots';
import type { ShortlistEntry } from '../store/shortlistStore';

interface Props {
  rank: number;
  entry: ShortlistEntry;
  rating: number | undefined;
  onRate: (value: number) => void;
  onToggleVisited: () => void;
  onPress: () => void;
}

/**
 * One shortlist row: the AI's case for this area, whether you've actually
 * been, and a place to record your own verdict once you have. Deliberately
 * NOT the same visual weight as SelectedAreaCard — this is a scannable list
 * item, that's a detail sheet.
 */
export function ShortlistCard({ rank, entry, rating, onRate, onToggleVisited, onPress }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.top}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
        <View style={styles.headline}>
          <Text style={styles.name} numberOfLines={1}>{entry.neighbourhood}</Text>
          {entry.confidence === 'low' && (
            <Text style={styles.lowConfidence}>less certain pick</Text>
          )}
        </View>
        <Pressable
          onPress={onToggleVisited}
          hitSlop={8}
          style={[styles.visitedBtn, entry.visited && styles.visitedBtnOn]}
          accessibilityRole="switch"
          accessibilityState={{ checked: entry.visited }}
          accessibilityLabel={entry.visited ? 'Marked as visited' : 'Mark as visited'}
        >
          <Text style={[styles.visitedGlyph, entry.visited && styles.visitedGlyphOn]}>
            {entry.visited ? '✓' : '○'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.reason} numberOfLines={2}>{entry.reason}</Text>

      {entry.visited ? (
        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>Your rating</Text>
          <RatingDots value={rating} onChange={onRate} />
        </View>
      ) : (
        <Text style={styles.prompt}>Visit to rate this one</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: spacing.md,
    gap: spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rankBadge: {
    width: 26, height: 26, borderRadius: radius.pill,
    backgroundColor: colors.tealSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 13, fontFamily: fonts.bold, color: colors.teal },
  headline: { flex: 1, gap: 1 },
  name: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  lowConfidence: { fontFamily: fonts.italic, fontSize: 11, color: colors.inkGhost },
  visitedBtn: {
    width: 30, height: 30, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.rule,
    alignItems: 'center', justifyContent: 'center',
  },
  visitedBtnOn: { backgroundColor: colors.green, borderColor: colors.green },
  visitedGlyph: { fontSize: 14, color: colors.inkGhost },
  visitedGlyphOn: { color: colors.white, fontFamily: fonts.bold },
  reason: { ...type.body, color: colors.inkMid },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  rateLabel: { fontSize: 12, fontFamily: fonts.semibold, color: colors.inkLt },
  prompt: { fontFamily: fonts.italic, fontSize: 12, color: colors.inkGhost },
});
