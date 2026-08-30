import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  /** 0 to 1. Clamped by lib/setupSteps.setupProgress before it gets here. */
  progress: number;
}

/** Thin enough to read as a rule rather than a component (Nick, 2026-08-30). */
const HEIGHT = 3;

/**
 * The setup progress line — a hairline across the very top of the screen
 * that fills with teal as the seven questions get answered.
 *
 * Deliberately NOT segmented into seven ticks. Nick asked for a line that
 * "gets progressively more teal", and a continuous fill answers the
 * question people actually have — am I nearly there? — without inviting
 * them to count how many are left and feel the number. It also degrades
 * gracefully if the step count ever changes.
 *
 * Animated rather than snapping, because the movement is the whole point:
 * seeing it advance the instant you answer is what tells you the answer
 * landed. useNativeDriver is off — width cannot be driven natively — but
 * this is one small view animating for 350ms, not a scroll.
 */
export function SetupProgress({ progress }: Props) {
  const width = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: progress,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [progress, width]);

  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(progress * 100), min: 0, max: 100 }}>
      <Animated.View
        style={[
          styles.fill,
          {
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    width: '100%',
    backgroundColor: colors.creamDk,
    overflow: 'hidden',
  },
  fill: {
    height: HEIGHT,
    backgroundColor: colors.teal,
  },
});
