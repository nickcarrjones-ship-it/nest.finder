import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, fonts, radius, spacing, type } from '../../theme';
import { AddViewingSheet } from '../../components/AddViewingSheet';
import { CalendarSyncSheet } from '../../components/CalendarSyncSheet';
import { ViewingCalendarStrip } from '../../components/ViewingCalendarStrip';
import { ViewingScorecard } from '../../components/ViewingScorecard';
import { useViewingsStore } from '../../store/viewingsStore';
import { useMustHavesStore } from '../../store/mustHavesStore';
import { useViewings } from '../../hooks/useViewings';
import {
  assess,
  describeCoverage,
  formatScore,
  rankByScore,
  type Assessment,
  type MustHave,
} from '../../lib/mustHaves';
import { buildCalendar, dayKey, formatDayHeading } from '../../lib/viewingCalendar';
import {
  describeProperty,
  formatViewingWhen,
  groupViewings,
  type Viewing,
} from '../../lib/viewings';

/**
 * Everywhere the household is going, or has been.
 *
 * The screen is built around one claim: the question people actually open
 * this tab to answer is "which of the ones we've seen was best?" — so the
 * SEEN list is ranked, scored, and open by default, while what is coming
 * up collapses to a line each. The fortnight strip at the top carries the
 * other question ("what's this week?") without needing a section of its
 * own.
 *
 * Only seen properties carry a score. A property nobody has stood in has
 * nothing to score — its must-haves are all unanswered — and showing it a
 * "0/10" would be inventing a judgement out of an absence, the same
 * mistake as a pin at a guessed coordinate.
 */
export default function ViewingsScreen() {
  const router = useRouter();
  const viewings = useViewingsStore((s) => s.viewings);
  const hydrated = useViewingsStore((s) => s.hydrated);
  const mustHaves = useMustHavesStore((s) => s.items);
  const { remove } = useViewings();

  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scoring, setScoring] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // What is booked starts folded away: it is a handful of lines and the
  // strip above already answers "when". What has been SEEN is the list
  // with the ranking in it, so that one starts open. "Want to see" starts
  // open too, and sits first (Nick, 2026-09-25): folded away at the bottom,
  // a property saved without a date looked as though it had vanished, and
  // the tab read as bookings-only.
  const [open, setOpen] = useState({ booked: false, idea: true, seen: true });

  const all = useMemo(() => Object.values(viewings), [viewings]);
  const grouped = useMemo(() => groupViewings(all), [all]);
  const days = useMemo(() => buildCalendar(all), [all]);
  const ranked = useMemo(() => rankByScore(grouped.seen, mustHaves), [grouped.seen, mustHaves]);
  const total = all.length;

  const dayViewings = useMemo(
    () => (selectedDay ? grouped.booked.filter((v) => v.viewingAt !== null && dayKey(v.viewingAt) === selectedDay) : []),
    [selectedDay, grouped.booked],
  );

  const selectedDayAt = useMemo(
    () => days.find((d) => d.key === selectedDay)?.at ?? null,
    [days, selectedDay],
  );

  function confirmRemove(viewing: Viewing) {
    Alert.alert('Remove this property?', viewing.address, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          remove(viewing.id);
          // It can be removed from inside its own scorecard now.
          setScoring((open) => (open === viewing.id ? null : open));
        },
      },
    ]);
  }

  const openViewing = scoring ? viewings[scoring] ?? null : null;
  const noMustHaves = mustHaves.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>VIEWINGS</Text>
        <View style={styles.headerBtns}>
          <Pressable
            style={styles.ghostBtn}
            onPress={() => router.push('/must-haves')}
            accessibilityRole="button"
            accessibilityLabel="Edit your must-haves"
          >
            <Text style={styles.ghostBtnText}>Must-haves</Text>
          </Pressable>
          {/* Only offered once there is something to put in a calendar.
              An empty subscription is a setup step with no payoff. */}
          {total > 0 && (
            <Pressable
              style={styles.ghostBtn}
              onPress={() => setSyncing(true)}
              accessibilityRole="button"
              accessibilityLabel="Add your viewings to your calendar"
            >
              <Text style={styles.ghostBtnText}>Calendar</Text>
            </Pressable>
          )}
          <Pressable style={styles.addBtn} onPress={() => setAdding(true)} accessibilityRole="button">
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      </View>

      {/* Always shown, even on an empty tab (Nick, 2026-09-25): the strip
          is what says "this is where your viewings will live", so hiding it
          until the first one exists hid the point of the tab. Empty days
          are not tappable, so there is nothing to select yet. */}
      <View style={styles.stripWrap}>
        <ViewingCalendarStrip days={days} selectedKey={selectedDay} onSelect={setSelectedDay} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {total === 0 ? (
          // Only shown once we know there is genuinely nothing, rather than
          // flashing "no viewings yet" at someone who has a dozen while the
          // fetch is still in the air.
          hydrated ? (
            <View style={styles.empty}>
              {/* Must-haves come FIRST on an empty tab (Nick, 2026-09-21).
                  They are what every score on this screen is computed
                  from, so somebody who adds a viewing without them gets a
                  list with nothing to rank it by — the one feature that
                  makes this tab worth opening, discovered last. Before
                  they exist this is the primary button and "add your
                  first viewing" is the quiet one; afterwards they swap
                  back, because at that point adding a property IS the
                  next thing to do. */}
              {noMustHaves ? (
                <View style={styles.mustCard}>
                  <Text style={styles.mustLabel}>FIRST</Text>
                  <Text style={styles.mustTitle}>Set your must-haves</Text>
                  <Text style={styles.mustBody}>
                    They let you objectively rank each property you view - tick them off
                    while you're standing in the place, and every viewing comes back with
                    a score out of 10.
                  </Text>
                  <Pressable
                    style={styles.mustBtn}
                    onPress={() => router.push('/must-haves')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.mustBtnText}>Set your must-haves</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.mustDone}
                  onPress={() => router.push('/must-haves')}
                  accessibilityRole="button"
                  accessibilityLabel={`${mustHaves.length} must-haves set. Edit them.`}
                >
                  <Text style={styles.mustDoneText}>
                    {mustHaves.length} must-have{mustHaves.length === 1 ? '' : 's'} ready to score
                    against · edit
                  </Text>
                </Pressable>
              )}

              <Text style={styles.emptyTitle}>Nothing saved yet</Text>
              <Text style={styles.emptyBody}>
                Found something on Rightmove? Copy the link and paste it here - we'll read
                the address and the price, and drop a pin on your map. Save it as one you
                want to see, or add the date once a viewing is booked.
              </Text>
              <Pressable
                style={[styles.emptyBtn, noMustHaves && styles.emptyBtnQuiet]}
                onPress={() => setAdding(true)}
                accessibilityRole="button"
              >
                <Text style={[styles.emptyBtnText, noMustHaves && styles.emptyBtnTextQuiet]}>
                  Add your first property
                </Text>
              </Pressable>
            </View>
          ) : null
        ) : selectedDay ? (
          // A day picked off the strip takes over the list entirely —
          // showing it alongside everything else would just be the same
          // viewings twice.
          <View style={styles.section}>
            <View style={styles.dayHead}>
              {/* Named from the DAY, not from the first viewing in it —
                  the last viewing on a day can be removed, or tick over
                  into "seen", while this is open, and the heading must
                  not silently become "Today". */}
              <Text style={styles.sectionTitle}>
                {selectedDayAt === null ? '' : formatDayHeading(selectedDayAt)}
              </Text>
              <Pressable onPress={() => setSelectedDay(null)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.clearDay}>Show everything</Text>
              </Pressable>
            </View>
            {dayViewings.length === 0 ? (
              <Text style={styles.dayEmpty}>Nothing booked that day any more.</Text>
            ) : (
              dayViewings.map((viewing) => (
                <ViewingRow
                  key={viewing.id}
                  viewing={viewing}
                  mustHaves={mustHaves}
                  onOpen={() => setScoring(viewing.id)}
                  onRemove={confirmRemove}
                />
              ))
            )}
          </View>
        ) : (
          <>
            <Section
              title="Want to see"
              viewings={grouped.idea}
              mustHaves={mustHaves}
              expanded={open.idea}
              onToggle={() => setOpen((o) => ({ ...o, idea: !o.idea }))}
              onOpen={setScoring}
              onRemove={confirmRemove}
            />
            <Section
              title="Seen"
              hint={mustHaves.length > 0 ? 'Best first' : undefined}
              viewings={ranked}
              mustHaves={mustHaves}
              expanded={open.seen}
              onToggle={() => setOpen((o) => ({ ...o, seen: !o.seen }))}
              onOpen={setScoring}
              onRemove={confirmRemove}
              showScore
            />
            <Section
              title="Booked in"
              viewings={grouped.booked}
              mustHaves={mustHaves}
              expanded={open.booked}
              onToggle={() => setOpen((o) => ({ ...o, booked: !o.booked }))}
              onOpen={setScoring}
              onRemove={confirmRemove}
            />

            {/* Shown only once there is something to score against it —
                pushing a list-building chore at someone who has not been
                to a viewing yet is asking for work with no payoff in
                sight. */}
            {mustHaves.length === 0 && grouped.seen.length > 0 && (
              <Pressable
                style={styles.prompt}
                onPress={() => router.push('/must-haves')}
                accessibilityRole="button"
              >
                <Text style={styles.promptTitle}>Score these out of 10</Text>
                <Text style={styles.promptBody}>
                  Write down what matters to you, put the most important first, and tick it
                  off at each viewing. We'll rank them for you.
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      <AddViewingSheet visible={adding} onClose={() => setAdding(false)} />
      <CalendarSyncSheet visible={syncing} onClose={() => setSyncing(false)} />
      <ViewingScorecard viewing={openViewing} onClose={() => setScoring(null)} onRemove={confirmRemove} />
    </SafeAreaView>
  );
}

function Section({
  title,
  hint,
  viewings,
  mustHaves,
  expanded,
  onToggle,
  onOpen,
  onRemove,
  showScore,
}: {
  title: string;
  hint?: string;
  viewings: Viewing[];
  mustHaves: MustHave[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
  onRemove: (viewing: Viewing) => void;
  showScore?: boolean;
}) {
  if (viewings.length === 0) return null;
  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHead}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}, ${viewings.length}`}
      >
        <Text style={styles.sectionTitle}>
          {title} <Text style={styles.sectionCount}>{viewings.length}</Text>
        </Text>
        <View style={styles.sectionRight}>
          {hint && expanded && <Text style={styles.sectionHint}>{hint}</Text>}
          <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
        </View>
      </Pressable>

      {expanded &&
        viewings.map((viewing, i) => (
          <ViewingRow
            key={viewing.id}
            viewing={viewing}
            mustHaves={mustHaves}
            position={showScore ? i + 1 : undefined}
            onOpen={() => onOpen(viewing.id)}
            onRemove={onRemove}
          />
        ))}
    </View>
  );
}

function ViewingRow({
  viewing,
  mustHaves,
  position,
  onOpen,
  onRemove,
}: {
  viewing: Viewing;
  mustHaves: MustHave[];
  position?: number;
  onOpen: () => void;
  onRemove: (viewing: Viewing) => void;
}) {
  const description = describeProperty(viewing);
  const assessment = assess(mustHaves, viewing.checks);
  const score = formatScore(assessment.score);

  return (
    <Pressable
      style={styles.card}
      onPress={onOpen}
      onLongPress={() => onRemove(viewing)}
      accessibilityRole="button"
      accessibilityHint="Opens the scorecard. Press and hold to remove this viewing."
    >
      <View style={styles.cardTop}>
        {position !== undefined && score !== null && (
          <Text style={styles.position}>{position}</Text>
        )}
        <Text style={styles.address} numberOfLines={2}>{viewing.address}</Text>
        {score !== null ? (
          <ScoreBadge score={score} assessment={assessment} />
        ) : viewing.priceText ? (
          <Text style={styles.price}>{viewing.priceText}</Text>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        {viewing.viewingAt !== null && (
          <Text style={styles.when}>{formatViewingWhen(viewing.viewingAt)}</Text>
        )}
        {score !== null && viewing.priceText && (
          <Text style={styles.meta}>{viewing.priceText}</Text>
        )}
        {description && <Text style={styles.meta}>{description}</Text>}
        {/* Said plainly rather than hidden: a viewing with no pin is not
            broken, it just came in by hand. */}
        {viewing.lat === null && <Text style={styles.meta}>not on the map</Text>}
        {mustHaves.length > 0 && (
          <Text style={styles.meta}>{describeCoverage(assessment)}</Text>
        )}
      </View>

      {viewing.notes && (
        <Text style={styles.notes} numberOfLines={2}>{viewing.notes}</Text>
      )}

      {/* Scorecard on the left, where the eye lands, and the listing off
          to the right (Nick, 2026-09-25). The whole card still opens the
          scorecard too; the button just says that it does. */}
      <View style={styles.linkRow}>
        <Pressable onPress={onOpen} hitSlop={6} accessibilityRole="button">
          <Text style={styles.listingLink}>Scorecard</Text>
        </Pressable>
        {viewing.listingUrl && (
          <Pressable
            onPress={() => Linking.openURL(viewing.listingUrl as string).catch(() => {})}
            hitSlop={6}
            accessibilityRole="link"
          >
            <Text style={styles.listingLink}>Open the listing</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

/** The score, with its own uncertainty attached. A provisional score is
 *  drawn hollow rather than filled — it still ranks, but it does not get
 *  to look as settled as one built on the whole list. */
function ScoreBadge({ score, assessment }: { score: string; assessment: Assessment }) {
  return (
    <View style={[styles.scoreBadge, assessment.provisional && styles.scoreBadgeThin]}>
      <Text style={[styles.scoreValue, assessment.provisional && styles.scoreValueThin]}>
        {score}
      </Text>
      <Text style={styles.scoreOutOf}>/10</Text>
    </View>
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
  },
  wordmark: { ...type.label, color: colors.ink, fontSize: 14, letterSpacing: 4 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ghostBtn: {
    borderWidth: 1,
    borderColor: colors.tealLine,
    backgroundColor: colors.tealSoft,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  ghostBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.teal },
  addBtn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  addBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },

  stripWrap: { borderBottomWidth: 1, borderBottomColor: colors.rule },

  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },

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
  /** The same button, demoted to second place while must-haves are unset. */
  emptyBtnQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.tealLine },
  emptyBtnTextQuiet: { color: colors.teal },

  mustCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: colors.tealLine,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  mustLabel: { ...type.label, fontSize: 10.5, color: colors.teal },
  mustTitle: { ...type.title, color: colors.ink, textAlign: 'center' },
  mustBody: {
    ...type.body, color: colors.inkMid, textAlign: 'center',
    maxWidth: 300, lineHeight: 20,
  },
  mustBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  mustBtnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  mustDone: { paddingBottom: spacing.md },
  mustDoneText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.teal, textAlign: 'center' },

  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...type.label, color: colors.inkLt, fontSize: 11 },
  sectionCount: { color: colors.inkGhost },
  sectionHint: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.inkGhost },
  chevron: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkGhost },

  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearDay: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.teal },
  dayEmpty: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.inkLt },

  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  position: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.inkGhost, marginTop: 2 },
  address: { ...type.bodyStrong, fontSize: 15, color: colors.ink, flexShrink: 1, flexGrow: 1 },
  price: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },

  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: colors.tealLine,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scoreBadgeThin: { backgroundColor: 'transparent' },
  scoreValue: { fontFamily: fonts.semibold, fontSize: 16, color: colors.teal },
  scoreValueThin: { color: colors.inkLt },
  scoreOutOf: { fontFamily: fonts.regular, fontSize: 10, color: colors.inkLt },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  when: { fontFamily: fonts.semibold, fontSize: 13, color: colors.terracotta },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkLt },
  notes: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.inkMid, lineHeight: 19 },
  listingLink: { fontFamily: fonts.semibold, fontSize: 13, color: colors.teal, marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  prompt: {
    backgroundColor: colors.creamMid,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  promptTitle: { ...type.bodyStrong, fontSize: 15, color: colors.ink },
  promptBody: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.inkMid, lineHeight: 19 },
});
