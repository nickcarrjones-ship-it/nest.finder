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
/**
 * Three ways in, one question - when is the viewing?
 *
 *  - 'missed': the "did you go? no" path above. Opens blank, can go back
 *    to Want to see.
 *  - 'book': a property saved to Want to see, now with a slot booked
 *    (Nick, 2026-10-06: "once it's in want to see you can't book its
 *    viewing slot"). Needs a date, so the button waits for one.
 *  - 'change': a booked viewing whose time has moved. Opens on the time
 *    it has now.
 */
export type WhenMode = 'missed' | 'book' | 'change';

interface Props {
  viewing: Viewing | null;
  onClose: () => void;
  mode?: WhenMode;
}

const TITLES: Record<WhenMode, string> = {
  missed: 'Change the viewing',
  book: 'Book the viewing',
  change: 'Change the time',
};

export function RescheduleSheet({ viewing, onClose, mode = 'missed' }: Props) {
  const { save } = useViewings();
  const [when, setWhen] = useState<number | null>(null);

  useEffect(() => {
    setWhen(mode === 'change' ? viewing?.viewingAt ?? null : null);
  }, [viewing?.id, mode]);

  if (!viewing) return null;

  const needsDate = mode !== 'missed' && when === null;

  function commit() {
    if (needsDate) return;
    save({ ...(viewing as Viewing), viewingAt: when, attended: null });
    onClose();
  }

  const label =
    mode === 'book' ? (when === null ? 'Choose a date and time' : 'Book it')
    : mode === 'change' ? (when === null ? 'Choose a date and time' : 'Save new time')
    : when === null ? 'Move to want to see' : 'Save new date';

  return (
    <BottomSheet visible onClose={onClose} title={TITLES[mode]}>
      <View style={styles.body}>
        <Text style={styles.address}>{viewing.address}</Text>
        <ViewingWhenPicker value={when} onChange={setWhen} />
        <View style={styles.actions}>
          <Button
            label={label}
            onPress={commit}
            disabled={needsDate}
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
