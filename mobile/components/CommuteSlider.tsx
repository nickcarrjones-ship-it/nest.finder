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
  // the last thing to put behind a gate — the sign-in ask lives in
  // UnlockBar/UnlockSheet, which this slider is what triggers.
  return (
    <View style={styles.wrap}>
      {/* One line, not two. It saves a whole row of vertical space above the
          map, and the lead was set at 11px which was too small to read
          comfortably — it now matches the legend beneath it (Nick,
          2026-08-29). Measured at 285dp against 352dp available. */}
      {/* Says what to DO as well as what it shows, which is why the "Drag
          to change your commute time" bubble could go — it was separate
          furniture telling people something the control can say itself
          (Nick, 2026-08-29).
          
          "within N minutes" rather than "within a max N minute commute":
          the full phrasing measured 393dp against 300 available on a small
          phone, and "within" already means at most. */}
      <Text style={styles.headline} numberOfLines={1}>
        Slide to see where you could live within{' '}
        <Text style={styles.headlineValue}>{value} minutes</Text>
      </Text>

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
  headline: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: colors.inkMid,
    marginBottom: spacing.xs,
  },
  // The number is what changes, so it carries the weight rather than a
  // separate larger line.
  headlineValue: { fontFamily: fonts.semibold, color: colors.ink },
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
  tick: { fontFamily: fonts.regular, fontSize: 10, color: colors.inkGhost, fontVariant: ['tabular-nums'] },
  tickActive: { color: colors.teal, fontFamily: fonts.bold },
});
