import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from './ui/Card';
import { VerdictBlock } from './VerdictBlock';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { Member } from '../lib/types';
import { useVerdict } from '../hooks/useVerdict';
import type { PickWithLocation } from './PicksCarousel';

interface Props {
  pick: PickWithLocation;
  members: Member[];
  onToggleVisited: () => void;
  onClose: () => void;
}

/**
 * The verdict card for a tapped carousel pick — same floating-card
 * language as SelectedAreaCard (not a dimmed modal, map stays interactive
 * underneath).
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

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

        <Text style={styles.sectionLabel}>
          {pick.visited ? 'WHAT DID YOU MAKE OF IT?' : 'WHAT DO YOU THINK?'}
        </Text>

        {members.map((m) => (
          <MemberVerdict key={m.id} member={m} pick={pick} showName={members.length > 1} />
        ))}
      </ScrollView>
    </Card>
  );
}

/**
 * Split out because each member needs their own useVerdict hook, and hooks
 * cannot be called in a loop inside the parent.
 */
function MemberVerdict({
  member,
  pick,
  showName,
}: {
  member: Member;
  pick: PickWithLocation;
  showName: boolean;
}) {
  const { draft, setScore, setBasis, setNote, toggleReason } = useVerdict(
    pick.neighbourhood,
    member.id,
    {
      // The app already knows whether they marked this visited, so it never
      // asks a question it can answer. Everything else defaults to 'guess'
      // (store/verdictsStore.ts) — the conservative reading.
      defaultBasis: pick.visited ? 'been' : undefined,
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
      {showName && <Text style={styles.memberName}>{member.name}</Text>}
      <VerdictBlock
        name={member.name}
        score={draft.score}
        basis={draft.basis}
        reasons={draft.reasons}
        note={draft.note}
        onScore={setScore}
        onBasis={setBasis}
        onToggleReason={toggleReason}
        onNote={setNote}
      />
      {/* Pay it back immediately. Rating has to feel like steering, not like
          filling in a form — it is the single strongest reason anyone does
          it a second time (docs/learning-loop.md). */}
      {draft.score !== null && (
        <Text style={styles.payback}>
          {draft.score >= 7
            ? 'Noted — we’ll look for more like this.'
            : draft.score <= 3
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
  sectionLabel: { ...type.label, color: colors.inkGhost, marginBottom: 2 },
  memberBlock: { marginBottom: spacing.md },
  memberName: { ...type.body, fontSize: 12, color: colors.inkMid, marginTop: spacing.sm },
  payback: {
    fontFamily: fonts.italic,
    fontSize: 12,
    color: colors.teal,
    marginTop: spacing.sm,
  },
});
