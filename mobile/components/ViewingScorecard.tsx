import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BottomSheet } from './ui';
import { ViewingVideos } from './ViewingVideos';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useMustHaves } from '../hooks/useMustHaves';
import { useViewings } from '../hooks/useViewings';
import { assess, describeCoverage, formatScore, type Checks } from '../lib/mustHaves';
import { describeProperty, type Viewing } from '../lib/viewings';

/**
 * The card someone holds while they are standing in the property.
 *
 * Every tap writes immediately — there is no Save button. Someone doing
 * this is walking through a flat with an agent talking at them, and a card
 * that loses its answers because they closed it is worse than no card. The
 * store is written first and Firebase second (see useViewings), so a tap
 * lands whatever the signal is like in a basement flat.
 *
 * Three states per must-have, not two. Leaving one unanswered is normal
 * and is NOT counted as a failure — see `assess` for what that costs and
 * why it is still the right reading.
 */
interface Props {
  viewing: Viewing | null;
  onClose: () => void;
  /** Asks first, then deletes. Lives here at the foot of the card rather
   *  than on the list row, where it was too easy to hit by accident
   *  (Nick, 2026-09-25). */
  onRemove: (viewing: Viewing) => void;
}

export function ViewingScorecard({ viewing, onClose, onRemove }: Props) {
  const router = useRouter();
  const { items: mustHaves } = useMustHaves();
  const { save } = useViewings();
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setNotes(viewing?.notes ?? '');
  }, [viewing?.id, viewing?.notes]);

  if (!viewing) return null;

  const checks: Checks = viewing.checks ?? {};
  const assessment = assess(mustHaves, checks);
  const score = formatScore(assessment.score);
  const coverage = describeCoverage(assessment);
  const description = describeProperty(viewing);

  /** Tap the answer you already gave to take it back. Nothing else offers
   *  a way out of a mis-tap, and a wrong tick quietly skews the ranking. */
  function setCheck(id: string, value: boolean) {
    const next: Checks = { ...checks };
    if (next[id] === value) delete next[id];
    else next[id] = value;
    save({ ...(viewing as Viewing), checks: next });
  }

  function commitNotes() {
    const trimmed = notes.trim();
    const current = viewing?.notes ?? '';
    if (trimmed === current) return;
    save({ ...(viewing as Viewing), notes: trimmed || null });
  }

  return (
    // Closing saves the note first (Nick, 2026-09-25). Notes otherwise only
    // save when the box loses focus, and closing with the keyboard still up
    // can unmount the box without that ever happening — losing the note.
    <BottomSheet visible onClose={() => { commitNotes(); onClose(); }} title="Maloca Scorecard">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.address} numberOfLines={2}>{viewing.address}</Text>
            <Text style={styles.sub}>
              {[viewing.priceText, description].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {score !== null && (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreValue}>{score}</Text>
              <Text style={styles.scoreOutOf}>/10</Text>
            </View>
          )}
        </View>

        {coverage && <Text style={styles.coverage}>{coverage}</Text>}

        {mustHaves.length === 0 ? (
          <View style={styles.noList}>
            <Text style={styles.noListTitle}>No must-haves yet</Text>
            <Text style={styles.noListBody}>
              Write down what matters to you and you can tick it off in every property -
              we'll score each one out of 10 and put the best at the top.
            </Text>
            <Pressable
              style={styles.noListBtn}
              onPress={() => { commitNotes(); onClose(); router.push('/must-haves'); }}
              accessibilityRole="button"
            >
              <Text style={styles.noListBtnText}>Set up your must-haves</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {mustHaves.map((mustHave, i) => {
              const value = checks[mustHave.id];
              return (
                <View key={mustHave.id} style={styles.row}>
                  <Text style={styles.rowRank}>{i + 1}</Text>
                  <Text style={styles.rowText} numberOfLines={2}>{mustHave.text.toUpperCase()}</Text>
                  <View style={styles.answers}>
                    <Pressable
                      onPress={() => setCheck(mustHave.id, true)}
                      style={[styles.answer, value === true && styles.yesOn]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: value === true }}
                      accessibilityLabel={`${mustHave.text}: yes`}
                    >
                      <Text style={[styles.answerMark, value === true && styles.yesMark]}>✓</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCheck(mustHave.id, false)}
                      style={[styles.answer, value === false && styles.noOn]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: value === false }}
                      accessibilityLabel={`${mustHave.text}: no`}
                    >
                      <Text style={[styles.answerMark, value === false && styles.noMark]}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {assessment.provisional && assessment.answered > 0 && (
              // Said rather than hidden: a score from two answers out of
              // twelve will rank above a thoroughly checked property, and
              // nobody should discover that from the ordering alone.
              <Text style={styles.provisional}>
                Only part of your list is answered, so this score could move a lot.
              </Text>
            )}
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>NOTES</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={notes}
            onChangeText={setNotes}
            onBlur={commitNotes}
            multiline
            placeholder="Damp smell in the back bedroom. Neighbour said the road floods."
            placeholderTextColor={colors.inkGhost}
            accessibilityLabel="Notes about this property"
          />
          <Text style={styles.hint}>Saved as you go - you'll still have these in a month.</Text>
        </View>

        {mustHaves.length > 0 && (
          <Pressable
            onPress={() => { commitNotes(); onClose(); router.push('/must-haves'); }}
            hitSlop={6}
            accessibilityRole="button"
          >
            <Text style={styles.editLink}>Edit your must-haves</Text>
          </Pressable>
        )}

        <ViewingVideos viewingId={viewing.id} />

        <Pressable
          style={styles.removeRow}
          onPress={() => { commitNotes(); onRemove(viewing); }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${viewing.address}`}
        >
          <Text style={styles.removeText}>Remove this property</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.lg },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headText: { flex: 1, gap: 2 },
  address: { ...type.bodyStrong, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkLt },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: colors.tealLine,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scoreValue: { fontFamily: fonts.semibold, fontSize: 20, color: colors.teal },
  scoreOutOf: { fontFamily: fonts.regular, fontSize: 11, color: colors.teal },
  coverage: { fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 1, color: colors.inkGhost, marginTop: -spacing.md },

  list: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  rowRank: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.inkGhost, width: 16 },
  rowText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, lineHeight: 20 },
  answers: { flexDirection: 'row', gap: 6 },
  answer: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  answerMark: { fontFamily: fonts.semibold, fontSize: 15, color: colors.inkGhost },
  yesOn: { backgroundColor: colors.greenBg, borderColor: colors.greenLine },
  yesMark: { color: colors.green },
  noOn: { backgroundColor: colors.redBg, borderColor: colors.redLine },
  noMark: { color: colors.red },

  provisional: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.inkLt,
    lineHeight: 17,
    marginTop: spacing.xs,
  },

  noList: { gap: spacing.sm, alignItems: 'flex-start' },
  noListTitle: { ...type.bodyStrong, fontSize: 15, color: colors.ink },
  noListBody: { ...type.body, color: colors.inkMid, lineHeight: 20 },
  noListBtn: {
    marginTop: spacing.xs,
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  noListBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },

  field: { gap: spacing.xs },
  label: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1.3, color: colors.inkGhost },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  notes: { minHeight: 88, textAlignVertical: 'top' },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkLt },
  editLink: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.teal },
  // Set apart by a rule so it never reads as part of the scoring above.
  removeRow: { borderTopWidth: 1, borderTopColor: colors.rule, paddingTop: spacing.md, alignItems: 'center' },
  removeText: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.red },
});
