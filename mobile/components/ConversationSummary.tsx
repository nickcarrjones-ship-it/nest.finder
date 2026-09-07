import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { joinWords, type ConversationSummary as Summary } from '../lib/conversationSummary';

interface Props {
  summary: Summary;
  /** Whether the full message history is currently on screen. */
  expanded: boolean;
  onToggle: () => void;
}

/**
 * What the Agent already knows, at the top of its own tab.
 *
 * Coming back to the Agent used to mean being asked "which areas do you
 * love?" all over again (Nick, 2026-09-07) — a question answered days
 * before, which reads as the app having kept nothing. Leading with the
 * answers inverts that: the first thing you see is that it remembered.
 *
 * Green rather than the app's teal, deliberately. Teal is the accent that
 * marks things you can act on — buttons, the selected pill, the wheel's
 * centre band — and this is the opposite of that: it is settled, already
 * decided, nothing here needs doing. Green is also what "ideal" means on
 * the map, so it carries the right sense of a thing that is going well.
 */
export function ConversationSummary({ summary, expanded, onToggle }: Props) {
  const { loves, hates, reason, lines } = summary;

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>What I know so far</Text>

      {loves.length > 0 && (
        <View style={styles.row}>
          <Text style={styles.label}>You love</Text>
          <Text style={styles.value}>{joinWords(loves)}</Text>
        </View>
      )}

      {/* Their own sentence, in quotes and italic — it is the one thing on
          this card they actually wrote, and the matching leans on it more
          than on anything else here. */}
      {reason && (
        <View style={styles.row}>
          <Text style={styles.label}>Because</Text>
          <Text style={styles.quote}>“{reason}”</Text>
        </View>
      )}

      {hates.length > 0 && (
        <View style={styles.row}>
          <Text style={styles.label}>Not for you</Text>
          <Text style={styles.value}>{joinWords(hates)}</Text>
        </View>
      )}

      {lines.map((l) => (
        <View key={l.label} style={styles.row}>
          <Text style={styles.label}>{l.label}</Text>
          <Text style={styles.value}>{l.value}</Text>
        </View>
      ))}

      <Pressable
        onPress={onToggle}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={styles.toggleText}>
          {expanded ? 'Hide messages' : 'Show all messages'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.greenBg,
    borderWidth: 1,
    borderColor: colors.greenLine,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  heading: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.green,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  // Fixed width so the values line up into a readable column rather than
  // starting at a different place on every row.
  label: { width: 84, fontFamily: fonts.semibold, fontSize: 12.5, color: colors.inkMid, paddingTop: 1 },
  value: { flex: 1, ...type.body, fontSize: 13.5, color: colors.ink },
  quote: { flex: 1, fontFamily: fonts.italic, fontSize: 13.5, lineHeight: 19, color: colors.ink },
  toggle: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingVertical: 6,
  },
  toggleText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.green,
    textDecorationLine: 'underline',
  },
});
