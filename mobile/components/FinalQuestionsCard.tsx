import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import type { Lifestyle } from '../lib/types';

/**
 * Questions six and seven, which the app asks rather than the Agent.
 *
 * Neither deserves a spoken answer — "north or south?" is one tap, and
 * talking through the compass is slower than pointing at it — so the
 * conversation prompt explicitly forbids the model asking them
 * (lib/agentChat/prompt.ts) and this collects them instead. That division
 * is load-bearing: if this card is ever removed, those two fields stop
 * being collected at all, because nothing else asks.
 */

type River = NonNullable<Lifestyle['riverSide']>;
type Compass = NonNullable<Lifestyle['socialCircle']>;

const RIVER: { value: River; label: string }[] = [
  { value: 'north', label: 'North' },
  { value: 'south', label: 'South' },
  { value: 'either', label: 'Either' },
];

const COMPASS: { value: Compass; label: string }[] = [
  { value: 'N', label: 'N' },
  { value: 'E', label: 'E' },
  { value: 'S', label: 'S' },
  { value: 'W', label: 'W' },
];

export function FinalQuestionsCard({ onDone }: { onDone: () => void }) {
  const updateLifestyle = useProfileStore((s) => s.updateLifestyle);
  const [river, setRiver] = useState<River | null>(null);
  const [circle, setCircle] = useState<Compass | null>(null);

  function finish() {
    // Only write what they actually answered — an unanswered question must
    // stay undefined rather than defaulting, since the ranking prompt reads
    // every present field as a real stated preference.
    const patch: Partial<Lifestyle> = {};
    if (river) patch.riverSide = river;
    if (circle) patch.socialCircle = circle;
    if (Object.keys(patch).length > 0) updateLifestyle(patch);
    onDone();
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>A final few questions</Text>
        <Text style={styles.sub}>No need to talk for these two — just tap.</Text>
      </View>

      <View style={styles.question}>
        <Text style={styles.questionText}>North or south of the river?</Text>
        <View style={styles.pillRow}>
          {RIVER.map((opt) => (
            <Pill
              key={opt.value}
              label={opt.label}
              selected={river === opt.value}
              onPress={() => setRiver(opt.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.question}>
        <Text style={styles.questionText}>Where are most of your friends and family?</Text>
        <View style={styles.pillRow}>
          {COMPASS.map((opt) => (
            <Pill
              key={opt.value}
              label={opt.label}
              selected={circle === opt.value}
              onPress={() => setCircle(opt.value)}
            />
          ))}
        </View>
      </View>

      <Pressable onPress={finish} style={styles.doneBtn} accessibilityRole="button">
        <Text style={styles.doneText}>See my areas</Text>
      </Pressable>
    </View>
  );
}

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, selected && styles.pillOn]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.pillText, selected && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xl - 2, paddingBottom: spacing.sm },
  header: { gap: 5 },
  eyebrow: { ...type.label, fontSize: 10, letterSpacing: 1.4, color: colors.teal, textTransform: 'uppercase' },
  sub: { ...type.body, fontSize: 13, lineHeight: 18, color: colors.inkLt },
  question: { gap: 11 },
  questionText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  pillRow: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.white,
  },
  pillOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  pillText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkMid },
  pillTextOn: { color: colors.white },
  doneBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    paddingVertical: 17,
    alignItems: 'center',
  },
  doneText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.cream,
    textTransform: 'uppercase',
  },
});
