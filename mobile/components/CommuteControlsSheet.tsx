import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './ui/BottomSheet';
import { colors, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import { COMMUTE_OPTIONS_MINS, WALK_OPTIONS_KM } from '../lib/commuteSettings';

interface CommuteControlsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Mobile equivalent of the web app's header command bar (#commute-max-shared
 * / #walk-shared selects, map.html:237-242) — picking a new value updates
 * the shared profile, which useReachableAreas picks up automatically and
 * the map's circles redraw live. No "Apply" step, same as the web version.
 */
export function CommuteControlsSheet({ visible, onClose }: CommuteControlsSheetProps) {
  const maxCommuteMins = useProfileStore((s) => s.profile.maxCommuteMins);
  const walkHomeKm = useProfileStore((s) => s.profile.walkHomeKm);
  const updateCommuteSettings = useProfileStore((s) => s.updateCommuteSettings);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Commute settings">
      <Text style={styles.label}>Max commute</Text>
      <View style={styles.chipRow}>
        {COMMUTE_OPTIONS_MINS.map((mins) => (
          <Chip
            key={mins}
            label={`${mins} min`}
            selected={maxCommuteMins === mins}
            onPress={() => updateCommuteSettings({ maxCommuteMins: mins })}
          />
        ))}
      </View>

      <Text style={[styles.label, styles.secondLabel]}>Walk to station</Text>
      <View style={styles.chipRow}>
        {WALK_OPTIONS_KM.map((opt) => (
          <Chip
            key={opt.km}
            label={opt.label.replace(/\s*\(.*\)/, '')}
            selected={walkHomeKm === opt.km}
            onPress={() => updateCommuteSettings({ walkHomeKm: opt.km })}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.inkGhost, marginBottom: spacing.sm },
  secondLabel: { marginTop: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.white,
  },
  chipSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: { ...type.body, fontSize: 13, color: colors.inkMid },
  chipTextSelected: { color: colors.cream, fontWeight: '600' },
});
