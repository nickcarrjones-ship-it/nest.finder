import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { TierPills } from './TierPills';
import { isLearnable, reasonsFor, shouldAskWhy, type DraftTier, type Tier } from '../lib/verdicts';

interface Props {
  name: string;
  tier: DraftTier;
  reasons: string[];
  note: string;
  onTier: (tier: Tier) => void;
  onToggleReason: (id: string) => void;
  onNote: (note: string) => void;
}

/**
 * One person's verdict on one area: the score, and — only at the extremes
 * — why.
 *
 * The order of the asks is the design. From docs/learning-loop.md:
 *
 *  - **The tier alone is a complete answer.** Everything below the pills
 *    is optional and only appears once there is a verdict to explain, so
 *    the minimum interaction really is one tap.
 *  - **"Why" only at the two ends.** A shrug says very little; a flat no
 *    says a great deal. Keeping the second step rare is what stops it
 *    reading as a form — and a form is what kills the response rate this
 *    whole feature depends on.
 *  - **Chips, not typing.** Nobody writes a paragraph on a phone after a
 *    day out. The free-text box is there underneath for the person who
 *    wants it, not as the main road.
 *
 * The been/known/guess chips that used to sit under the score are gone
 * (Nick, 2026-09-01), and so is the basis they wrote (2026-09-02): this
 * block only renders once someone has ticked that they went, so every
 * verdict it can produce is a visit, and a field that is always the same
 * value is not a field.
 *
 * The reasons we hold no data for (safety, price) are shown with a quiet
 * marker rather than hidden. Hiding them would silently train people to
 * only say things we can already measure, and the gap they reveal is
 * exactly what tells us which dataset to go and find next.
 */
export function VerdictBlock({
  name,
  tier,
  reasons,
  note,
  onTier,
  onToggleReason,
  onNote,
}: Props) {
  const [noteOpen, setNoteOpen] = useState(false);
  const chips = tier === null ? [] : reasonsFor(tier);
  const asking = tier !== null && shouldAskWhy(tier);

  return (
    <View style={styles.block}>
      <TierPills value={tier} onChange={onTier} name={name} />

      {asking && (
        <View style={styles.why}>
          <Text style={styles.whyLead}>
            {tier === 'not_for_us' ? 'What put you off?' : 'What did you like?'}
          </Text>

          <View style={styles.chipWrap}>
            {chips.map((r) => {
              const on = reasons.includes(r.id);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => onToggleReason(r.id)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
                  {/* A quiet dot on the two we can't measure yet. It reads as
                      a footnote, not a warning — the answer is still wanted. */}
                  {!isLearnable(r) && <Text style={[styles.gap, on && styles.gapOn]}>°</Text>}
                </Pressable>
              );
            })}
          </View>

          {noteOpen ? (
            <TextInput
              style={styles.note}
              value={note}
              onChangeText={onNote}
              placeholder="Anything else? (optional)"
              placeholderTextColor={colors.inkGhost}
              multiline
              maxLength={280}
              autoFocus
            />
          ) : (
            <Pressable onPress={() => setNoteOpen(true)} hitSlop={8}>
              <Text style={styles.noteOpen}>Say it in your own words</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.sm },

  why: { marginTop: spacing.md },
  whyLead: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.ink,
    marginBottom: spacing.sm,
  },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkMid },
  chipTextOn: { fontFamily: fonts.semibold, color: colors.white },
  gap: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkGhost },
  gapOn: { color: 'rgba(255,255,255,0.7)' },

  noteOpen: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.teal,
    marginTop: spacing.sm,
    textDecorationLine: 'underline',
  },
  note: {
    marginTop: spacing.sm,
    minHeight: 62,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    padding: 10,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
  },
});
