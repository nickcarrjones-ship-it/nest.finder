import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { traitsSentence } from '../lib/similarity/dimensionLabels';
import type { AnchorEvidence } from '../lib/ranking/anchor';

interface Props {
  area: string;
  why: AnchorEvidence;
}

/**
 * Why this area is on the list — the evidence, one tap in.
 *
 * The pill outside says "like Clapham Common" and stops there, on purpose:
 * the Agent's output should sound like a person and not a dossier, so the
 * numbers live here rather than on the glance-height strip.
 *
 * Everything shown traces to a measurement the engine actually compared.
 * The traits are the dimensions this area scored CLOSEST to the anchor on
 * — not the ones we would have liked it to match — which is why they are
 * sometimes unglamorous. Saying "how big the homes are" when that is what
 * the data says beats inventing something more flattering.
 */
export function WhyThisArea({ area, why }: Props) {
  const traits = traitsSentence(why.sharedTraits);
  const percent = Math.round(why.score * 100);

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>WHY {area.toUpperCase()}</Text>

      <Text style={styles.lead}>
        It&rsquo;s the closest match we found to{' '}
        <Text style={styles.anchor}>{why.anchor}</Text>, which you said you love.
      </Text>

      {traits !== '' && (
        <Text style={styles.traits}>
          They&rsquo;re most alike on {traits}.
        </Text>
      )}

      <View style={styles.factRow}>
        <Fact label="Match" value={`${percent}%`} />
        {why.distanceKm > 0 && <Fact label="Away" value={`${why.distanceKm}km`} />}
        {/* The HONEST confidence — how much data stood behind the
            comparison, not how sure the model sounded. A low one is worth
            showing: it is the difference between a weak match and a
            confident one, and hiding it would be the dishonest choice. */}
        <Fact label="Data" value={why.confidence} />
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.anchorRoseSoft,
    borderWidth: 1,
    borderColor: colors.anchorRoseLine,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 5,
    marginBottom: spacing.md,
  },
  eyebrow: { ...type.label, color: colors.anchorRose, marginBottom: 1 },
  lead: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.ink },
  anchor: { fontFamily: fonts.semibold, color: colors.anchorRose },
  traits: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.inkMid },
  factRow: { flexDirection: 'row', gap: spacing.lg, marginTop: 4 },
  fact: { gap: 0 },
  factLabel: { ...type.label, fontSize: 9, color: colors.inkGhost },
  factValue: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
});
