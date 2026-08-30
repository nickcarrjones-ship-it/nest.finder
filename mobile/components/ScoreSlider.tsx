import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors, fonts } from '../theme';
import { MAX_SCORE, MIN_SCORE, type Score } from '../lib/verdicts';

interface Props {
  value: Score;
  onChange: (score: number) => void;
  /** Who is scoring — named at the prompt so a household reads clearly. */
  name?: string;
}

const STEPS = MAX_SCORE - MIN_SCORE; // 10 gaps between 11 stops
const TRACK_PAD = 14; // keeps the handle's own radius inside the track at both ends
const HANDLE = 26;
const TRACK_HEIGHT = 44; // the DRAG TARGET, not the line — thumb-sized on purpose

/**
 * The 0-10 score on an area, after someone has been.
 *
 * A slider rather than eleven dots because eleven tap targets is too
 * fiddly for a thumb (Nick, 2026-08-27). Two things it has to get right,
 * both from docs/learning-loop.md:
 *
 *  1. **It starts UNSET.** No handle parked at 5. A default records an
 *     opinion nobody gave, and a dataset full of phantom 5s is worse than
 *     a smaller honest one — this is the whole reason `Score` is
 *     `number | null` rather than a number.
 *  2. **The drag target is tall**, 44pt, and the whole line answers a tap
 *     as well as a drag. With no handle to grab, tap-to-set is the only
 *     way in for a first score, so the responder sits on the track rather
 *     than on the handle as CommuteSlider's does.
 *
 * PanResponder, not a slider library, for the same reason CommuteSlider
 * gives: a new native dependency means another prebuild and EAS rebuild
 * on both platforms before this is even testable.
 */
export function ScoreSlider({ value, onChange, name }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const usableWidth = Math.max(1, trackWidth - TRACK_PAD * 2);
  const stepWidth = usableWidth / STEPS;

  // Where the finger went down, in track coordinates. Movement is applied
  // as a delta from here — locationX is only trustworthy on grant.
  const grantX = useRef(0);

  const setFromX = (x: number) => {
    const clamped = Math.max(0, Math.min(usableWidth, x));
    const next = Math.round(clamped / stepWidth) + MIN_SCORE;
    if (next !== value) onChange(next);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A tap IS a score. Setting on grant rather than on release means
        // one tap anywhere on the line answers the whole question.
        onPanResponderGrant: (evt) => {
          const x = evt.nativeEvent.locationX - TRACK_PAD;
          grantX.current = x;
          setFromX(x);
        },
        onPanResponderMove: (_evt, gesture) => setFromX(grantX.current + gesture.dx),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usableWidth, stepWidth, value],
  );

  const onLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  const isSet = value !== null;
  const handleX = isSet ? (value - MIN_SCORE) * stepWidth : 0;

  return (
    <View>
      <View style={styles.promptRow}>
        <Text style={styles.prompt} numberOfLines={1}>
          {isSet ? (name ? `${name}’s score` : 'Your score') : 'Tap the line to score it'}
        </Text>
        {/* The number appears only once there is one — an empty slot rather
            than a greyed-out dash, so nothing reads as a starting value. */}
        {isSet && <Text style={styles.value}>{value}</Text>}
      </View>

      <View
        style={styles.track}
        onLayout={onLayout}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={name ? `${name}’s score for this area` : 'Your score for this area'}
        accessibilityValue={
          isSet ? { min: MIN_SCORE, max: MAX_SCORE, now: value } : { text: 'Not scored yet' }
        }
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          // Screen-reader users get the scale without a drag. From unset,
          // either action starts in the middle — the one place a default is
          // honest, because they have deliberately asked for a value.
          const from = isSet ? value : 5;
          if (e.nativeEvent.actionName === 'increment') onChange(Math.min(MAX_SCORE, from + 1));
          if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(MIN_SCORE, from - 1));
        }}
      >
        <View style={styles.trackLine} />
        {isSet && <View style={[styles.fillLine, { width: handleX + TRACK_PAD }]} />}

        {/* Eleven stops, drawn faintly, so the scale reads as 0-10 rather
            than as a continuous range. */}
        <View style={styles.stopRow} pointerEvents="none">
          {Array.from({ length: STEPS + 1 }, (_, i) => (
            <View
              key={i}
              style={[styles.stop, isSet && i <= value - MIN_SCORE && styles.stopFilled]}
            />
          ))}
        </View>

        {isSet && <View style={[styles.handle, { transform: [{ translateX: handleX }] }]} />}
      </View>

      <View style={styles.endsRow}>
        <Text style={styles.end}>Not for us</Text>
        <Text style={styles.end}>Loved it</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  promptRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  prompt: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkLt, flexShrink: 1 },
  value: {
    fontFamily: fonts.medium,
    fontSize: 22,
    color: colors.teal,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },

  track: { height: TRACK_HEIGHT, justifyContent: 'center' },
  trackLine: {
    position: 'absolute', left: TRACK_PAD, right: TRACK_PAD, height: 4,
    borderRadius: 2, backgroundColor: colors.creamDk,
  },
  fillLine: {
    position: 'absolute', left: 0, height: 4,
    borderRadius: 2, backgroundColor: colors.teal,
  },
  stopRow: {
    position: 'absolute', left: TRACK_PAD, right: TRACK_PAD,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  stop: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.inkGhost, opacity: 0.5 },
  stopFilled: { backgroundColor: colors.white, opacity: 0.9 },

  handle: {
    position: 'absolute', left: TRACK_PAD - HANDLE / 2,
    width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2,
    backgroundColor: colors.white, borderWidth: 3, borderColor: colors.teal,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 2,
  },

  endsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 2, marginTop: -2,
  },
  end: { fontFamily: fonts.regular, fontSize: 11, color: colors.inkGhost },
});
