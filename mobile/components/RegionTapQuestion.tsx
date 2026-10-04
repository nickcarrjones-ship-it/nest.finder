import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import type { DeferredClarification } from '../store/agentChatStore';
import { MAX_REGION_PICKS } from '../lib/regions';
import { matchRuleOutOptions } from '../lib/ruleOutOptions';
import { resolveAreaName } from '../lib/ranking/anchor';

interface Props {
  clarification: DeferredClarification;
  onAnswered: () => void;
  compact?: boolean;
}

/**
 * "You said South East - which areas there?" (Nick, 2026-10-04).
 *
 * Max answered "where are you looking?" with a compass point, which the
 * app cannot match to anything. This turns it into buttons of the
 * neighbourhoods a Londoner would name there, and they pick their
 * favourite three. At least one, at most three: no "all of it" button,
 * because that is the answer that needed pinning down in the first place.
 *
 * Their favourite not on the list? They can type it. Anywhere the app can
 * put on the map is accepted, and it counts as one of the three.
 */
export function RegionTapQuestion({ clarification, onAnswered, compact }: Props) {
  const resolveAreaCard = useProfileStore((s) => s.resolveAreaCard);
  const max = clarification.max ?? MAX_REGION_PICKS;
  const [picked, setPicked] = useState<string[]>([]);
  /** Places they typed in, shown as buttons after the region's own. */
  const [added, setAdded] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const full = picked.length >= max;
  const options = [...clarification.options, ...added];

  function toggle(name: string) {
    setPicked((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      return prev.length >= max ? prev : [...prev, name];
    });
  }

  function add(name: string) {
    if (!options.includes(name)) setAdded((prev) => [...prev, name]);
    setPicked((prev) => (prev.includes(name) || prev.length >= max ? prev : [...prev, name]));
    setQuery('');
  }

  // Station names first, then what they typed as they typed it - but only
  // if it is somewhere the app can actually put on the map. A loved area
  // that resolves to nothing would be a favourite nothing can be found
  // near.
  const typed = query.trim();
  const suggestions = typed ? matchRuleOutOptions(typed, options, 4) : [];
  const typedOk =
    typed.length >= 3 &&
    !suggestions.some((s) => s.toLowerCase() === typed.toLowerCase()) &&
    !options.some((s) => s.toLowerCase() === typed.toLowerCase()) &&
    resolveAreaName(typed) !== null;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.question, compact && styles.questionCompact]}>
        You said “{clarification.stem}” - which areas there?
      </Text>
      <Text style={styles.note}>
        Pick your favourite {max}. Everything we suggest starts from these.
      </Text>

      <View style={styles.options}>
        {options.map((name) => {
          const on = picked.includes(name);
          const off = !on && full;
          return (
            <Pressable
              key={name}
              style={[styles.option, on && styles.optionOn, off && styles.optionOff]}
              onPress={() => toggle(name)}
              disabled={off}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: off }}
            >
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{name}</Text>
            </Pressable>
          );
        })}
      </View>

      {!full && (
        <View style={styles.typeWrap}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Not listed? Type it here"
            placeholderTextColor={colors.inkGhost}
            autoCorrect={false}
            autoCapitalize="words"
          />
          {(suggestions.length > 0 || typedOk) && (
            <View style={styles.suggestions}>
              {suggestions.map((name) => (
                <Pressable key={name} onPress={() => add(name)} style={styles.suggestion} accessibilityRole="button">
                  <Text style={styles.suggestionText}>{name}</Text>
                </Pressable>
              ))}
              {typedOk && (
                <Pressable onPress={() => add(titleCase(typed))} style={styles.suggestion} accessibilityRole="button">
                  <Text style={styles.suggestionText}>Add “{titleCase(typed)}”</Text>
                </Pressable>
              )}
            </View>
          )}
          {typed.length >= 3 && suggestions.length === 0 && !typedOk && (
            <Text style={styles.noMatch}>We can’t find “{typed}” on the map yet.</Text>
          )}
        </View>
      )}

      <Pressable
        style={[styles.primary, picked.length === 0 && styles.primaryOff]}
        onPress={() => {
          if (picked.length === 0) return;
          resolveAreaCard(clarification.stem, picked);
          onAnswered();
        }}
        disabled={picked.length === 0}
        accessibilityRole="button"
        accessibilityState={{ disabled: picked.length === 0 }}
      >
        <Text style={[styles.primaryText, picked.length === 0 && styles.primaryTextOff]}>
          {picked.length === 0
            ? 'Pick at least one to continue'
            : full
              ? 'Continue'
              : `Continue with ${picked.length}`}
        </Text>
      </Pressable>
    </View>
  );
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  wrapCompact: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.tealLine,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  question: { ...type.display, fontSize: 24, lineHeight: 30, color: colors.ink },
  questionCompact: { fontSize: 17, lineHeight: 23 },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkLt },

  options: { marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  optionOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  /** Three picked: the rest step back rather than vanish, so they can
   *  still see what they would be swapping. */
  optionOff: { opacity: 0.4 },
  optionText: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink },
  optionTextOn: { color: colors.white },

  typeWrap: { marginTop: spacing.sm, gap: spacing.sm },
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

  primary: {
    marginTop: spacing.md,
    backgroundColor: colors.teal,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryOff: { backgroundColor: colors.creamMid, borderWidth: 1, borderColor: colors.rule },
  primaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  primaryTextOff: { color: colors.inkLt },
});
