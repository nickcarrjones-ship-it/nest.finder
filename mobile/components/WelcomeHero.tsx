import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';

/**
 * The welcome screen's hero: the three things Maloca does, told as a
 * swipeable sequence with a drawn scene for each, rather than as a
 * paragraph of copy (Nick, 2026-08-23 — the sentence version "got worse:
 * boring text, boring font").
 *
 * The swipe itself is a horizontal, paging ScrollView, not a custom
 * PanResponder gesture (2026-08-24, replacing a version that didn't work
 * at all on device). This whole hero lives inside WorkplaceEntrySheet's
 * vertical ScrollView, and a PanResponder nested inside a ScrollView is a
 * well-known losing fight — the ancestor's native scroll recognizer
 * generally wins the touch before the child's JS-level responder
 * negotiation gets a real say. A horizontal ScrollView nested in a
 * vertical one has no such conflict: the two axes are orthogonal, so both
 * scroll natively and reliably, which is the standard, boring, actually-
 * works way to build a swipeable card carousel in React Native.
 *
 * Every scene is drawn from Views — no SVG dependency, no image assets to
 * ship — and each one reuses the real product's own visual language so the
 * promise and the app look like the same thing: scene 1 sketches the map
 * itself (the Thames, two named areas, two workplace pins), scene 2 is the
 * shortlist's ranked rows, scene 3 pays off with a house and a tick.
 */

interface SceneProps {
  /** True while this step is the one centred in the carousel — scenes use
   *  it to (re)trigger their own entrance animation each time they're
   *  swiped back into view, not just on first mount. */
  active: boolean;
}

const STEPS: { title: string; body?: string; Scene: (p: SceneProps) => ReactElement }[] = [
  {
    title: 'Find your perfect neighbourhood with AI',
    body: 'Set your commute — Maloca AI finds the neighbourhoods that match your vibe.',
    Scene: DiscoverScene,
  },
  {
    title: 'Track and rank every viewing',
    body: 'Score places as you see them, with viewings synced to your calendar.',
    Scene: RankScene,
  },
  {
    title: 'Move with confidence, whether you’re buying or renting in London',
    Scene: ConfidenceScene,
  },
];

export function WelcomeHero() {
  const [containerWidth, setContainerWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function onWrapLayout(e: LayoutChangeEvent) {
    // Only set once — a re-layout of a fixed-size sheet shouldn't reset
    // scroll position mid-use.
    setContainerWidth((w) => (w === 0 ? e.nativeEvent.layout.width : w));
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!containerWidth) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    setIndex(Math.max(0, Math.min(STEPS.length - 1, i)));
  }

  function goTo(i: number) {
    scrollRef.current?.scrollTo({ x: i * containerWidth, animated: true });
    setIndex(i);
  }

  // A slow side-to-side nudge on the swipe hint — motion is what actually
  // reads as "this is interactive", static text alone gets skimmed past.
  const hintX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hintX, { toValue: 5, duration: 560, useNativeDriver: true }),
        Animated.timing(hintX, { toValue: -5, duration: 560, useNativeDriver: true }),
        Animated.timing(hintX, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.delay(700),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hintX]);

  return (
    <View style={styles.wrap} onLayout={onWrapLayout}>
      {containerWidth > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={32}
        >
          {STEPS.map((step, i) => (
            <View key={step.title} style={{ width: containerWidth }}>
              <View style={styles.stage}>
                <step.Scene active={i === index} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title}>{step.title}</Text>
                {step.body ? <Text style={styles.body}>{step.body}</Text> : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.dots}>
        {STEPS.map((s, i) => (
          <Pressable
            key={s.title}
            onPress={() => goTo(i)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={s.title}
          >
            <View style={[styles.dot, i === index && styles.dotOn]} />
          </Pressable>
        ))}
      </View>

      <Animated.View style={[styles.swipeHint, { transform: [{ translateX: hintX }] }]}>
        <Text style={styles.swipeHintText}>‹  Swipe to continue  ›</Text>
      </Animated.View>
    </View>
  );
}

/**
 * Scene 1 — not a map. Two attempts at drawing a recognisable Thames from
 * flat rotated rectangles both failed (2026-08-24) — a convincing river at
 * 150x100px was never really achievable with straight segments, no matter
 * how precisely they were joined. This instead borrows the REAL map
 * screen's own visual language — the "everywhere within your commute"
 * circle — and shows AI narrowing it down to a match: one plain circle
 * (trivial, safe geometry), a sparkle badge, and two named-area chips, one
 * highlighted as the pick and one dimmed as "considered". It's more
 * honest about what the app actually does than an illustrative map ever
 * was, and nothing in it needs freeform curve math.
 */
function DiscoverScene({ active }: SceneProps) {
  const circleAnim = useRef(new Animated.Value(0)).current;
  const sparkAnim = useRef(new Animated.Value(0)).current;
  const chipsAnim = useRef(new Animated.Value(0)).current;
  const matchAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    circleAnim.setValue(0);
    sparkAnim.setValue(0);
    chipsAnim.setValue(0);
    matchAnim.setValue(0);
    Animated.timing(circleAnim, { toValue: 1, duration: 340, useNativeDriver: true }).start();
    Animated.timing(sparkAnim, {
      toValue: 1, duration: 260, delay: 260, useNativeDriver: true,
    }).start();
    Animated.timing(chipsAnim, {
      toValue: 1, duration: 260, delay: 460, useNativeDriver: true,
    }).start();
    // The matched chip settles in with a little overshoot after the pair
    // has appeared — the small "found it" beat.
    Animated.sequence([
      Animated.delay(620),
      Animated.spring(matchAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [active, circleAnim, sparkAnim, chipsAnim, matchAnim]);

  const circleEnter = { opacity: circleAnim, transform: [{ scale: circleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] };
  const sparkEnter = { opacity: sparkAnim, transform: [{ scale: sparkAnim }] };
  const camdenEnter = { opacity: chipsAnim, transform: [{ scale: chipsAnim }] };
  const matchEnter = { opacity: chipsAnim, transform: [{ scale: matchAnim }] };

  return (
    <View style={styles.scene}>
      <View style={styles.mapCard}>
        <Animated.View style={[styles.reachCircle, circleEnter]} />

        <Animated.View style={[styles.sparkBadge, sparkEnter]}>
          <View style={styles.sparkBig} />
          <View style={styles.sparkSmall} />
        </Animated.View>

        <Animated.View style={[styles.areaChip, styles.areaChipMuted, styles.chipCamden, camdenEnter]}>
          <Text style={styles.areaChipTextMuted}>Camden</Text>
        </Animated.View>
        <Animated.View style={[styles.areaChip, styles.areaChipMatch, styles.chipBattersea, matchEnter]}>
          <Text style={styles.areaChipTextMatch}>Battersea</Text>
        </Animated.View>
      </View>
    </View>
  );
}

/** Scene 2 — the shortlist: three ranked rows, the winner picked out. */
function RankScene(_props: SceneProps) {
  return (
    <View style={styles.scene}>
      <View style={styles.listCard}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.listRow, i === 0 && styles.listRowTop]}>
            <View style={[styles.rankNum, i === 0 && styles.rankNumTop]}>
              <Text style={[styles.rankNumText, i === 0 && styles.rankNumTextTop]}>{i + 1}</Text>
            </View>
            <View style={styles.rowLines}>
              <View style={[styles.rowLine, { width: [52, 44, 38][i] }]} />
              <View style={[styles.rowLine, styles.rowLineFaint, { width: [34, 28, 24][i] }]} />
            </View>
            <View style={styles.rowDots}>
              {[0, 1, 2].map((d) => (
                <View
                  key={d}
                  style={[styles.rowDot, d <= 2 - i && styles.rowDotOn]}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Scene 3 — a home, signed off with a tick. No brand key here — it's
 *  already the logo's job (Nick, 2026-08-24); repeating it read as clutter. */
function ConfidenceScene(_props: SceneProps) {
  return (
    <View style={styles.scene}>
      <View style={styles.houseWrap}>
        <View style={styles.roof} />
        <View style={styles.houseBody}>
          <View style={styles.door} />
        </View>
        <View style={styles.checkBadge}>
          {/* Two segments meeting at one shared vertex (10,17), each
              rotated around its OWN start point via transformOrigin rather
              than independently positioned — the earlier version rotated
              each bar around its own centre while positioned as if it
              hadn't been, so the two never actually met and read as two
              crossed lines instead of a tick. */}
          <View style={styles.checkShort} />
          <View style={styles.checkLong} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.lg },
  // Fixed height so the sheet doesn't reflow as scenes swap.
  stage: { height: 112, justifyContent: 'center', alignItems: 'center' },
  scene: { alignItems: 'center', justifyContent: 'center' },
  copy: { minHeight: 74, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  title: {
    ...type.title,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: colors.ink,
    textAlign: 'center',
  },
  body: {
    ...type.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkLt,
    textAlign: 'center',
    marginTop: 5,
    paddingHorizontal: spacing.sm,
  },
  dots: { flexDirection: 'row', gap: 7, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.creamDk },
  dotOn: { backgroundColor: colors.teal, width: 18 },
  swipeHint: { marginTop: spacing.sm },
  swipeHintText: { ...type.label, fontSize: 10.5, color: colors.inkGhost },

  // ── Scene 1 ──
  mapCard: {
    width: 150,
    height: 100,
    borderRadius: radius.lg + 4,
    backgroundColor: colors.creamMid,
    borderWidth: 1,
    borderColor: colors.rule,
    overflow: 'hidden',
  },
  // The map screen's own "everywhere within your commute" region, as a
  // plain circle — the honest, safe-to-draw version of that idea.
  reachCircle: {
    position: 'absolute',
    left: 33, top: 8, width: 84, height: 84, borderRadius: 42,
    backgroundColor: colors.tealSoft,
    borderWidth: 1.5, borderColor: colors.tealLine,
  },
  sparkBadge: {
    position: 'absolute',
    left: 94, top: 6, width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.teal,
    borderWidth: 2, borderColor: colors.creamMid,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4,
  },
  sparkBig: {
    position: 'absolute', left: 7, top: 5,
    width: 10, height: 10, borderRadius: 2.3,
    backgroundColor: colors.white,
    transform: [{ rotate: '45deg' }],
  },
  sparkSmall: {
    position: 'absolute', left: 15, top: 13,
    width: 5, height: 5, borderRadius: 1.2,
    backgroundColor: colors.white,
    transform: [{ rotate: '45deg' }],
  },
  areaChip: {
    position: 'absolute',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  areaChipMuted: { backgroundColor: colors.white, borderColor: colors.rule },
  areaChipMatch: {
    backgroundColor: colors.teal, borderColor: colors.teal,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4,
  },
  chipCamden: { left: 40, top: 20 },
  chipBattersea: { left: 66, top: 56 },
  areaChipTextMuted: { fontSize: 9, fontFamily: fonts.bold, color: colors.inkLt },
  areaChipTextMatch: { fontSize: 9, fontFamily: fonts.bold, color: colors.white },

  // ── Scene 2 ──
  listCard: { width: 152, gap: 6 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  listRowTop: { borderColor: colors.tealLine, backgroundColor: 'rgba(46,125,122,0.07)' },
  rankNum: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.creamDk,
    alignItems: 'center', justifyContent: 'center',
  },
  rankNumTop: { backgroundColor: colors.teal },
  rankNumText: { fontSize: 9, fontFamily: fonts.bold, color: colors.inkLt },
  rankNumTextTop: { color: colors.white },
  rowLines: { flex: 1, gap: 3 },
  rowLine: { height: 3, borderRadius: 2, backgroundColor: colors.creamDk },
  rowLineFaint: { opacity: 0.55 },
  rowDots: { flexDirection: 'row', gap: 2.5 },
  rowDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.creamDk },
  rowDotOn: { backgroundColor: colors.teal },

  // ── Scene 3 ──
  houseWrap: { alignItems: 'center' },
  // Triangle via the border trick — the same one WorkplaceCallout's tail uses.
  roof: {
    width: 0, height: 0,
    borderLeftWidth: 38, borderRightWidth: 38, borderBottomWidth: 26,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: colors.ink,
  },
  houseBody: {
    width: 58, height: 40,
    backgroundColor: colors.ink,
    borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
    alignItems: 'center', justifyContent: 'flex-end',
  },
  door: {
    width: 16, height: 22,
    backgroundColor: colors.cream,
    borderTopLeftRadius: 8, borderTopRightRadius: 8,
  },
  checkBadge: {
    position: 'absolute', right: -12, bottom: -4,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.green,
    borderWidth: 2.5, borderColor: colors.cream,
  },
  // Short leg: (5,12) -> (10,17). Long leg: (10,17) -> (20,7). They share
  // vertex (10,17) exactly because each rotates around its OWN start point
  // (transformOrigin '0% 50%'), not its centre.
  checkShort: {
    position: 'absolute',
    left: 5, top: 10.7,
    width: 7.1, height: 2.6, borderRadius: 1.3,
    backgroundColor: colors.white,
    transform: [{ rotate: '45deg' }],
    transformOrigin: '0% 50%',
  },
  checkLong: {
    position: 'absolute',
    left: 10, top: 15.7,
    width: 14.1, height: 2.6, borderRadius: 1.3,
    backgroundColor: colors.white,
    transform: [{ rotate: '-45deg' }],
    transformOrigin: '0% 50%',
  },
});
