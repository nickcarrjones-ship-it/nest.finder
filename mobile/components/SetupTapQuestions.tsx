import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import { TAP_STEPS } from '../lib/setupSteps';
import type { AreaCards, Lifestyle } from '../lib/types';

type River = NonNullable<Lifestyle['riverSide']>;
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
  const [ruleOutOpen, setRuleOutOpen] = useState(false);
  const [ruleOutText, setRuleOutText] = useState('');

  const step = TAP_STEPS[index];
  if (!step) return null;

  function advance() {
    if (index >= TAP_STEPS.length - 1) onFinished();
    else onAnswered();
  }

  // ── 1. Anywhere you'd rule out? ──────────────────────────────────────
  if (step.id === 'ruleOut') {
    function submitRuleOut() {
      const named = ruleOutText
        .split(/[,\n]|\band\b/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (named.length) {
        // Same shape the Agent writes, so nothing downstream has to know
        // which route an area came in by.
        const patch: AreaCards = {};
        for (const name of named) patch[name] = 'hate';
        updateAreaCards(patch);
      }
      advance();
    }

    return (
      <Question title={step.question}>
        {ruleOutOpen ? (
          <View style={styles.stack}>
            <TextInput
              style={styles.input}
              value={ruleOutText}
              onChangeText={setRuleOutText}
              placeholder="e.g. Croydon, Barking"
              placeholderTextColor={colors.inkGhost}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submitRuleOut}
            />
            <Primary label="Done" onPress={submitRuleOut} />
          </View>
        ) : (
          <View style={styles.stack}>
            {/* The common answer is "nowhere", so it costs one tap. The
                honest exception still has a way in — a pure button set
                would have made a real answer impossible to give. */}
            <Primary label="Nowhere in particular" onPress={advance} />
            <Secondary label="Yes — let me name a few" onPress={() => setRuleOutOpen(true)} />
          </View>
        )}
      </Question>
    );
  }

  // ── 2. Would you live in Zone 1? ─────────────────────────────────────
  if (step.id === 'zone1') {
    function answerZone1(ok: boolean) {
      updateLifestyle({ zone1Ok: ok });
      advance();
    }
    return (
      <Question title={step.question} note="Central London — pricier, but you're in the middle of it.">
        <View style={styles.row}>
          <Choice label="Yes" onPress={() => answerZone1(true)} />
          <Choice label="No" onPress={() => answerZone1(false)} />
        </View>
      </Question>
    );
  }

  // ── 3. North or south of the river? ──────────────────────────────────
  if (step.id === 'river') {
    function answerRiver(side: River) {
      updateLifestyle({ riverSide: side });
      advance();
    }
    return (
      <Question title={step.question}>
        <View style={styles.row}>
          <Choice label="North" onPress={() => answerRiver('north')} />
          <Choice label="South" onPress={() => answerRiver('south')} />
          <Choice label="Either" onPress={() => answerRiver('either')} />
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

function Primary({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.primary} onPress={onPress} accessibilityRole="button">
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function Secondary({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.secondary} onPress={onPress} accessibilityRole="button">
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

function Choice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.choice} onPress={onPress} accessibilityRole="button">
      <Text style={styles.choiceText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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

  secondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.inkMid },

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
  choiceText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },

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
