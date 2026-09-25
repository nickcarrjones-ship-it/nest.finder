import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet, Button } from './ui';
import { ViewingWhenPicker } from './ViewingWhenPicker';
import { colors, fonts, spacing, type } from '../theme';
import { useViewings } from '../hooks/useViewings';
import type { Viewing } from '../lib/viewings';

/**
 * "No, we didn't go" — so when are they going instead?
 *
 * A viewing whose date passed without a scorecard is asked about rather
 * than assumed seen (Nick, 2026-09-25), and this is the other half of that
 * question. It opens with no date chosen: the old one is the date that did
 * NOT happen, so pre-filling it would invite saving it again by accident.
 * Leaving it at "no date yet" is a real answer too — the property goes back
 * to Want to see until something is booked.
 */
interface Props {
  viewing: Viewing | null;
  onClose: () => void;
}

export function RescheduleSheet({ viewing, onClose }: Props) {
  const { save } = useViewings();
  const [when, setWhen] = useState<number | null>(null);

  useEffect(() => {
    setWhen(null);
  }, [viewing?.id]);

  if (!viewing) return null;

  function commit() {
    save({ ...(viewing as Viewing), viewingAt: when, attended: null });
    onClose();
  }

  return (
    <BottomSheet visible onClose={onClose} title="Change the viewing">
      <View style={styles.body}>
        <Text style={styles.address}>{viewing.address}</Text>
        <ViewingWhenPicker value={when} onChange={setWhen} />
        <View style={styles.actions}>
          <Button
            label={when === null ? 'Move to want to see' : 'Save new date'}
            onPress={commit}
          />
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.lg },
  address: { ...type.bodyStrong, fontSize: 15, color: colors.ink },
  actions: { alignItems: 'center', gap: spacing.md },
  cancel: { fontFamily: fonts.regular, fontSize: 15, color: colors.inkLt },
});
