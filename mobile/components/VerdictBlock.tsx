import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { ScoreSlider } from './ScoreSlider';
import {
  BASIS_LABEL,
  isLearnable,
  reasonsFor,
  shouldAskWhy,
  type Score,
  type VerdictBasis,
} from '../lib/verdicts';

interface Props {
  name: string;
  score: Score;
  basis: VerdictBasis;
  reasons: string[];
  note: string;
  onScore: (score: number) => void;
  onBasis: (basis: VerdictBasis) => void;
  onToggleReason: (id: string) => void;
  onNote: (note: string) => void;
}

const BASES: VerdictBasis[] = ['been', 'known', 'guess'];

/**
 * One person's verdict on one area: the score, and — only at the extremes
 * — why.
 *
 * The order of the asks is the design. From docs/learning-loop.md:
 *
 *  - **The score alone is a complete answer.** Everything below the slider
 *    is optional and only appears once there is a score to explain, so the
 *    minimum interaction really is one tap.
 *  - **"Why" only at 0-2 and 9-10.** A 6 says very little; a 0 says a
 *    great deal. Keeping the second step rare is what stops it reading as
 *    a form — and a form is what kills the response rate this whole
 *    feature depends on.
 *  - **Chips, not typing.** Nobody writes a paragraph on a phone after a
 *    day out. The free-text box is there underneath for the person who
 *    wants it, not as the main road.
 *
 * The reasons we hold no data for (safety, price) are shown with a quiet
 * marker rather than hidden. Hiding them would silently train people to
 * only say things we can already measure, and the gap they reveal is
 * exactly what tells us which dataset to go and find next.
 */
export function VerdictBlock({
  name,
  score,
  basis,
  reasons,
  note,
  onScore,
  onBasis,
  onToggleReason,
  onNote,
}: Props) {
  const [noteOpen, setNoteOpen] = useState(false);
  const chips = score === null ? [] : reasonsFor(score);
  const asking = score !== null && shouldAskWhy(score);

  return (
    <View style={styles.block}>
      <ScoreSlider value={score} onChange={onScore} name={name} />

      {score !== null && (
        <View style={styles.basisRow}>
          {BASES.map((b) => (
            <Pressable
              key={b}
              onPress={() => onBasis(b)}
              style={[styles.basisChip, basis === b && styles.basisChipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: basis === b }}
            >
              <Text style={[styles.basisText, basis === b && styles.basisTextOn]}>
                {BASIS_LABEL[b]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {asking && (
        <View style={styles.why}>
          <Text style={styles.whyLead}>
            {score! <= 2 ? 'What put you off?' : 'What did you like?'}
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

  basisRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  basisChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.white,
  },
  basisChipOn: { backgroundColor: colors.tealSoft, borderColor: colors.tealLine },
  basisText: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.inkLt },
  basisTextOn: { fontFamily: fonts.semibold, color: colors.teal },

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
