import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from './ui/Card';
import { RatingDots } from './RatingDots';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { Member } from '../lib/types';
import { useRatingsStore } from '../store/ratingsStore';
import type { PickWithLocation } from './PicksCarousel';

interface Props {
  pick: PickWithLocation;
  members: Member[];
  onToggleVisited: () => void;
  onClose: () => void;
}

/**
 * The rating sheet for a tapped carousel pick — same floating-card
 * language as SelectedAreaCard (not a dimmed modal, map stays interactive
 * underneath), but for a neighbourhood pick rather than a single station.
 *
 * Known seam, not smoothed over: ratings are keyed by area NAME
 * (ratingsStore), and a neighbourhood's name can differ from any one of
 * its stations' names — "Clapham Town" groups Clapham North/High Street/
 * Common, but tapping one of THEIR circles on the map still rates under
 * the station's own name. Rating a pick and rating its station separately
 * currently produce two different entries. Reconciling that properly means
 * deciding whether ratings live on stations or neighbourhoods app-wide,
 * which is bigger than this card — flagged here rather than papered over
 * with a silent lookup that would hide the inconsistency.
 */
export function PickDetailCard({ pick, members, onToggleVisited, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const ratings = useRatingsStore((s) => s.ratings);
  const setRating = useRatingsStore((s) => s.setRating);

  return (
    <Card elevated style={[styles.card, { paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.name}>{pick.neighbourhood}</Text>
          {pick.confidence === 'low' && (
            <Text style={styles.lowConfidence}>Less certain pick — worth judging in person</Text>
          )}
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.reason}>{pick.reason}</Text>

        <Pressable
          style={[styles.visitedRow, pick.visited && styles.visitedRowOn]}
          onPress={onToggleVisited}
          accessibilityRole="switch"
          accessibilityState={{ checked: pick.visited }}
        >
          <Text style={[styles.visitedGlyph, pick.visited && styles.visitedGlyphOn]}>
            {pick.visited ? '✓' : '○'}
          </Text>
          <Text style={[styles.visitedText, pick.visited && styles.visitedTextOn]}>
            {pick.visited ? "You've visited" : 'Mark as visited'}
          </Text>
        </Pressable>

        <Text style={styles.sectionLabel}>How do you feel about this area?</Text>
        {members.map((m) => (
          <View key={m.id} style={styles.ratingRow}>
            <Text style={styles.ratingName}>{m.name}</Text>
            <RatingDots
              value={ratings[pick.neighbourhood]?.[m.id]}
              onChange={(value) => setRating(pick.neighbourhood, m.id, value)}
            />
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 108, // clears the picks carousel + insets docked at the tab bar
    maxHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  titleBlock: { flex: 1, gap: 2 },
  name: { ...type.title, fontSize: 18, color: colors.ink },
  lowConfidence: { fontFamily: fonts.italic, fontSize: 11.5, color: colors.inkGhost },
  close: { ...type.body, color: colors.inkGhost, fontSize: 18, paddingLeft: spacing.sm },
  reason: { ...type.body, color: colors.inkMid, marginBottom: spacing.md },
  visitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  visitedRowOn: { backgroundColor: colors.greenBg, borderColor: colors.greenLine },
  visitedGlyph: { fontSize: 16, color: colors.inkGhost },
  visitedGlyphOn: { color: colors.green, fontFamily: fonts.bold },
  visitedText: { ...type.body, fontSize: 13, color: colors.inkMid },
  visitedTextOn: { color: colors.ink, fontFamily: fonts.semibold },
  sectionLabel: { ...type.label, color: colors.inkGhost, marginBottom: spacing.sm },
  ratingRow: { marginBottom: spacing.sm },
  ratingName: { ...type.body, fontSize: 12, color: colors.inkMid, marginBottom: 4 },
});
