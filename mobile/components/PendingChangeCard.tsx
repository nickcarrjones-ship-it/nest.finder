import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { PendingChange } from '../lib/pendingChange';

interface Props {
  change: PendingChange;
  onApply: () => void;
  onDismiss: () => void;
}

/**
 * "Update your map?" — the gate between talking and your results moving.
 *
 * Everything said to the Agent used to rewrite the profile the moment the
 * model parsed it, and the map re-ranked underneath you. That is correct
 * during setup and wrong afterwards: "what about Fulham?" is a question,
 * not an instruction (Nick, 2026-09-07).
 *
 * It states what would change in the household's own terms and waits. The
 * conversation is kept either way — dismissing rejects the change to the
 * profile, not the thing they said.
 */
export function PendingChangeCard({ change, onApply, onDismiss }: Props) {
  const ranking = change.described.filter((d) => d.effect === 'ranking');
  const noted = change.described.filter((d) => d.effect === 'noted');

  return (
    <View style={styles.card}>
      {/* The heading tells the truth about what pressing the button does.
          Some preferences reach the arithmetic — areas, the river, Zone 1,
          what you like — and some are only recorded. A card headed "update
          your map" that lists nothing capable of changing the map is
          promising what it cannot deliver (Nick, 2026-09-07). */}
      <Text style={styles.heading}>
        {change.movesMap ? 'Update your map?' : 'Save this?'}
      </Text>

      {ranking.length > 0 && ranking.map((line) => (
        <View key={line.text} style={styles.line}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.lineText}>{line.text}</Text>
        </View>
      ))}

      {noted.length > 0 && (
        <>
          {/* Stated plainly rather than hidden. Someone who just told the
              Agent something important deserves to know it was heard AND
              that it will not move their results — quietly filing it under
              a heading that implies otherwise is the dishonest option. */}
          <Text style={styles.notedLabel}>
            {change.movesMap ? "Also noted - won't change your areas" : "Noted, but won't change your areas"}
          </Text>
          {noted.map((line) => (
            <View key={line.text} style={styles.line}>
              <Text style={styles.bulletQuiet}>•</Text>
              <Text style={styles.lineTextQuiet}>{line.text}</Text>
            </View>
          ))}
        </>
      )}

      <View style={styles.actions}>
        {/* "Not now" first and quiet, "Update" second and solid: the
            reversible choice should be the easy one to reach, and the one
            that moves their results should take a deliberate press. */}
        <Pressable onPress={onDismiss} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Not now</Text>
        </Pressable>
        <Pressable onPress={onApply} style={styles.primary} accessibilityRole="button">
          <Text style={styles.primaryText}>{change.movesMap ? 'Update map' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.tealLine,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    marginBottom: spacing.sm,
  },
  heading: { ...type.bodyStrong, fontSize: 14.5, color: colors.ink, marginBottom: 2 },
  line: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  bullet: { color: colors.teal, fontSize: 14, lineHeight: 19 },
  lineText: { flex: 1, ...type.body, fontSize: 13.5, lineHeight: 19, color: colors.ink },
  notedLabel: {
    fontFamily: fonts.semibold, fontSize: 11.5, color: colors.inkLt,
    marginTop: spacing.xs, letterSpacing: 0.2,
  },
  bulletQuiet: { color: colors.inkGhost, fontSize: 14, lineHeight: 19 },
  lineTextQuiet: { flex: 1, ...type.body, fontSize: 13, lineHeight: 19, color: colors.inkMid },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  secondary: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.rule,
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.inkMid },
  primary: {
    flex: 1, paddingVertical: spacing.sm, alignItems: 'center',
    borderRadius: radius.pill, backgroundColor: colors.teal,
  },
  primaryText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.white },
});
