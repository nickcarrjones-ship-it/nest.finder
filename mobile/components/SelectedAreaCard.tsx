import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from './ui/Card';
import { RatingDots } from './RatingDots';
import { colors, radius, spacing, type } from '../theme';
import type { Member } from '../lib/types';
import { getCouncilTax } from '../lib/councilTax';
import { useRatingsStore } from '../store/ratingsStore';

export interface SelectedArea {
  name: string;
  memberTimes: number[];
}

interface SelectedAreaCardProps {
  area: SelectedArea;
  members: Member[];
  onClose: () => void;
}

/**
 * Mobile's "place card" — inspired by Google Maps' tap-a-pin bottom panel:
 * floats over the map (not a dimmed modal, unlike the settings sheet) so
 * the map stays visible and interactive underneath. Extends the original
 * simple version with council tax ranking and per-person 0-10 ratings.
 *
 * Transport-mode badges (tube/Overground/National Rail/DLR) are a known
 * gap — TfL returns this per station but tonight's other lookups didn't
 * save it; queued for once the journey-times regeneration frees up TfL's
 * rate limit rather than competing with it now.
 */
export function SelectedAreaCard({ area, members, onClose }: SelectedAreaCardProps) {
  const insets = useSafeAreaInsets();
  const ratings = useRatingsStore((s) => s.ratings);
  const setRating = useRatingsStore((s) => s.setRating);
  const councilTax = getCouncilTax(area.name);

  return (
    <Card elevated style={[styles.card, { paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.name}>{area.name}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Commute times */}
        <View style={styles.commuteRow}>
          {members.map((m, i) => (
            <Text key={m.id} style={styles.commuteLine}>
              {m.name}: <Text style={styles.commuteMins}>{area.memberTimes[i]} min</Text>
            </Text>
          ))}
        </View>

        {/* Council tax */}
        {councilTax && (
          <View style={[styles.taxBadge, tierStyle(councilTax.rank)]}>
            <Text style={styles.taxBorough}>{councilTax.borough}</Text>
            <Text style={styles.taxRank}>#{councilTax.rank} cheapest of 33 London boroughs</Text>
          </View>
        )}

        {/* Ratings */}
        <Text style={styles.sectionLabel}>How do you feel about this area?</Text>
        {members.map((m) => (
          <View key={m.id} style={styles.ratingRow}>
            <Text style={styles.ratingName}>{m.name}</Text>
            <RatingDots
              value={ratings[area.name]?.[m.id]}
              onChange={(value) => setRating(area.name, m.id, value)}
            />
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

function tierStyle(rank: number) {
  if (rank <= 5) return { backgroundColor: colors.greenBg, borderColor: colors.greenLine };
  if (rank <= 20) return { backgroundColor: colors.amberBg, borderColor: colors.amber };
  return { backgroundColor: colors.redBg, borderColor: colors.redLine };
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    maxHeight: '55%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  name: { ...type.title, fontSize: 18, color: colors.ink, flex: 1 },
  close: { ...type.body, color: colors.inkGhost, fontSize: 18, paddingLeft: spacing.sm },
  commuteRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  commuteLine: { ...type.body, color: colors.inkMid },
  commuteMins: { fontWeight: '600', color: colors.ink },
  taxBadge: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  taxBorough: { ...type.bodyStrong, color: colors.ink },
  taxRank: { ...type.body, fontSize: 12, color: colors.inkMid, marginTop: 2 },
  sectionLabel: { ...type.label, color: colors.inkGhost, marginBottom: spacing.sm },
  ratingRow: { marginBottom: spacing.sm },
  ratingName: { ...type.body, fontSize: 12, color: colors.inkMid, marginBottom: 4 },
});
