import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

/**
 * A clock, drawn rather than typed.
 *
 * The three layer chips beside this one use geometric glyphs (● ◆ ★) that
 * every font ships. There is no equally safe clock character — the Unicode
 * clock faces are emoji, which arrive full-colour and off-palette, and the
 * quadrant shapes (◔ ◷) read as pie charts. Two Views inside a ring is
 * eleven lines, renders identically on both platforms, and takes the chip's
 * colour like the glyphs do.
 */
function ClockMark({ color }: { color: string }) {
  return (
    <View style={[styles.face, { borderColor: color }]}>
      <View style={[styles.handMinute, { backgroundColor: color }]} />
      <View style={[styles.handHour, { backgroundColor: color }]} />
    </View>
  );
}

interface Props {
  minutes: number;
  open: boolean;
  onPress: () => void;
}

/**
 * The commute limit, folded down to a chip.
 *
 * The slider used to sit open at the bottom of the map permanently. That
 * was right while it was the demo — dragging it and watching the region
 * breathe is what teaches someone what this app does — but wrong once
 * somebody has settled on their number and moved on to looking at areas
 * (Nick, 2026-09-01). It still lives in the same place; it just waits to
 * be asked for now.
 *
 * The chip keeps the NUMBER on screen, which matters more than it looks:
 * once the slider is folded away and the onboarding legend has gone, this
 * is the only thing left saying what the shaded region on the map means.
 */
export function CommuteChip({ minutes, open, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, open && styles.chipOn]}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Commute limit, ${minutes} minutes`}
      accessibilityHint={open ? 'Hides the commute slider' : 'Opens the commute slider'}
    >
      <ClockMark color={open ? colors.teal : colors.inkGhost} />
      <Text style={[styles.label, open && styles.labelOn]}>{minutes}m</Text>
    </Pressable>
  );
}

const FACE = 14;

const styles = StyleSheet.create({
  // Deliberately identical to the layer chips' metrics — this sits in the
  // same bar and any difference in padding or radius reads as a mistake.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
  },
  chipOn: { backgroundColor: colors.ink },
  label: {
    fontSize: 12.5,
    fontFamily: fonts.semibold,
    color: colors.inkLt,
    fontVariant: ['tabular-nums'],
  },
  labelOn: { color: colors.cream },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    borderWidth: 1.5,
  },
  // Positions are relative to the inside of the ring, so the centre of an
  // 11pt inner box is 5.5 — both hands start there and run outwards.
  handMinute: {
    position: 'absolute',
    width: 1.5,
    height: 4,
    left: 4.75,
    top: 1.5,
    borderRadius: 1,
  },
  handHour: {
    position: 'absolute',
    width: 3,
    height: 1.5,
    left: 5.5,
    top: 4.75,
    borderRadius: 1,
  },
});
