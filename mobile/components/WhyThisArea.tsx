import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { matchStrength, STRENGTH_LABEL } from '../lib/ranking/matchStrength';
import type { AnchorEvidence } from '../lib/ranking/anchor';

interface Props {
  why: AnchorEvidence;
}

/**
 * Where this suggestion came from — the provenance, under the description.
 *
 * It used to lead with two sentences of its own: "It's the closest match we
 * found to Clapham Common, which you said you love", then "They're most
 * alike on how big the homes are and how much green space is nearby". Both
 * had to go (Nick, 2026-09-01). The first said exactly what the model's own
 * sentence below it said, and the second was a readout of dimension names —
 * accurate, and robotic in a way the rest of the app is not.
 *
 * The shared traits did not disappear; they moved into the PROMPT
 * (lib/ranking/prompt.ts), so the model writes them as a sentence a person
 * would say. What is left here is the part prose cannot carry honestly: how
 * close the match actually is, which area it came from, and how much data
 * stood behind the comparison.
 */
export function WhyThisArea({ why }: Props) {
  const strength = matchStrength(why.score);

  return (
    <View style={styles.wrap}>
      <View style={[styles.badge, BADGE[strength]]}>
        <Text style={[styles.badgeText, BADGE_TEXT[strength]]}>
          {STRENGTH_LABEL[strength]}
        </Text>
      </View>

      <Text style={styles.meta} numberOfLines={2}>
        like <Text style={styles.anchor}>{why.anchor}</Text>
        {why.distanceKm > 0 && ` · ${why.distanceKm}km away`}
        {/* The HONEST confidence — how much data stood behind the
            comparison, not how sure the model sounded. Worth showing: it is
            the difference between a weak match and one we simply know less
            about, and hiding it would be the dishonest choice. */}
        {` · ${why.confidence} data`}
      </Text>
    </View>
  );
}

/**
 * Green, amber, quiet. Deliberately the same three the app already uses for
 * area verdicts, rather than a new scale nobody has seen — and never the
 * red, because nothing on this list is a warning.
 */
const BADGE = StyleSheet.create({
  strong: { backgroundColor: colors.greenBg, borderColor: colors.greenLine },
  potential: { backgroundColor: colors.amberBg, borderColor: colors.creamDk },
  loose: { backgroundColor: colors.cream, borderColor: colors.rule },
});

const BADGE_TEXT = StyleSheet.create({
  strong: { color: colors.green },
  potential: { color: colors.amber },
  loose: { color: colors.inkLt },
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  badgeText: { ...type.label, fontSize: 10 },
  meta: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.inkLt,
  },
  anchor: { fontFamily: fonts.semibold, color: colors.anchorRose },
});
