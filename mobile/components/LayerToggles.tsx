import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

export interface LayerState {
  /** The areas they named themselves — see AnchorPin. */
  anchors: boolean;
  workplaces: boolean;
  picks: boolean;
}

interface Props {
  value: LayerState;
  onChange: (next: LayerState) => void;
  /**
   * Something that isn't a layer, sharing the bar.
   *
   * The commute chip goes here. It belongs in this bar visually — it is the
   * same size, in the same row, reached by the same thumb — but it is a
   * control that opens a slider, not a switch that draws something, so it
   * stays out of LayerState and comes in behind a hairline instead.
   */
  trailing?: ReactNode;
}

// The reachable-commute region ("Area"/"Zone" — the naming argument itself
// turned out to be the wrong question, 2026-08-23) has no toggle: unlike
// these three, which are all genuinely optional supplementary layers with
// a real "I don't need this right now" moment, the region fill IS the
// answer this whole screen exists to give. Nothing else on the map earns
// switching it off, so there is nothing to name in a toggle chip either.
const ITEMS: { key: keyof LayerState; label: string; glyph: string }[] = [
  { key: 'anchors', label: 'Yours', glyph: '●' },
  { key: 'workplaces', label: 'Work', glyph: '◆' },
  { key: 'picks', label: 'Picks', glyph: '★' },
];

/**
 * Turning layers off matters as much as drawing them. With the region, the
 * station dots, the workplace pins and eventually property pins all competing,
 * no single arrangement suits every moment — browsing areas is a different
 * task from comparing three flats you have already seen.
 *
 * Deliberately compact and thumb-height rather than a settings screen: this
 * gets used while looking at the map, not before.
 */
export function LayerToggles({ value, onChange, trailing }: Props) {
  return (
    <View style={styles.bar}>
      {ITEMS.map((item, i) => {
        const on = value[item.key];
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange({ ...value, [item.key]: !on })}
            style={[styles.chip, on && styles.chipOn, i > 0 && styles.gap]}
            hitSlop={6}
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${item.label} layer`}
          >
            <Text style={[styles.glyph, on && styles.glyphOn]}>{item.glyph}</Text>
            <Text style={[styles.label, on && styles.labelOn]}>{item.label}</Text>
          </Pressable>
        );
      })}
      {trailing && (
        <>
          <View style={styles.divider} />
          {trailing}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    padding: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
  },
  gap: { marginLeft: 2 },
  // Says "this one is a different kind of thing" without a second pill and
  // a second shadow floating next to the first.
  divider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: spacing.xs,
    marginVertical: 4,
    backgroundColor: colors.rule,
  },
  chipOn: { backgroundColor: colors.ink },
  glyph: { fontSize: 12, color: colors.inkGhost },
  glyphOn: { color: colors.teal },
  label: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.inkLt },
  labelOn: { color: colors.cream },
});
