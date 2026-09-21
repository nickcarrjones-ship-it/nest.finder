import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import { TAP_STEPS } from '../lib/setupSteps';
import { matchRuleOutOptions, splitFreeText } from '../lib/ruleOutOptions';
import type { AreaCards, Lifestyle } from '../lib/types';

type Compass = NonNullable<Lifestyle['socialCircle']>;

interface Props {
  /** How many taps are already done — drives which question shows. */
  index: number;
  onAnswered: () => void;
  onFinished: () => void;
}

/**
 * The four tapped questions, asked ONE AT A TIME.
 *
 * One at a time on purpose (Nick, 2026-08-30): every tap advances the
 * progress line, so the thing he asked for — "very, very clear that
 * question one leads to question two, and you're getting closer" — is
 * literally what the interaction does. Putting all four on one card would
 * make the line jump once at the end and teach nobody anything.
 *
 * These four are load-bearing: the Agent's prompt explicitly forbids it
 * asking any of them (lib/agentChat/prompt.ts), so if this component ever
 * stops being shown, those four preferences stop being collected at all.
 */
export function SetupTapQuestions({ index, onAnswered, onFinished }: Props) {
  const updateLifestyle = useProfileStore((s) => s.updateLifestyle);
  const updateAreaCards = useProfileStore((s) => s.updateAreaCards);
  /** Chosen from the list — the hard rule-outs. */
  const [ruledOut, setRuledOut] = useState<string[]>([]);
  const [ruleOutQuery, setRuleOutQuery] = useState('');
  /** Typed in the box below it — anything a list could not hold. */
  const [ruleOutText, setRuleOutText] = useState('');
  const [zone1, setZone1] = useState<boolean | null>(null);

  const step = TAP_STEPS[index];
  if (!step) return null;

  function advance() {
    if (index >= TAP_STEPS.length - 1) onFinished();
    else onAnswered();
  }

  // ── 1. Anywhere you'd rule out? + Would you live in Zone 1? ──────────
  /**
   * ONE screen for both (Nick, 2026-09-21). They are the same decision
   * asked twice, and the rule-out half is a picker now rather than a free
   * text box, so there is room underneath it for a yes/no.
   *
   * Picking from a list rather than typing, "similar style to the work
   * station autocomplete": a typed rule-out is matched as a string against
   * real area names, so a typo or a name we spell differently silently
   * ruled out nothing at all. A chosen name always matches.
   */
  if (step.id === 'ruleOut') {
    function choose(name: string) {
      setRuledOut((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setRuleOutQuery('');
    }

    function submit() {
      // Chips are the hard rule: lib/ranking/ruleOuts.ts REMOVES these
      // candidates rather than asking the model to avoid them.
      const patch: AreaCards = {};
      for (const name of ruledOut) patch[name] = 'hate';
      // The free-text box is the soft one — "anywhere in east London" is
      // not a row in any list, so it goes to the model as a dealbreaker.
      // It is ALSO split into names, so somebody who types "Croydon" there
      // instead of picking it still gets Croydon hard-removed; a phrase
      // that is not a place matches nothing and costs nothing.
      const typed = splitFreeText(ruleOutText);
      for (const name of typed) patch[name] = 'hate';
      if (Object.keys(patch).length) updateAreaCards(patch);

      // APPENDED, not replaced: the Agent may already have recorded
      // dealbreakers from the conversation, and overwriting the list with
      // this one line would quietly throw those away.
      const note = ruleOutText.trim();
      const existing = useProfileStore.getState().profile.lifestyle?.dealbreakers ?? [];
      updateLifestyle({
        zone1Ok: zone1 ?? undefined,
        ...(note && !existing.includes(note) ? { dealbreakers: [...existing, note] } : {}),
      });
      advance();
    }

    const suggestions = matchRuleOutOptions(ruleOutQuery, ruledOut);

    return (
      <View style={styles.page}>
        <Question title={step.question} note="Leave it empty if there's nowhere.">
          <View style={styles.stack}>
            <TextInput
              style={styles.input}
              value={ruleOutQuery}
              onChangeText={setRuleOutQuery}
              placeholder="Start typing an area…"
              placeholderTextColor={colors.inkGhost}
              autoCorrect={false}
              autoCapitalize="words"
            />

            {suggestions.length > 0 && (
              <View style={styles.suggestions}>
                {suggestions.map((name) => (
                  <Pressable
                    key={name}
                    onPress={() => choose(name)}
                    style={styles.suggestion}
                    accessibilityRole="button"
                  >
                    <Text style={styles.suggestionText}>{name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {ruleOutQuery.trim().length > 0 && suggestions.length === 0 && (
              <Text style={styles.noMatch}>
                Nothing matches "{ruleOutQuery.trim()}" — say it in the box below instead.
              </Text>
            )}

            {ruledOut.length > 0 && (
              <View style={styles.chips}>
                {ruledOut.map((name) => (
                  <Pressable
                    key={name}
                    onPress={() => setRuledOut((prev) => prev.filter((n) => n !== name))}
                    style={styles.chip}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${name}`}
                  >
                    <Text style={styles.chipText}>{name}</Text>
                    <Text style={styles.chipX}>×</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.subLabel}>Anywhere else?</Text>
            <TextInput
              style={styles.input}
              value={ruleOutText}
              onChangeText={setRuleOutText}
              placeholder="e.g. anywhere in east London"
              placeholderTextColor={colors.inkGhost}
              multiline
            />
          </View>
        </Question>

        <View style={styles.divider} />

        <Question
          title="Would you live in Zone 1?"
          note="Central London — pricier, but you're in the middle of it."
        >
          <View style={styles.row}>
            <Choice label="Yes" selected={zone1 === true} onPress={() => setZone1(true)} />
            <Choice label="No" selected={zone1 === false} onPress={() => setZone1(false)} />
          </View>
        </Question>

        {/* Zone 1 is required; the rule-outs are not. An unanswered Zone 1
            filters nothing (lib/ranking/zones.ts), which is the right
            behaviour for a question never reached — but this one is on
            screen, so leaving it blank would be an answer nobody gave. */}
        <Pressable
          onPress={() => { if (zone1 !== null) submit(); }}
          disabled={zone1 === null}
          style={[styles.primary, zone1 === null && styles.primaryOff]}
          accessibilityRole="button"
          accessibilityState={{ disabled: zone1 === null }}
        >
          <Text style={[styles.primaryText, zone1 === null && styles.primaryTextOff]}>
            {zone1 === null ? 'Answer Zone 1 to continue' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Schools ──────────────────────────────────────────────────────────
  if (step.id === 'schools') {
    function answerSchools(value: 'no' | 'primary' | 'secondary' | 'both') {
      // One tap sets both fields: whether schools matter at all, and which
      // phase. They are separate columns because they answer separate
      // questions downstream, but they are a single decision to the person
      // answering, and asking twice would cost two taps to say "no".
      updateLifestyle(
        value === 'no'
          ? { schoolsPriority: 'no' }
          : { schoolsPriority: 'now', schoolPhase: value },
      );
      advance();
    }
    return (
      <Question title={step.question}>
        <View style={styles.row}>
          <Choice label="Not a factor" onPress={() => answerSchools('no')} />
          <Choice label="Primary" onPress={() => answerSchools('primary')} />
          <Choice label="Secondary" onPress={() => answerSchools('secondary')} />
          <Choice label="Both" onPress={() => answerSchools('both')} />
        </View>
      </Question>
    );
  }

  // ── 4. Where do most of your people live? ────────────────────────────
  function answerCircle(dir: Compass) {
    updateLifestyle({ socialCircle: dir });
    advance();
  }
  return (
    <Question title={step.question} note="Being near your friends and family counts for a lot.">
      <View style={styles.row}>
        {(['N', 'E', 'S', 'W'] as Compass[]).map((d) => (
          <Choice key={d} label={d} onPress={() => answerCircle(d)} />
        ))}
      </View>
    </Question>
  );
}

function Question({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.question}>
      <Text style={styles.questionText}>{title}</Text>
      {note && <Text style={styles.note}>{note}</Text>}
      <View style={styles.answers}>{children}</View>
    </View>
  );
}

/** `selected` is only passed where a choice is held rather than acted on
 *  immediately — the Zone 1 pair on the rule-out screen, which waits for
 *  Continue. Everywhere else a tap advances, so there is nothing to show. */
function Choice({
  label, onPress, selected,
}: { label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable
      style={[styles.choice, selected && styles.choiceOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** The one screen that carries two questions and its own Continue. */
  page: { gap: spacing.lg },
  divider: { height: 1, backgroundColor: colors.rule },
  question: { gap: spacing.sm },
  questionText: { ...type.display, fontSize: 24, color: colors.ink, lineHeight: 30 },
  note: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkLt, lineHeight: 20 },
  answers: { marginTop: spacing.md },

  stack: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },

  primary: {
    backgroundColor: colors.teal,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  /** Outlined rather than dimmed, so it reads as "one more answer" rather
   *  than as a button that has stopped working. */
  primaryOff: { backgroundColor: colors.creamMid, borderWidth: 1, borderColor: colors.rule },
  primaryTextOff: { color: colors.inkLt },

  choice: {
    flexGrow: 1,
    minWidth: 72,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  choiceOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  choiceText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  choiceTextOn: { color: colors.white },

  subLabel: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.inkMid, marginTop: spacing.xs },

  /** The autocomplete's results, attached to the box above them. */
  suggestions: {
    borderWidth: 1,
    borderColor: colors.tealLine,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  suggestion: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  suggestionText: { ...type.body, fontSize: 15, color: colors.ink },
  noMatch: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkLt, lineHeight: 18 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.tealSoft,
    borderWidth: 1, borderColor: colors.tealLine,
    borderRadius: radius.pill,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.teal },
  chipX: { fontFamily: fonts.bold, fontSize: 15, color: colors.teal, lineHeight: 16 },

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
});
