import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import type { AreaCards, Lifestyle } from '../lib/types';

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
  const lifestyle = useProfileStore((s) => s.profile.lifestyle);
  const areaCards = useProfileStore((s) => s.profile.areaCards);
  const summary = summarise(lifestyle, areaCards);
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

      {summary.length > 0 && (
        <View style={styles.recap}>
          <Text style={styles.recapLabel}>Here's what I've got</Text>
          {summary.map((line) => (
            <View key={line} style={styles.recapRow}>
              <View style={styles.recapDot} />
              <Text style={styles.recapText}>{line}</Text>
            </View>
          ))}
          <Text style={styles.recapNote}>
            Anything wrong? Close this and tell the Agent — it'll update.
          </Text>
        </View>
      )}

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

/**
 * A read-back of what the conversation actually captured, shown before the
 * last two questions (Nick's idea, 2026-08-27). Answering five questions
 * out loud and being told nothing about what landed is unnerving — and
 * speech recognition mishears, so this is the moment to catch it.
 */
function summarise(lifestyle: Lifestyle | undefined, areaCards: AreaCards | undefined): string[] {
  const lines: string[] = [];
  const loves = Object.entries(areaCards ?? {}).filter(([, v]) => v === 'love').map(([k]) => k);
  const hates = Object.entries(areaCards ?? {}).filter(([, v]) => v === 'hate').map(([k]) => k);
  if (loves.length) lines.push(`You like ${list(loves)}`);
  if (hates.length) lines.push(`Not ${list(hates)}`);
  if (lifestyle?.zone1Ok === true) lines.push('Zone 1 is fine');
  if (lifestyle?.zone1Ok === false) lines.push('Not Zone 1');
  if (lifestyle?.streetVibe === 'buzzy') lines.push('You want somewhere with a bit of life to it');
  if (lifestyle?.streetVibe === 'quiet') lines.push('You want quiet residential streets');
  if (lifestyle?.streetVibe === 'village') lines.push('You want a village feel');
  if (lifestyle?.nightsOut === 'frequent') lines.push('Out most nights');
  if (lifestyle?.nightsOut === 'regular') lines.push('Out once or twice a week');
  if (lifestyle?.nightsOut === 'rarely') lines.push('Nights in more than nights out');
  if (lifestyle?.greenSpace === 'essential') lines.push('Green space matters');
  if (lifestyle?.schoolsPriority === 'now') lines.push('Schools matter now');
  return lines;
}

/** "a, b and c" — reads back aloud better than a comma list. */
function list(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const styles = StyleSheet.create({
  card: { gap: spacing.xl - 2, paddingBottom: spacing.sm },
  header: { gap: 5 },
  recap: {
    gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.tealSoft, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.tealLine,
  },
  recapLabel: { ...type.label, fontSize: 10, letterSpacing: 1.4, color: colors.teal, textTransform: 'uppercase' },
  recapRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  recapDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.teal, marginTop: 7 },
  recapText: { ...type.body, flex: 1, fontSize: 14, lineHeight: 20, color: colors.inkMid },
  recapNote: { fontFamily: fonts.italic, fontSize: 12.5, lineHeight: 17, color: colors.inkLt },
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
