import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

export interface LayerState {
  /** The areas they named themselves — rose numbered bubbles on the map,
   *  see PickBubble's tone prop. */
  anchors: boolean;
  picks: boolean;
}

interface Props {
  value: LayerState;
  onChange: (next: LayerState) => void;
  /** Whether the layer chips are showing, or just the filter button. */
  open: boolean;
  onToggleOpen: () => void;
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

/**
 * The reachable-commute region has no toggle: unlike these, which are
 * genuinely optional supplementary layers, the region fill IS the answer
 * this whole screen exists to give.
 *
 * WORKPLACES lost theirs too (Nick, 2026-09-01). Two pins marking where the
 * household works are the premise of every other thing on this map — the
 * region is drawn from them — so "hide the reason the shape is that shape"
 * was never a real thing to want. They now always show.
 */
const ITEMS: { key: keyof LayerState; label: string; glyph: string }[] = [
  // Named as the person would say them rather than as the code does.
  // "Yours" and "Picks" were shorthand that only made sense next to each
  // other; these stand on their own.
  { key: 'anchors', label: 'Your areas', glyph: '●' },
  { key: 'picks', label: 'Maloca picks', glyph: '★' },
];

/**
 * Turning layers off matters as much as drawing them — browsing areas is a
 * different task from comparing three places you have already seen.
 *
 * COLLAPSED BY DEFAULT behind a filter button, the same move the commute
 * slider made the day before. Two named pills sat permanently across the
 * map for a choice almost nobody changes twice, and they were the thing
 * putting dead space between the picks strip and the bottom of the screen
 * (Nick, 2026-09-01).
 */
export function LayerToggles({ value, onChange, open, onToggleOpen, trailing }: Props) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onToggleOpen}
        style={[styles.chip, styles.filterChip, open && styles.chipOn]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Map layers"
        accessibilityHint={open ? 'Hides the layer switches' : 'Shows the layer switches'}
      >
        <FilterMark color={open ? colors.teal : colors.inkGhost} />
      </Pressable>

      {open &&
        ITEMS.map((item) => {
          const on = value[item.key];
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange({ ...value, [item.key]: !on })}
              style={[styles.chip, styles.gap, on && styles.chipOn]}
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

/**
 * Three stacked bars, narrowing — the ordinary filter mark. Drawn rather
 * than typed for the reason CommuteChip's clock gives: the Unicode options
 * are emoji, which arrive full-colour and off-palette beside monochrome
 * glyphs, and this takes the chip's colour like they do.
 */
function FilterMark({ color }: { color: string }) {
  return (
    <View style={styles.filterMark}>
      <View style={[styles.bar1, { backgroundColor: color }]} />
      <View style={[styles.bar2, { backgroundColor: color }]} />
      <View style={[styles.bar3, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
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
  // Square-ish, since it holds a mark and no word.
  filterChip: { paddingHorizontal: 9 },
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

  filterMark: { width: 14, height: 14, justifyContent: 'center', gap: 2.5 },
  bar1: { height: 1.8, width: 14, borderRadius: 1 },
  bar2: { height: 1.8, width: 10, borderRadius: 1, marginLeft: 2 },
  bar3: { height: 1.8, width: 6, borderRadius: 1, marginLeft: 4 },
});
