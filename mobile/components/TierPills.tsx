import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { TIER_LABEL, type DraftTier, type Tier } from '../lib/verdicts';

interface Props {
  value: DraftTier;
  onChange: (tier: Tier) => void;
  /** Whose verdict this is. Named above the pills, in full ink — see below. */
  name?: string;
}

const ORDER: Tier[] = ['not_for_us', 'maybe', 'loved_it'];

/**
 * One person's verdict on one area: three pills, tap one.
 *
 * Replaces the 0-10 drag slider (Nick, 2026-09-02 — "too many options...
 * it doesn't really help"). The colours and the arrows are carried over
 * from the slider's end captions, which were the part he liked: red and a
 * left arrow at one end, green and a right arrow at the other. What has
 * changed is that they are now the control rather than a legend for one.
 *
 * Two things kept from the slider, both from docs/learning-loop.md:
 *
 *  1. **Nothing is pre-selected.** A default records an opinion nobody
 *     gave. `value` is null until someone actually presses a pill.
 *  2. **One tap is the whole ask.** The "why" chips underneath
 *     (VerdictBlock) stay optional, and only at the two ends.
 *
 * WHOSE VERDICT THIS IS, SAID ONCE AND IN FULL INK. It used to be said
 * twice and faintly — PickDetailCard printed the member's name in inkMid
 * above this block, and the slider then printed "Harriet's score" again in
 * inkLt underneath it. Two pale labels competing to answer the same
 * question is most of why it was hard to tell whose score was whose
 * (Nick, 2026-09-02). One label, `colors.ink`, semibold.
 */
export function TierPills({ value, onChange, name }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.who}>{name ? `${name}’s verdict` : 'Your verdict'}</Text>

      <View style={styles.row}>
        {ORDER.map((tier) => {
          const on = value === tier;
          return (
            <Pressable
              key={tier}
              onPress={() => onChange(tier)}
              style={[styles.pill, PILL[tier], on && PILL_ON[tier]]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={TIER_LABEL[tier].replace(/[←→]/g, '').trim()}
            >
              <Text
                style={[styles.label, LABEL[tier], on && styles.labelOn]}
                numberOfLines={1}
                // The three labels are different lengths in equal-width
                // pills, so the longest ("← Not for us") is allowed to
                // shrink a touch rather than truncate to "← Not for…".
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {TIER_LABEL[tier]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Red, amber, green — the app's existing semantic trio (the same one
 * lib/ratingTone.ts uses for school judgements), not the brand teal.
 * Teal is the accent on every button and active state in the app, so a
 * teal "Maybe" would read as the recommended answer rather than the
 * middle one.
 */
const PILL = StyleSheet.create({
  not_for_us: { backgroundColor: colors.redBg, borderColor: colors.redLine },
  maybe: { backgroundColor: colors.amberBg, borderColor: colors.creamDk },
  loved_it: { backgroundColor: colors.greenBg, borderColor: colors.greenLine },
});

const PILL_ON = StyleSheet.create({
  not_for_us: { backgroundColor: colors.red, borderColor: colors.red },
  maybe: { backgroundColor: colors.amber, borderColor: colors.amber },
  loved_it: { backgroundColor: colors.green, borderColor: colors.green },
});

const LABEL = StyleSheet.create({
  not_for_us: { color: colors.red },
  maybe: { color: colors.inkMid },
  loved_it: { color: colors.green },
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  who: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  row: { flexDirection: 'row', gap: 6 },
  pill: {
    flex: 1,
    // 44pt, the same thumb-sized target the setup questions use — these
    // are pressed on a pavement, one-handed, not at a desk.
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { fontFamily: fonts.semibold, fontSize: 12.5 },
  labelOn: { color: colors.white },
});

/**
 * The same verdict, read back rather than pressed — a shortlist row, a
 * summary. Small, unpressable, and deliberately the same three colours, so
 * a tier means one thing everywhere in the app.
 */
export function TierBadge({ tier, name }: { tier: Tier; name?: string }) {
  return (
    <View style={[badge.wrap, PILL[tier]]}>
      {name ? <Text style={[badge.name, LABEL[tier]]}>{name}</Text> : null}
      <Text style={[badge.text, LABEL[tier]]} numberOfLines={1}>
        {TIER_LABEL[tier].replace(/[←→]/g, '').trim()}
      </Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  // The name is the point of this badge — it is what answers "whose is
  // this" on a card showing two or three of them side by side — so it
  // carries the weight and the verdict follows it.
  name: { fontFamily: fonts.bold, fontSize: 11.5 },
  text: { fontFamily: fonts.regular, fontSize: 11.5 },
});
