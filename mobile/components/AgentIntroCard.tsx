import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { MalocaLogo, MalocaMark } from './MalocaLogo';

/**
 * The Agent's front door — a centred card over the map, shown once after a
 * first sign-in (Nick, 2026-08-26). Deliberately centred rather than
 * bottom-anchored like MapExplainerPanel, whose comment records the
 * opposite decision from 2026-08-23: that one describes what's ON the map,
 * so covering the map defeated it. This one is about starting a
 * conversation, so it takes the middle of the screen — but keeps the scrim
 * light and the commute slider visible above it, so the region someone has
 * just built is still there behind the ask.
 *
 * Voice is the primary path and typing the alternative, so the mark button
 * is large and the typed route is a text link beneath it.
 */

interface Props {
  onStartVoice: () => void;
  onStartTyping: () => void;
}

export function AgentIntroCard({ onStartVoice, onStartTyping }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.card}>
        <View style={styles.header}>
          <MalocaLogo scale={0.88} />
          <Text style={styles.agentWord}>Agent</Text>
        </View>

        <View style={styles.voicePill}>
          <Waveform bars={4} height={12} color={colors.teal} />
          <Text style={styles.voicePillText}>Voice conversation</Text>
        </View>

        <View style={styles.points}>
          <Point text="Five questions about the London you actually want to live in." />
          <Point text="Just talk — I'll listen, and your map updates as we go." />
        </View>

        <Pressable
          onPress={onStartVoice}
          style={({ pressed }) => [styles.markBtn, pressed && styles.markBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Start talking to the Maloca Agent"
        >
          <MalocaMark height={30} markColor={colors.cream} counterColor={COUNTER_ON_TEAL} />
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.caption}>Tap to start talking</Text>
          <Pressable onPress={onStartTyping} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.typeLink}>Or tap here to type your answers instead</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** A deeper teal so the counter still reads as a void on the teal disc. */
const COUNTER_ON_TEAL = '#1E5754';

function Point({ text }: { text: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.dot} />
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

/**
 * The "this is spoken, not typed" signal. Animated rather than static
 * because a still waveform reads as an icon; a moving one reads as sound.
 */
export function Waveform({ bars, height, color }: { bars: number; height: number; color: string }) {
  const values = useRef(Array.from({ length: bars }, () => new Animated.Value(0.3))).current;

  useEffect(() => {
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 420, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [values]);

  return (
    <View style={[styles.wave, { height }]}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 2,
            height,
            borderRadius: 1,
            backgroundColor: color,
            transform: [{ scaleY: v }],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  // Light on purpose — the map stays legible behind the ask.
  scrim: { position: 'absolute', inset: 0, backgroundColor: 'rgba(34,40,46,0.32)' },
  card: {
    width: '100%',
    maxWidth: 346,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radius.lg * 2,
    paddingVertical: spacing.xl + 2,
    paddingHorizontal: spacing.xl - 2,
    alignItems: 'center',
    gap: spacing.lg + 2,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 40,
    elevation: 16,
  },
  header: { alignItems: 'center', gap: 7 },
  agentWord: { ...type.label, fontSize: 12, letterSpacing: 4, color: colors.inkLt, textTransform: 'uppercase' },
  voicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: colors.tealLine,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  voicePillText: { ...type.label, fontSize: 10, letterSpacing: 1.4, color: colors.teal, textTransform: 'uppercase' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  points: { gap: 11, alignSelf: 'stretch' },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal, marginTop: 7 },
  pointText: { ...type.body, flex: 1, lineHeight: 20, color: colors.inkMid },
  markBtn: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 22,
    elevation: 8,
  },
  markBtnPressed: { opacity: 0.88, transform: [{ scale: 0.96 }] },
  footer: { alignItems: 'center', gap: spacing.md + 2 },
  caption: { ...type.body, fontSize: 13, color: colors.inkLt },
  typeLink: { fontFamily: fonts.semibold, fontSize: 14, color: colors.teal },
});
