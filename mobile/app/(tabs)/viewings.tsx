import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../../theme';
import { AddViewingSheet } from '../../components/AddViewingSheet';
import { useViewingsStore } from '../../store/viewingsStore';
import { useViewings } from '../../hooks/useViewings';
import {
  describeProperty,
  formatViewingWhen,
  groupViewings,
  type Viewing,
} from '../../lib/viewings';

/**
 * Everywhere the household is going, or has been.
 *
 * Three sections, in the order the question gets asked: what is booked,
 * what they want to see, what they have already seen. Those are derived
 * from each viewing's date rather than stored (see lib/viewings.ts), so a
 * booked viewing moves itself into "seen" as its time passes with nothing
 * having to run.
 *
 * Deliberately simple — Nick's brief was "the viewings tab needs to be very
 * simple". No calendar grid, no filters, no tabs within tabs. The calendar
 * arrives as a subscribable feed both phones can follow, which is a
 * separate thing from this list.
 */
export default function ViewingsScreen() {
  const viewings = useViewingsStore((s) => s.viewings);
  const hydrated = useViewingsStore((s) => s.hydrated);
  const { remove } = useViewings();
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => groupViewings(Object.values(viewings)), [viewings]);
  const total = Object.keys(viewings).length;

  function confirmRemove(viewing: Viewing) {
    Alert.alert('Remove this viewing?', viewing.address, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove(viewing.id) },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>VIEWINGS</Text>
        <Pressable style={styles.addBtn} onPress={() => setAdding(true)} accessibilityRole="button">
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {total === 0 ? (
          // Only shown once we know there is genuinely nothing, rather than
          // flashing "no viewings yet" at someone who has a dozen while the
          // fetch is still in the air.
          hydrated ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No viewings yet</Text>
              <Text style={styles.emptyBody}>
                Found something on Rightmove? Copy the link and paste it here — we'll read
                the address and the price, and drop a pin on your map.
              </Text>
              <Pressable style={styles.emptyBtn} onPress={() => setAdding(true)} accessibilityRole="button">
                <Text style={styles.emptyBtnText}>Add your first viewing</Text>
              </Pressable>
            </View>
          ) : null
        ) : (
          <>
            <Section title="Booked in" viewings={grouped.booked} onRemove={confirmRemove} />
            <Section title="Want to see" viewings={grouped.idea} onRemove={confirmRemove} />
            <Section title="Seen" viewings={grouped.seen} onRemove={confirmRemove} />
          </>
        )}
      </ScrollView>

      <AddViewingSheet visible={adding} onClose={() => setAdding(false)} />
    </SafeAreaView>
  );
}

function Section({
  title,
  viewings,
  onRemove,
}: {
  title: string;
  viewings: Viewing[];
  onRemove: (viewing: Viewing) => void;
}) {
  if (viewings.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title} <Text style={styles.sectionCount}>{viewings.length}</Text>
      </Text>
      {viewings.map((viewing) => (
        <ViewingRow key={viewing.id} viewing={viewing} onRemove={onRemove} />
      ))}
    </View>
  );
}

function ViewingRow({
  viewing,
  onRemove,
}: {
  viewing: Viewing;
  onRemove: (viewing: Viewing) => void;
}) {
  const description = describeProperty(viewing);
  return (
    <Pressable
      style={styles.card}
      onLongPress={() => onRemove(viewing)}
      accessibilityRole="button"
      accessibilityHint="Press and hold to remove this viewing"
    >
      <View style={styles.cardTop}>
        <Text style={styles.address} numberOfLines={2}>{viewing.address}</Text>
        {viewing.priceText && <Text style={styles.price}>{viewing.priceText}</Text>}
      </View>

      <View style={styles.metaRow}>
        {viewing.viewingAt !== null && (
          <Text style={styles.when}>{formatViewingWhen(viewing.viewingAt)}</Text>
        )}
        {description && <Text style={styles.meta}>{description}</Text>}
        {/* Said plainly rather than hidden: a viewing with no pin is not
            broken, it just came in by hand. */}
        {viewing.lat === null && <Text style={styles.meta}>not on the map</Text>}
      </View>

      {viewing.notes && <Text style={styles.notes}>{viewing.notes}</Text>}

      {viewing.listingUrl && (
        <Pressable
          onPress={() => Linking.openURL(viewing.listingUrl as string).catch(() => {})}
          hitSlop={6}
          accessibilityRole="link"
        >
          <Text style={styles.listingLink}>Open the listing</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  wordmark: { ...type.label, color: colors.ink, fontSize: 14, letterSpacing: 4 },
  addBtn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  addBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },

  body: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyTitle: { ...type.title, color: colors.ink },
  emptyBody: {
    ...type.body,
    color: colors.inkLt,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  emptyBtnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },

  section: { gap: spacing.sm },
  sectionTitle: { ...type.label, color: colors.inkLt, fontSize: 11 },
  sectionCount: { color: colors.inkGhost },

  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  address: { ...type.bodyStrong, fontSize: 15, color: colors.ink, flexShrink: 1 },
  price: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  when: { fontFamily: fonts.semibold, fontSize: 13, color: colors.terracotta },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkLt },
  notes: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.inkMid, lineHeight: 19 },
  listingLink: { fontFamily: fonts.semibold, fontSize: 13, color: colors.teal, marginTop: 2 },
});
