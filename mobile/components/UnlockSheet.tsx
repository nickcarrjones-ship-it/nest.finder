import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../theme';
import { MalocaMark } from './MalocaLogo';

/**
 * The sign-in screen, rebuilt as a comparison (Nick, 2026-08-29, pointing
 * at Duolingo's Super page).
 *
 * Two things that screen gets right and the panel this replaces did not.
 * Its headline is about the reader's own goal — "4.2x more likely to finish
 * the French course" — not about features. And it appears at a moment the
 * reader has earned rather than on a timer, which is what the trigger
 * change in app/(tabs)/index.tsx is for.
 *
 * The right-hand column is honestly labelled SOON and the button asks for a
 * free account. That distinction matters: a FREE-versus-PRO table normally
 * means "pick one and pay", and someone who reads it that way declines over
 * a price that does not exist yet. The Pro column is a roadmap, shown
 * because Nick wants agent relationships and in-app booking visible now —
 * so it is drawn plainly, greyed rather than gold, with nothing to tap.
 */


/** Free today with an account; Pro is the column with no tick. */
const ROWS: { label: string; free: boolean }[] = [
  { label: 'Your commute map', free: true },
  { label: 'Areas that actually suit you', free: true },
  { label: 'Track every viewing', free: true },
  { label: 'Rank your shortlist', free: true },
  { label: 'One profile, every agent', free: false },
  { label: 'Book viewings in the app', free: false },
];

interface Props {
  visible: boolean;
  areaCount: number;
  busy: boolean;
  onSignIn: () => void;
  onClose: () => void;
}

export function UnlockSheet({ visible, areaCount, busy, onSignIn, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.fill, { paddingTop: insets.top }]}>
        <View style={styles.hero}>
          <CommuteBloom running={visible} />
          <Text style={styles.headline}>
            <Text style={styles.figure}>{areaCount}</Text> areas fit your commute.
          </Text>
          <Text style={styles.subhead}>Let&rsquo;s find the ones that fit you.</Text>
        </View>

        <View style={styles.body}>
          <ScrollView
            contentContainerStyle={styles.tableWrap}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.headRow}>
              <View style={styles.labelCell} />
              <Text style={styles.freeHead}>FREE</Text>
              <View style={styles.proHead}>
                <View style={styles.proBadge}>
                  <MalocaMark height={13} markColor={colors.white} counterColor={colors.teal} />
                  <Text style={styles.proWord}>PRO</Text>
                </View>
                <Text style={styles.soon}>SOON</Text>
              </View>
            </View>

            {ROWS.map((row) => (
              <View key={row.label} style={styles.row}>
                <Text style={styles.label}>{row.label}</Text>
                <View style={[styles.mark, styles.markFree]}>
                  {row.free ? <Tick colour={colors.ink} /> : <Dash />}
                </View>
                <View style={[styles.mark, styles.markPro]}>
                  <Tick colour={colors.teal} />
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.cta, { paddingBottom: insets.bottom + spacing.md }]}>
            <Pressable
              onPress={onSignIn}
              disabled={busy}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>CONTINUE WITH GOOGLE</Text>
              )}
            </Pressable>
            {/* Said plainly, because the table above it implies a price. */}
            <Text style={styles.footnote}>Free, no card. Pro features are still being built.</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
              <Text style={styles.notNow}>NOT NOW</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Three walk-time polygons leaving the mark, one after another — the
 * commute zone growing, which is the thing they have just spent a minute
 * dragging.
 *
 * They are POLYGONS, not circles (Nick, 2026-08-29). A real isochrone is
 * lopsided: it bulges along the fast routes and pinches where there is a
 * river or nothing to walk to, and a perfect circle is the one shape it
 * never is. Each ring here is an irregular closed outline built from
 * straight edges, which is what the app draws on the map.
 *
 * Drawn from plain Views because the project has no SVG dependency and
 * this is not worth adding a native module for: each edge is one thin View
 * rotated to join two vertices, the geometry is solved once, and only the
 * parent scale and opacity animate — on the native driver, so it cannot
 * stutter while the map settles behind the modal.
 */

/** Vertices per outline. Enough to read as a shape, few enough to stay
 *  visibly straight-edged rather than smoothing back into a circle. */
const VERTICES = 22;
const STROKE = 2;

/**
 * Radius at each vertex, as a fraction of the full ring. Two slow
 * harmonics make the lobes an isochrone has; the third, faster one puts a
 * kink in the edges so they don't read as a smooth blob. Deterministic —
 * the same three shapes every time, chosen rather than random.
 */
function outline(phase: number) {
  return Array.from({ length: VERTICES }, (_, i) => {
    const a = (i / VERTICES) * Math.PI * 2;
    return (
      0.82 +
      0.11 * Math.sin(3 * a + phase) +
      0.06 * Math.sin(5 * a + phase * 2.3) +
      0.04 * Math.sin(11 * a + phase * 0.7)
    );
  });
}

/** Each edge as a thin View: centred on the midpoint, turned to face the
 *  next vertex, and exactly as long as the gap between them. */
function edges(phase: number) {
  const r = RING / 2;
  const pts = outline(phase).map((k, i) => {
    const a = (i / VERTICES) * Math.PI * 2;
    return { x: r + Math.cos(a) * r * k, y: r + Math.sin(a) * r * k };
  });
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    return {
      key: i,
      left: (p.x + q.x) / 2 - len / 2,
      top: (p.y + q.y) / 2 - STROKE / 2,
      width: len,
      rotate: `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`,
    };
  });
}
function CommuteBloom({ running }: { running: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running) return;
    // Staggered by START time, not by a delay inside the loop — a delay in
    // the sequence would repeat every cycle and the rings would bunch up.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const loops = [a, b, c].map((value, i) => {
      const loop = Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: 2600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      );
      timers.push(setTimeout(() => loop.start(), i * 870));
      return loop;
    });
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
    };
  }, [running, a, b, c]);

  // A different phase per ring, so no two are the same shape and the
  // bloom never looks like one outline repeated.
  const shapes = useMemo(() => [edges(0), edges(2.1), edges(4.2)], []);

  return (
    <View style={styles.bloom} pointerEvents="none">
      {[a, b, c].map((value, i) => (
        <Animated.View
          key={i}
          style={[
            styles.ring,
            {
              opacity: value.interpolate({
                inputRange: [0, 0.12, 1],
                outputRange: [0, 0.5, 0],
              }),
              transform: [
                { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              ],
            },
          ]}
        >
          {shapes[i].map((e) => (
            <View
              key={e.key}
              style={[
                styles.edge,
                { left: e.left, top: e.top, width: e.width, transform: [{ rotate: e.rotate }] },
              ]}
            />
          ))}
        </Animated.View>
      ))}
      <View style={styles.bloomCore}>
        {/* The splash lockup exactly: the navy mark on white, teal counter
            — MalocaLogo's own defaults, which is what welcome.tsx renders
            (Nick, 2026-08-29). */}
        <MalocaMark height={40} markColor={colors.ink} counterColor={colors.teal} />
      </View>
    </View>
  );
}

/** Drawn as a rotated corner — the project has no SVG dependency. */
function Tick({ colour }: { colour: string }) {
  return <View style={[styles.tick, { borderColor: colour }]} />;
}

function Dash() {
  return <View style={styles.dash} />;
}

const RING = 128;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.teal },

  hero: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  bloom: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: RING, height: RING },
  edge: { position: 'absolute', height: STROKE, backgroundColor: colors.cream },
  bloomCore: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontFamily: fonts.bold,
    fontSize: 25,
    lineHeight: 31,
    color: colors.white,
    textAlign: 'center',
  },
  figure: { color: colors.amber },
  subhead: {
    fontFamily: fonts.bold,
    fontSize: 25,
    lineHeight: 31,
    color: colors.white,
    textAlign: 'center',
  },

  body: {
    flex: 1,
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.lg * 2.4,
    borderTopRightRadius: radius.lg * 2.4,
    paddingHorizontal: spacing.lg,
  },
  tableWrap: { paddingTop: spacing.lg },

  headRow: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: spacing.sm },
  labelCell: { flex: 1 },
  freeHead: {
    width: 64,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.inkLt,
  },
  proHead: { width: 84, alignItems: 'center', gap: 3 },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  proWord: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, color: colors.white },
  soon: { fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 1, color: colors.inkGhost },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  label: { ...type.body, flex: 1, fontSize: 14.5, color: colors.ink, paddingRight: spacing.sm },
  mark: { alignItems: 'center', justifyContent: 'center', height: 20 },
  // Matches freeHead/proHead's widths exactly, so a tick centers under the
  // header it belongs to instead of the two columns packing together.
  markFree: { width: 64 },
  markPro: { width: 84 },
  tick: {
    width: 15,
    height: 8,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
    marginTop: -4,
  },
  dash: { width: 13, height: 3, borderRadius: 2, backgroundColor: colors.creamDk },

  cta: { paddingTop: spacing.md, gap: spacing.sm, alignItems: 'stretch' },
  button: {
    minHeight: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.88 },
  buttonText: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.8, color: colors.white },
  footnote: { ...type.body, fontSize: 12, color: colors.inkLt, textAlign: 'center' },
  notNow: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.inkLt,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
