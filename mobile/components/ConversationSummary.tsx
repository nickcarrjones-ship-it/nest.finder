import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { joinWords, type ConversationSummary as Summary } from '../lib/conversationSummary';

interface Props {
  summary: Summary;
  open: boolean;
  onToggle: () => void;
}

/**
 * What the Agent already knows, at the top of its own tab.
 *
 * REDESIGNED 2026-09-07 — the first version was a label/value table in a
 * green box with an inner scrollbar, and Nick's verdict was "really ugly",
 * which it was. Three things were wrong with it and each has a rule now:
 *
 * A table reads as a FORM, and this card is meant to read as recognition —
 * "yes, that's us". So the answers are pills: "south of the river" needs no
 * column heading to be understood, where "The river: south of it" needed
 * the pairing to make sense of it. Pills are also the app's own language
 * already, on the tier scoring and the property criteria sheet.
 *
 * It scrolled INSIDE itself, so opening it showed you part of what it knew
 * and hid the rest behind a gesture nobody expects in a summary. Now it is
 * either shut, or open and complete. Nothing is ever clipped.
 *
 * And it was open by default, so it dominated a screen whose actual job is
 * the conversation. It starts shut, showing one line of what it holds, and
 * shuts again the moment you send — at which point what you just said
 * matters more than what it remembered.
 */
export function ConversationSummary({ summary, open, onToggle }: Props) {
  const { loves, hates, reason, chips } = summary;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        style={styles.bar}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="What the Agent knows so far"
      >
        <View style={styles.barText}>
          <Text style={styles.heading}>What I know so far</Text>
          {/* Shut, it still says something rather than just labelling
              itself — a header that only names a drawer makes you open the
              drawer to find out whether it was worth opening. */}
          {!open && (
            <Text style={styles.preview} numberOfLines={1}>
              {previewOf(summary)}
            </Text>
          )}
        </View>
        <Text style={styles.chevron}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>

      {open && (
        <View style={styles.body}>
          {/* Their own sentence leads, and is the only prose here. It is the
              one thing on this card they actually wrote, and the sentence
              the matching leans on hardest. */}
          {reason && (
            <View style={styles.quoteWrap}>
              <View style={styles.quoteRule} />
              <Text style={styles.quote}>{reason}</Text>
            </View>
          )}

          {loves.length > 0 && (
            <Group label="Areas you like">
              {loves.map((a) => <Chip key={a} text={a} tone="love" />)}
            </Group>
          )}

          {hates.length > 0 && (
            <Group label="Ruled out">
              {hates.map((a) => <Chip key={a} text={a} tone="out" />)}
            </Group>
          )}

          {chips.length > 0 && (
            <Group label="What you told me">
              {chips.map((c) => <Chip key={c} text={c} tone="plain" />)}
            </Group>
          )}
        </View>
      )}
    </View>
  );
}

/** One line for the shut state — the areas, which is what anyone checks first. */
function previewOf(s: Summary): string {
  if (s.loves.length) return joinWords(s.loves);
  if (s.chips.length) return s.chips.join(' · ');
  return 'Tap to see';
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

function Chip({ text, tone }: { text: string; tone: 'love' | 'out' | 'plain' }) {
  return (
    <View style={[styles.chip, tone === 'love' && styles.chipLove, tone === 'out' && styles.chipOut]}>
      <Text style={[styles.chipText, tone === 'love' && styles.chipTextLove]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.greenBg,
    borderWidth: 1,
    borderColor: colors.greenLine,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  barText: { flex: 1, gap: 1 },
  // Sentence case, not the shouty uppercase this had before.
  heading: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.green },
  preview: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkMid },
  chevron: { fontSize: 15, color: colors.green, fontFamily: fonts.bold, marginTop: -2 },

  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },

  quoteWrap: { flexDirection: 'row', gap: spacing.sm },
  quoteRule: { width: 2, borderRadius: 1, backgroundColor: colors.greenLine },
  quote: { flex: 1, fontFamily: fonts.italic, fontSize: 14, lineHeight: 20, color: colors.ink },

  group: { gap: 5 },
  groupLabel: {
    fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.3,
    textTransform: 'uppercase', color: colors.inkLt,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: {
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.greenLine,
  },
  chipLove: { backgroundColor: colors.green, borderColor: colors.green },
  // Ruled out reads as struck through rather than as a red warning: it is a
  // preference they expressed, not a problem to flag at them.
  chipOut: { backgroundColor: 'transparent', borderColor: colors.rule },
  chipText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink },
  chipTextLove: { color: colors.white },
});
