import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { COMMUTE_OPTIONS_MINS } from '../lib/commuteSettings';

interface Props {
  value: number;
  onChange: (mins: number) => void;
}

const TRACK_PAD = 12; // keeps the handle's own radius inside the track at both ends

/**
 * "Where you could live with a NN minute commute" — the control that makes
 * the region legible, replacing the settings-sheet dropdown as the primary
 * way to set it. Watching the shape breathe as you drag explains the whole
 * feature in a few seconds, which a label alone never did (map-legibility
 * exploration, 2026-08-23 — Nick's pick of the two options shown there).
 *
 * PanResponder rather than a native slider library: the app just went
 * through a real CocoaPods/Xcode fight to get iOS building at all, and a
 * new native dependency means another full pod install + rebuild on both
 * platforms before this is even testable. Snapping to the same
 * COMMUTE_OPTIONS_MINS steps the settings sheet already offers keeps this
 * consistent with the rest of the app rather than inventing a continuous
 * range nothing else uses.
 */
export function CommuteSlider({ value, onChange }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const dragX = useRef(new Animated.Value(0)).current;
  const usableWidth = Math.max(1, trackWidth - TRACK_PAD * 2);

  const index = Math.max(0, COMMUTE_OPTIONS_MINS.indexOf(value));
  const stepWidth = usableWidth / (COMMUTE_OPTIONS_MINS.length - 1);

  const setFromIndex = (i: number) => {
    const clamped = Math.max(0, Math.min(COMMUTE_OPTIONS_MINS.length - 1, i));
    dragX.setValue(clamped * stepWidth);
    const mins = COMMUTE_OPTIONS_MINS[clamped];
    if (mins !== value) onChange(mins);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_evt, gesture) => {
          const raw = index * stepWidth + gesture.dx;
          dragX.setValue(Math.max(0, Math.min(usableWidth, raw)));
        },
        onPanResponderRelease: (_evt, gesture) => {
          const raw = index * stepWidth + gesture.dx;
          setFromIndex(Math.round(raw / stepWidth));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, stepWidth, usableWidth],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackWidth(w);
    dragX.setValue(index * ((w - TRACK_PAD * 2) / (COMMUTE_OPTIONS_MINS.length - 1)));
  };

  // Fully live even before sign-in (2026-08-23): dragging it and watching
  // the polygon breathe is how someone LEARNS what this app does, so it's
  // the last thing to put behind a gate — the sign-in ask moved entirely
  // to the Agent/personalisation pitch in MapExplainerPanel instead.
  return (
    <View style={styles.wrap}>
      <Text style={styles.lead}>Where you could live with a</Text>
      <Text style={styles.big}>{value} minute commute</Text>

      <View style={styles.track} onLayout={onLayout}>
        <View style={styles.trackLine} />
        <Animated.View style={[styles.fillLine, { width: Animated.add(dragX, TRACK_PAD) }]} />
        <Animated.View
          style={[styles.handle, { transform: [{ translateX: dragX }] }]}
          {...panResponder.panHandlers}
        />
      </View>

      <View style={styles.tickRow}>
        {COMMUTE_OPTIONS_MINS.map((m) => (
          <Text key={m} style={[styles.tick, m === value && styles.tickActive]}>{m}</Text>
        ))}
      </View>
    </View>
  );
}

const HANDLE = 22;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  lead: { fontSize: 11, color: colors.inkLt },
  big: { ...type.title, fontSize: 17, color: colors.ink, marginBottom: spacing.xs },
  track: { height: HANDLE, justifyContent: 'center' },
  trackLine: {
    position: 'absolute', left: TRACK_PAD, right: TRACK_PAD, height: 4,
    borderRadius: 2, backgroundColor: colors.creamMid,
  },
  fillLine: {
    position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: colors.teal,
  },
  handle: {
    position: 'absolute', left: 0, width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2,
    backgroundColor: colors.white, borderWidth: 3, borderColor: colors.teal,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 3,
  },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tick: { fontSize: 10, color: colors.inkGhost, fontVariant: ['tabular-nums'] },
  tickActive: { color: colors.teal, fontFamily: fonts.bold },
});
