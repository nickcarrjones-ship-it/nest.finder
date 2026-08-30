import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import type { DeferredClarification } from '../store/agentChatStore';

interface Props {
  clarification: DeferredClarification;
  onAnswered: () => void;
}

/**
 * "Which Clapham did you mean?" — asked at the END of setup, as taps.
 *
 * This used to interrupt the conversation the moment someone typed an
 * ambiguous name, costing a whole extra turn before question two. Saved up
 * and asked here instead (Nick, 2026-08-30), which is both faster and a
 * better question: the answer was always a choice from a short list of real
 * areas, and a list of real areas is a set of buttons, not a typed reply.
 *
 * It genuinely has to be asked at some point. From Clapham Common the
 * engine suggests Highbury and Kennington; from Clapham Junction it
 * suggests Wandsworth Town and Balham. Picking one silently would decide
 * something the user should decide.
 *
 * Multi-select, because "both" and "the whole area" are real answers — a
 * lot of people mean Clapham generally, and forcing one would record
 * something they did not say.
 */
export function ClarifyTapQuestion({ clarification, onAnswered }: Props) {
  const resolveAreaCard = useProfileStore((s) => s.resolveAreaCard);
  const [picked, setPicked] = useState<string[]>([]);

  function toggle(name: string) {
    setPicked((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function confirm(names: string[]) {
    resolveAreaCard(clarification.stem, names);
    onAnswered();
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.question}>
        When you said “{clarification.stem}” — which part did you mean?
      </Text>
      <Text style={styles.note}>
        They’re further apart than they sound, so this changes what we suggest. Pick as many as fit.
      </Text>

      <View style={styles.options}>
        {clarification.options.map((name) => {
          const on = picked.includes(name);
          return (
            <Pressable
              key={name}
              style={[styles.option, on && styles.optionOn]}
              onPress={() => toggle(name)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{name}</Text>
            </Pressable>
          );
        })}
      </View>

      {picked.length > 0 ? (
        <Pressable style={styles.primary} onPress={() => confirm(picked)} accessibilityRole="button">
          <Text style={styles.primaryText}>
            {picked.length === 1 ? 'That’s the one' : `Those ${picked.length}`}
          </Text>
        </Pressable>
      ) : (
        // Taking all of them is a real answer, not a skip — plenty of people
        // mean the area at large. It records every option rather than
        // dropping the name, so the anchor survives either way.
        <Pressable
          style={styles.secondary}
          onPress={() => confirm(clarification.options)}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>All of it, really</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  question: { ...type.display, fontSize: 24, lineHeight: 30, color: colors.ink },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkLt },
  options: { marginTop: spacing.md, gap: spacing.sm },
  option: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: spacing.md,
  },
  optionOn: { backgroundColor: colors.tealSoft, borderColor: colors.teal },
  optionText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  optionTextOn: { color: colors.teal },
  primary: {
    marginTop: spacing.sm,
    backgroundColor: colors.teal,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  secondary: {
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.inkMid },
});
