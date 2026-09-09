import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from './ui/Card';
import { VerdictBlock } from './VerdictBlock';
import { WhyThisArea } from './WhyThisArea';
import { SchoolsNearby } from './SchoolsNearby';
import { FindPropertiesButton } from './FindPropertiesButton';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { Member } from '../lib/types';
import { useVerdict } from '../hooks/useVerdict';
import { useVerdictsStore } from '../store/verdictsStore';
import { verdictKey } from '../lib/verdicts';
import { compareToLoved, formatMedian, medianFor, priceYearRange, trendFor } from '../lib/areaPrices';
import { useProfileStore } from '../store/profileStore';
import { effectiveLovedOrder } from '../lib/lovedAreas';
import type { PickWithLocation } from './PicksCarousel';

interface Props {
  pick: PickWithLocation;
  members: Member[];
  onToggleVisited: () => void;
  onClose: () => void;
}

/**
 * The verdict card for a tapped carousel pick — same floating-card
 * language the station card used before it was removed: a floating card,
 * not a dimmed modal, so the map stays interactive underneath.
 *
 * This used to be a row of eleven rating dots per person. It is now the
 * app's verdict capture (docs/learning-loop.md): a score that starts
 * unset, a "why" that only appears at the extremes, and an honest record
 * of whether they actually went.
 *
 * The framing that matters is that the score is THEIR record of the hunt
 * — the thing they open to remember whether they liked Nunhead — and the
 * learning is a by-product of them using it for their own reasons. The
 * moment it reads as us collecting data, the response rate dies and there
 * is nothing to learn from.
 *
 * Known seam, not smoothed over: verdicts are keyed by area NAME, and a
 * neighbourhood's name can differ from any one of its stations' names —
 * "Clapham Town" groups Clapham North/High Street/Common, but tapping one
 * of THEIR circles on the map still rates under the station's own name.
 * Reconciling that means deciding whether verdicts live on stations or
 * neighbourhoods app-wide, which is bigger than this card — flagged here
 * rather than papered over with a silent lookup that would hide the
 * inconsistency.
 */
export function PickDetailCard({ pick, members, onToggleVisited, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const verdicts = useVerdictsStore((s) => s.verdicts);

  /**
   * Scoring is for people who have BEEN (Nick, 2026-09-01). An opinion from
   * the sofa and an opinion from the pavement are not the same evidence,
   * and the learning loop is only worth having if it is built on the second.
   *
   * With one exception, which matters: anyone who has ALREADY scored keeps
   * seeing their score. Verdicts sync across a household from Firebase and
   * outlive any one ranking, so a score can easily exist against an area
   * whose visited flag this device never set — a partner ticked it on their
   * phone, or the shortlist has been re-ranked since. The card exists for
   * them to remember what they thought, and hiding that to enforce a rule
   * they have already satisfied would break its main job.
   */
  /**
   * What it costs, against somewhere they already know.
   *
   * This is the card with room for the full sentence — the carousel card is
   * 148pt wide and gets the bare figure. "£220k dearer than Tooting
   * Broadway" is the more useful form: a median alone is a number people
   * have to do arithmetic on.
   */
  const areaCards = useProfileStore((s) => s.profile.areaCards);
  const lovedOrder = useProfileStore((s) => s.profile.lovedOrder);
  const loveArea = useProfileStore((s) => s.loveArea);
  const reorderLovedArea = useProfileStore((s) => s.reorderLovedArea);
  const isLoved = areaCards?.[pick.neighbourhood] === 'love';
  const lovedPosition = isLoved
    ? effectiveLovedOrder(areaCards, lovedOrder).indexOf(pick.neighbourhood) + 1
    : 0;
  const band = medianFor(pick.neighbourhood);
  const trend = trendFor(pick.neighbourhood);
  const comparison = compareToLoved(
    pick.neighbourhood,
    Object.entries(areaCards ?? {}).filter(([, v]) => v === 'love').map(([k]) => k),
  );

  const alreadyScored = members.some(
    (m) => verdicts[verdictKey(pick.neighbourhood, m.id)] !== undefined,
  );
  const canScore = pick.visited || alreadyScored;

  return (
    <Card elevated style={[styles.card, { paddingBottom: insets.bottom + spacing.md }]}>
      {/* The search button sits ON the title line rather than in a row of
          its own (Nick, 2026-09-08). Full width it read as the card's
          primary action, which it is not — the card is for deciding, and
          this is the way out once you have. Sized to its own words, beside
          the name, it stays reachable without claiming the space. */}
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.name} numberOfLines={1}>{pick.neighbourhood}</Text>
          {pick.confidence === 'low' && (
            <Text style={styles.lowConfidence}>Less certain pick — worth judging in person</Text>
          )}
        </View>
        <FindPropertiesButton area={pick.neighbourhood} />
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* The DESCRIPTION leads. This is the model's own sentence, and it
            is the writing on this card people actually read — so the block
            that used to sit above it, saying the same thing in flatter
            words, now sits below it as provenance instead (Nick,
            2026-09-01). */}
        {band && (
          <View style={styles.priceBlock}>
            <View style={styles.priceLine}>
              <Text style={styles.priceValue}>{formatMedian(band.median)}</Text>
              <Text style={styles.priceUnit}>typical sold price</Text>
              {trend && (
                <Text style={styles.priceTrend}>
                  {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '–'}
                  {trend.direction !== 'flat' ? ` ${Math.abs(trend.changePct).toFixed(0)}%` : ''}
                </Text>
              )}
            </View>
            {comparison && <Text style={styles.priceCompare}>{comparison.label}</Text>}
            {/* Required by the Open Government Licence, and the right thing
                to say anyway: this is a real measurement with a source. */}
            <Text style={styles.priceSource}>
              Land Registry{priceYearRange() ? ` ${priceYearRange()}` : ''}, {band.sales} sales
            </Text>
          </View>
        )}

        <Text style={styles.reason}>{pick.reason}</Text>

        {/*
          Loved and not-yet-loved areas get opposite controls here, never
          both — turning a suggestion into a loved area IS the same
          decision that reordering builds on, not a step before it, so a
          card is one or the other (Nick, 2026-09-09).
        */}
        {isLoved ? (
          <View style={styles.rankBlock}>
            <Text style={styles.rankLabel}>Your rank</Text>
            <View style={styles.rankRow}>
              {[1, 2, 3].map((position) => (
                <Pressable
                  key={position}
                  onPress={() => reorderLovedArea(pick.neighbourhood, position)}
                  style={[styles.rankBtn, lovedPosition === position && styles.rankBtnOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: lovedPosition === position }}
                  accessibilityLabel={`Make this your number ${position} preferred area`}
                >
                  <Text style={[styles.rankBtnText, lovedPosition === position && styles.rankBtnTextOn]}>
                    #{position}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => loveArea(pick.neighbourhood)}
            style={styles.loveBtn}
            accessibilityRole="button"
            accessibilityLabel={`Add ${pick.neighbourhood} to the areas you love`}
          >
            <Text style={styles.loveBtnText}>♥ Love this area</Text>
          </Pressable>
        )}

        {pick.why && <WhyThisArea why={pick.why} />}

        <SchoolsNearby area={pick.neighbourhood} />

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
            {pick.visited ? "You've been here" : "I've been here"}
          </Text>
        </Pressable>

        {canScore ? (
          <>
            <Text style={styles.sectionLabel}>WHAT DID YOU MAKE OF IT?</Text>
            {members.map((m) => (
              <MemberVerdict key={m.id} member={m} pick={pick} />
            ))}
          </>
        ) : (
          <Text style={styles.locked}>
            Been for a look? Tick it off above and you can score it.
          </Text>
        )}
      </ScrollView>
    </Card>
  );
}

/**
 * Split out because each member needs their own useVerdict hook, and hooks
 * cannot be called in a loop inside the parent.
 */
function MemberVerdict({ member, pick }: { member: Member; pick: PickWithLocation }) {
  const { draft, setTier, setNote, toggleReason } = useVerdict(
    pick.neighbourhood,
    member.id,
    {
      // Kept WITH the verdict: by the time anything learns from this, the
      // ranking will have moved on and why this area was ever suggested
      // would be unrecoverable.
      suggested: {
        score: pick.score,
        reason: pick.reason,
        confidence: pick.confidence,
      },
    },
  );

  return (
    <View style={styles.memberBlock}>
      {/* The name is NOT printed here any more. TierPills prints it once,
          in full ink, directly above the pills it belongs to — this block
          used to print it too, fainter, and two pale labels answering the
          same question is most of why whose-score-was-whose was hard to
          read (Nick, 2026-09-02). */}
      <VerdictBlock
        name={member.name}
        tier={draft.tier}
        reasons={draft.reasons}
        note={draft.note}
        onTier={setTier}
        onToggleReason={toggleReason}
        onNote={setNote}
      />
      {/* Pay it back immediately. Rating has to feel like steering, not like
          filling in a form — it is the single strongest reason anyone does
          it a second time (docs/learning-loop.md). */}
      {draft.tier !== null && (
        <Text style={styles.payback}>
          {draft.tier === 'loved_it'
            ? 'Noted — we’ll look for more like this.'
            : draft.tier === 'not_for_us'
              ? 'Noted — we’ll steer away from places like this.'
              : 'Noted.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 108, // clears the picks carousel + insets docked at the tab bar
    maxHeight: '62%', // taller than the dots version: the "why" step needs the room
  },
  header: {
    flexDirection: 'row',
    // Centred, not top-aligned: the search button now shares this row with
    // the name and should sit on its line rather than above it.
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  priceBlock: { marginBottom: spacing.sm, gap: 1 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  priceValue: { ...type.title, fontSize: 20, color: colors.ink },
  priceUnit: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.inkMid },
  // Uncoloured: rising prices are good or bad news depending entirely on
  // whether you are buying or already own, so this reports a direction and
  // declines to pass a verdict on it.
  priceTrend: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkMid },
  priceCompare: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  priceSource: { fontFamily: fonts.regular, fontSize: 10.5, color: colors.inkLt },
  titleBlock: { flex: 1, gap: 2 },
  name: { ...type.title, fontSize: 18, color: colors.ink },
  lowConfidence: { fontFamily: fonts.italic, fontSize: 11.5, color: colors.inkGhost },
  close: { ...type.body, color: colors.inkGhost, fontSize: 18, paddingLeft: spacing.sm },
  // Promoted to lead, so it carries a bit more weight than body copy.
  reason: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.ink,
    marginBottom: spacing.md,
  },
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
  sectionLabel: { ...type.label, color: colors.inkGhost, marginBottom: 2 },
  locked: {
    fontFamily: fonts.italic,
    fontSize: 12.5,
    color: colors.inkLt,
    paddingBottom: spacing.sm,
  },
  loveBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.anchorRoseLine,
    backgroundColor: colors.anchorRoseSoft,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  loveBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.anchorRose },
  rankBlock: { marginBottom: spacing.md, gap: 6 },
  rankLabel: { ...type.label, color: colors.inkGhost },
  rankRow: { flexDirection: 'row', gap: spacing.sm },
  rankBtn: {
    minWidth: 44,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  rankBtnOn: { backgroundColor: colors.anchorRose, borderColor: colors.anchorRose },
  rankBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkMid },
  rankBtnTextOn: { color: colors.white },
  memberBlock: { marginTop: spacing.md },
  payback: {
    fontFamily: fonts.italic,
    fontSize: 12,
    color: colors.teal,
    marginTop: spacing.sm,
  },
});
