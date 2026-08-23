import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

export interface LayerState {
  region: boolean;
  stations: boolean;
  workplaces: boolean;
}

interface Props {
  value: LayerState;
  onChange: (next: LayerState) => void;
}

const ITEMS: { key: keyof LayerState; label: string; glyph: string }[] = [
  { key: 'region', label: 'Area', glyph: '◍' },
  { key: 'stations', label: 'Stations', glyph: '●' },
  { key: 'workplaces', label: 'Work', glyph: '◆' },
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
export function LayerToggles({ value, onChange }: Props) {
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
  chipOn: { backgroundColor: colors.ink },
  glyph: { fontSize: 12, color: colors.inkGhost },
  glyphOn: { color: colors.copper },
  label: { fontSize: 12.5, fontWeight: '600', color: colors.inkLt },
  labelOn: { color: colors.cream },
});
