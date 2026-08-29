import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../theme';
import { MalocaMark } from './MalocaLogo';

/**
 * The sign-in screen (Nick, 2026-08-29, pointing at Duolingo's Super page
 * for the shape — a headline about the reader's own goal, appearing at a
 * moment they've earned rather than on a timer, which is what the trigger
 * change in app/(tabs)/index.tsx is for).
 *
 * No FREE/PRO comparison (reworked same day, after deciding the actual
 * monetisation model): the household using this app moves out and stops
 * needing it in a couple of months, so they were never the paying customer
 * — the plan is to charge estate agents for qualified buyer leads instead,
 * once there is real volume of profiles to offer them. Showing this
 * household a "Pro" column they'll never buy just adds friction to the one
 * screen that most needs to be frictionless, and risks reading as a
 * paywall-in-waiting for a product that intends to stay free for exactly
 * this side of the market. So it's a plain, confident list of what signing
 * in gets them today, nothing hypothetical.
 */
/**
 * Each item's opening phrase (what it is) is picked out in teal, the rest
 * (what it actually does for you) stays the sheet's ordinary dark text —
 * this list sits on the light cream body below the hero, not the dark
 * header above it. Reworded 2026-08-29 from a checklist of nouns to
 * sentences that say the actual thing.
 *
 * Left-aligned with a tick, not centred (corrected same day — a first pass
 * centred the text itself and dropped the ticks, but centring was meant to
 * describe the block's overall balance on the page, not each line's own
 * text alignment, and "where have the ticks gone?" was the tell that this
 * had gone too far).
 */
const FEATURES: { lead: string; rest: string }[] = [
  { lead: 'Your commute map', rest: '— tweak it whenever you want.' },
  {
    lead: 'Maloca Agent',
    rest: 'learns about the areas you love today to suggest others that suit your vibe.',
  },
  {
    lead: 'Track your viewings',
    rest: 'via iCalendar sync across the whole household.',
  },
  {
    lead: 'Rank your viewings',
    rest: 'as you go against your must-haves and dealbreakers.',
  },
  {
    lead: 'Link accounts',
    rest: 'with others in your household.',
  },
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
          <View style={styles.listWrap}>
            <Text style={styles.freeLine}>Free. No card, no catch.</Text>

            {FEATURES.map((f) => (
              <View key={f.lead} style={styles.featureRow}>
                <View style={styles.featureTick}>
                  <Tick colour={colors.teal} />
                </View>
                <Text style={styles.featureLine}>
                  <Text style={styles.featureLead}>{f.lead}</Text> {f.rest}
                </Text>
              </View>
            ))}
          </View>

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

const RING = 128;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.teal },

  hero: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  bloom: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: RING, height: RING },
  edge: { position: 'absolute', height: STROKE, backgroundColor: colors.cream },
  bloomCore: {
    // The mark itself is ~70pt wide at height=40 (MalocaMark's lockup is
    // wider than it is tall) — this circle was 68, smaller than the logo
    // it was meant to sit inside (Nick, 2026-08-29). 92 gives real margin
    // on the widest axis rather than just clearing it.
    width: 92,
    height: 92,
    borderRadius: 46,
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
    // Centres the list+button as one group in the space below the hero,
    // rather than the list sitting at the top and leaving a dead gap
    // before the button (Nick, on device 2026-08-29) — there's no
    // ScrollView here any more for that leftover space to hide inside.
    justifyContent: 'center',
  },
  // Deliberately narrower than the button below it, not flush with it
  // (Nick, 2026-08-29): an extra inset on top of body's own padding, equal
  // on both sides, so the whole list sits tucked in from the button's
  // width — which is what shifts the ticks right of where they used to
  // sit flush against the edge.
  listWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  freeLine: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.4,
    color: colors.teal,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  featureTick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginTop: 1,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * justify, not left, so the first line of a two-line item ends flush on
   * the right rather than wherever the last word happens to land (Nick,
   * 2026-08-29: "the right-hand side is completely flush... the first
   * line of each is perfectly lined up"). Justification only stretches
   * every line EXCEPT the paragraph's last one, which is exactly the
   * effect wanted here and is standard typographic behaviour, not a
   * workaround.
   *
   * Sized down from 15.5/21 to help the longer items (the Agent line
   * especially) actually wrap to two lines rather than three now that the
   * column is narrower than before.
   */
  featureLine: {
    ...type.body,
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.ink,
    textAlign: 'justify',
  },
  featureLead: { fontFamily: fonts.bold, color: colors.teal },
  tick: {
    width: 11,
    height: 6,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
    marginTop: -1,
  },

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
  notNow: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.inkLt,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
