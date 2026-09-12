import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import { effectiveLovedOrder } from '../lib/lovedAreas';

/**
 * The first-load walkthrough — third pass (Nick, 2026-09-11).
 *
 * v1 coach-marked the real tab bar/carousel/love button, which read as a
 * teal box stuck on top of the app. v2 replaced it with an illustrated
 * dark takeover, which Nick called "a bit crap" and wanted to look more
 * premium. This version is neither: it recreates the app's OWN screens —
 * same cream background, same tab bar, same card and bubble styling, same
 * fonts — and a small animated cursor taps through them on its own, while
 * a banner up top says what's actually happening ("Maloca is cooking,
 * while you wait, view the tutorial"). Nothing here is really tappable;
 * every "tap" is the cursor's, scripted, so nobody can wander off into a
 * half-loaded real screen mid-walkthrough.
 *
 * Six scripted beats, matching the six things Nick asked to be shown in
 * order: the tabs, tapping a suggested card, loving it, saying why, the
 * Agent, then Viewings and the Rightmove handoff. Each beat auto-plays the
 * moment it's reached; Next/Skip are always live regardless of whether the
 * animation has finished, so nobody is stuck waiting on it.
 */
interface Props {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

const TAB_ICONS = {
  map: require('../assets/tab-icons/map.png'),
  agent: require('../assets/tab-icons/agent.png'),
  viewings: require('../assets/tab-icons/viewings.png'),
  settings: require('../assets/tab-icons/settings.png'),
} as const;
type TabKey = keyof typeof TAB_ICONS;
const TABS: { key: TabKey; label: string }[] = [
  { key: 'map', label: 'Map' },
  { key: 'agent', label: 'Agent' },
  { key: 'viewings', label: 'Viewings' },
  { key: 'settings', label: 'Settings' },
];

const CAPTIONS = [
  { title: 'Get around the app', body: 'Map, Agent, Viewings and Settings — jump between them any time.' },
  { title: 'Tap a card for more', body: "Any suggested area opens straight up — schools, commute, what it's like." },
  { title: 'Love the ones that fit', body: 'One tap adds it to your loved areas and steers everything else Maloca finds.' },
  { title: 'Say what you like about it', body: "That's what tells Maloca which OTHER areas to suggest next." },
  { title: 'Ask the Agent anything', body: 'Same conversation, any time — it remembers everything you\'ve told it.' },
  { title: 'Ready to view? Straight to Rightmove', body: 'One tap opens a filtered search for exactly the area you\'re looking at.' },
] as const;

// ── A small animated "finger" that drives every demo tap ─────────────────

function useCursor() {
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  function appear() {
    return new Promise<void>((resolve) => {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => resolve());
    });
  }
  function vanish() {
    return new Promise<void>((resolve) => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => resolve());
    });
  }
  function warpTo(x: number, y: number) {
    pos.setValue({ x, y });
  }
  function moveTo(x: number, y: number, duration = 620) {
    return new Promise<void>((resolve) => {
      Animated.timing(pos, {
        toValue: { x, y },
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => resolve());
    });
  }
  function tap() {
    return new Promise<void>((resolve) => {
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.62, duration: 100, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start(() => resolve());
    });
  }
  function wait(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  return { pos, scale, opacity, appear, vanish, warpTo, moveTo, tap, wait };
}
type Cursor = ReturnType<typeof useCursor>;

function CursorDot({ cursor }: { cursor: Cursor }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cursor,
        {
          opacity: cursor.opacity,
          transform: [...cursor.pos.getTranslateTransform(), { scale: cursor.scale }],
        },
      ]}
    >
      <View style={styles.cursorRing} />
      <View style={styles.cursorDot} />
    </Animated.View>
  );
}

// ── The (fake, non-interactive) tab bar — same icons, same layout ────────

function MockTabBar({ active, width, bottomInset }: { active: TabKey; width: number; bottomInset: number }) {
  return (
    <View style={[styles.tabBar, { paddingBottom: bottomInset || spacing.sm }]}>
      {TABS.map(({ key, label }) => (
        <View key={key} style={styles.tabItem}>
          <Image
            source={TAB_ICONS[key]}
            style={[styles.tabIcon, { opacity: key === active ? 1 : 0.45 }]}
            resizeMode="contain"
          />
          <Text style={[styles.tabLabel, key === active && styles.tabLabelActive]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// Where each tab icon sits, as a fraction of screen width — matches four
// evenly spaced items, same as the real tab bar's flex layout.
function tabX(key: TabKey, width: number): number {
  const i = TABS.findIndex((t) => t.key === key);
  return (width / TABS.length) * (i + 0.5);
}

// ── Scene: the map, with a couple of suggested-area cards ────────────────

function MapBackdrop() {
  return (
    <View style={styles.mapBackdrop} pointerEvents="none">
      {/* An impression of London, not a real map — a curved river and a
          few soft area blobs read as "a map" without the weight of
          spinning up a real tile layer for a mock that nobody can pan. */}
      <View style={styles.river} />
      <View style={[styles.blob, { top: '18%', left: '20%', backgroundColor: colors.tealSoft }]} />
      <View style={[styles.blob, { top: '30%', left: '62%', backgroundColor: colors.anchorRoseSoft }]} />
      <View style={[styles.blob, { top: '55%', left: '38%', backgroundColor: colors.tealSoft }]} />
    </View>
  );
}

function MockCard({ name, loved, rank }: { name: string; loved?: boolean; rank: number }) {
  return (
    <View style={[styles.card, loved ? styles.cardLoved : styles.cardPick]}>
      {loved && <Text style={styles.cardHeart}>♥</Text>}
      <Text style={styles.cardRank}>{rank}</Text>
      <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
    </View>
  );
}

// ── Scene: the area detail sheet — love button, then the "why" chips ─────

const WHY_CHIPS = ['Green space', 'Good schools', 'Nightlife'];

function DetailSheet({
  name,
  loved,
  chosenChip,
  progress,
}: {
  name: string;
  loved: boolean;
  chosenChip: number | null;
  progress: Animated.Value;
}) {
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [340, 0] });
  return (
    <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHeaderRow}>
        <Text style={styles.sheetTitle}>{name}</Text>
        {loved && <Text style={styles.sheetHeart}>♥</Text>}
      </View>
      <Text style={styles.sheetMeta}>Schools rated Good · 28 min to Canary Wharf</Text>

      <View style={[styles.loveBtn, loved && styles.loveBtnOn]}>
        <Text style={[styles.loveBtnText, loved && styles.loveBtnTextOn]}>
          {loved ? '♥ Loved' : '♥ Love this area'}
        </Text>
      </View>

      <Text style={styles.sheetPrompt}>What do you like about it?</Text>
      <View style={styles.chipRow}>
        {WHY_CHIPS.map((c, i) => (
          <View key={c} style={[styles.chip, chosenChip === i && styles.chipOn]}>
            <Text style={[styles.chipText, chosenChip === i && styles.chipTextOn]}>{c}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ── Scene: a mock Agent transcript ────────────────────────────────────────

function AgentTranscript({ askedFollowUp }: { askedFollowUp: boolean }) {
  return (
    <View style={styles.transcript}>
      <View style={[styles.bubble, styles.bubbleAgent]}>
        <Text style={styles.bubbleText}>Which areas are you already looking at, or love?</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleMine]}>
        <Text style={[styles.bubbleText, styles.bubbleTextMine]}>Clapham and Islington</Text>
      </View>
      {askedFollowUp && (
        <View style={[styles.bubble, styles.bubbleAgent]}>
          <Text style={styles.bubbleText}>What is it about there that you like?</Text>
        </View>
      )}
    </View>
  );
}

// ── Scene: Viewings, then the Rightmove handoff ───────────────────────────

function ViewingsPreview({ rightmoveTapped }: { rightmoveTapped: boolean }) {
  return (
    <View style={styles.viewingsCard}>
      <Text style={styles.viewingsTitle}>Your viewings</Text>
      <Text style={styles.viewingsBody}>Track visits and notes here once you start booking them in.</Text>
      <View style={[styles.rightmoveBtn, rightmoveTapped && styles.rightmoveBtnOn]}>
        <Text style={styles.rightmoveBtnText}>{rightmoveTapped ? 'Opening Rightmove…' : 'Rightmove Search'}</Text>
      </View>
    </View>
  );
}

// ── The tour itself ───────────────────────────────────────────────────────

export function OnboardingTour({ step, onNext, onSkip }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const cursor = useCursor();
  const runId = useRef(0);

  const [activeTab, setActiveTab] = useState<TabKey>('map');
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const [loved, setLoved] = useState(false);
  const [chosenChip, setChosenChip] = useState<number | null>(null);
  const [followUpAsked, setFollowUpAsked] = useState(false);
  const [rightmoveTapped, setRightmoveTapped] = useState(false);

  const areaCards = useProfileStore((s) => s.profile.areaCards);
  const lovedOrder = useProfileStore((s) => s.profile.lovedOrder);
  const demoAreaName = useMemo(() => {
    const real = effectiveLovedOrder(areaCards, lovedOrder)[0];
    return real ?? 'Tooting Broadway';
  }, [areaCards, lovedOrder]);

  const TAB_BAR_H = 58;
  const cardsY = height - insets.bottom - TAB_BAR_H - 44;
  const tabsY = height - insets.bottom - TAB_BAR_H / 2;

  function openSheet() {
    return new Promise<void>((resolve) => {
      Animated.timing(sheetProgress, { toValue: 1, duration: 380, useNativeDriver: true }).start(() => resolve());
    });
  }
  function closeSheet() {
    return new Promise<void>((resolve) => {
      Animated.timing(sheetProgress, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => resolve());
    });
  }

  // Each step is its own scripted animation. Cancellable via `runId` so an
  // early Next/Skip never keeps moving the cursor after the scene has
  // already moved on.
  useEffect(() => {
    const id = ++runId.current;
    const alive = () => runId.current === id;

    async function play() {
      cursor.warpTo(width / 2, height / 2);
      await cursor.appear();
      if (!alive()) return;

      if (step === 0) {
        // Tabs: cycle Map → Agent → Viewings → Settings → back to Map.
        setActiveTab('map');
        for (const key of ['agent', 'viewings', 'settings', 'map'] as TabKey[]) {
          await cursor.moveTo(tabX(key, width), tabsY);
          if (!alive()) return;
          await cursor.tap();
          if (!alive()) return;
          setActiveTab(key);
          await cursor.wait(320);
        }
      } else if (step === 1) {
        // Tap a suggested card.
        setActiveTab('map');
        await cursor.moveTo(width * 0.28, cardsY);
        if (!alive()) return;
        await cursor.tap();
        if (!alive()) return;
        await openSheet();
      } else if (step === 2) {
        // Press the love button.
        await cursor.moveTo(width / 2, height * 0.56);
        if (!alive()) return;
        await cursor.tap();
        if (!alive()) return;
        setLoved(true);
      } else if (step === 3) {
        // Pick a "why".
        await cursor.moveTo(width * 0.28, height * 0.68);
        if (!alive()) return;
        await cursor.tap();
        if (!alive()) return;
        setChosenChip(0);
      } else if (step === 4) {
        // Close the sheet, open the Agent tab.
        await closeSheet();
        if (!alive()) return;
        await cursor.moveTo(tabX('agent', width), tabsY);
        if (!alive()) return;
        await cursor.tap();
        if (!alive()) return;
        setActiveTab('agent');
        await cursor.wait(700);
        if (!alive()) return;
        setFollowUpAsked(true);
      } else if (step === 5) {
        // Viewings, then Rightmove.
        await cursor.moveTo(tabX('viewings', width), tabsY);
        if (!alive()) return;
        await cursor.tap();
        if (!alive()) return;
        setActiveTab('viewings');
        await cursor.wait(500);
        if (!alive()) return;
        await cursor.moveTo(width / 2, height * 0.5);
        if (!alive()) return;
        await cursor.tap();
        if (!alive()) return;
        setRightmoveTapped(true);
      }

      await cursor.wait(500);
      if (!alive()) return;
      await cursor.vanish();
    }

    void play();
    return () => {
      runId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const caption = CAPTIONS[step] ?? CAPTIONS[0];
  const isLast = step >= 5;

  return (
    <View style={styles.root}>
      {/* What's actually happening, so this never reads as a broken loading
          screen (Nick, 2026-09-11: "Maloca is cooking... while you wait,
          view the tutorial"). */}
      <View style={[styles.banner, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.bannerTopRow}>
          <View style={styles.bannerLead}>
            <View style={styles.cookingDot} />
            <Text style={styles.bannerCooking}>Maloca is cookin' — while you wait, view the tutorial</Text>
          </View>
          <View style={styles.bannerActions}>
            <Pressable onPress={onSkip} hitSlop={8}>
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
            <Pressable style={styles.next} onPress={onNext} accessibilityRole="button">
              <Text style={styles.nextText}>{isLast ? 'Got it' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.captionTitle}>{caption.title}</Text>
        <Text style={styles.captionBody}>{caption.body}</Text>
      </View>

      {/* The scene: the real app's own look, driven by the script above. */}
      <View style={styles.screen}>
        <MapBackdrop />

        {(step === 1 || step === 2 || step === 3) && (
          <View style={[styles.cardsRow, { bottom: height - cardsY - 34 }]}>
            <MockCard name={demoAreaName} rank={1} />
            <MockCard name="Battersea" rank={2} />
          </View>
        )}

        {step === 4 && <AgentTranscript askedFollowUp={followUpAsked} />}
        {step === 5 && <ViewingsPreview rightmoveTapped={rightmoveTapped} />}

        {(step === 1 || step === 2 || step === 3) && (
          <View style={styles.sheetWrap}>
            <DetailSheet name={demoAreaName} loved={loved} chosenChip={chosenChip} progress={sheetProgress} />
          </View>
        )}
      </View>

      <MockTabBar active={activeTab} width={width} bottomInset={insets.bottom} />

      <View style={styles.dots}>
        {CAPTIONS.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <CursorDot cursor={cursor} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...(StyleSheet.absoluteFill as object), backgroundColor: colors.cream },

  banner: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 4,
  },
  bannerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerLead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  cookingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal },
  bannerCooking: { ...type.tab, fontSize: 10.5, color: colors.inkMid, letterSpacing: 0.3, flexShrink: 1 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skip: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkLt },
  next: { backgroundColor: colors.teal, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 18 },
  nextText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
  captionTitle: { ...type.title, fontSize: 19, color: colors.ink, marginTop: spacing.xs },
  captionBody: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.inkMid, lineHeight: 19 },

  screen: { flex: 1, overflow: 'hidden' },

  mapBackdrop: { ...(StyleSheet.absoluteFill as object), backgroundColor: colors.creamMid },
  river: {
    position: 'absolute',
    top: '42%',
    left: -40,
    right: -40,
    height: 46,
    backgroundColor: '#DCE7E6',
    borderRadius: 40,
    transform: [{ rotate: '-6deg' }],
  },
  blob: { position: 'absolute', width: 120, height: 120, borderRadius: 60 },

  cardsRow: { position: 'absolute', left: spacing.lg, flexDirection: 'row', gap: spacing.sm },
  card: {
    width: 132,
    height: 68,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.sm,
    justifyContent: 'center',
    gap: 2,
  },
  cardPick: { backgroundColor: colors.white, borderColor: colors.tealLine },
  cardLoved: { backgroundColor: colors.white, borderColor: colors.anchorRose },
  cardHeart: { position: 'absolute', top: 6, right: 8, fontSize: 13, color: colors.anchorRose },
  cardRank: { ...type.tab, fontSize: 10, color: colors.inkGhost },
  cardName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },

  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.creamDk,
    alignSelf: 'center', marginBottom: spacing.xs,
  },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...type.title, fontSize: 20, color: colors.ink },
  sheetHeart: { fontSize: 20, color: colors.anchorRose },
  sheetMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkLt },

  loveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.anchorRoseLine,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: spacing.xs,
  },
  loveBtnOn: { backgroundColor: colors.anchorRose, borderColor: colors.anchorRose },
  loveBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.anchorRose },
  loveBtnTextOn: { color: colors.white },

  sheetPrompt: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMid },
  chipTextOn: { fontFamily: fonts.semibold, color: colors.white },

  transcript: { flex: 1, justifyContent: 'flex-end', padding: spacing.lg, gap: spacing.sm },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  bubbleAgent: { backgroundColor: colors.tealSoft, borderWidth: 1, borderColor: colors.tealLine, alignSelf: 'flex-start' },
  bubbleMine: { backgroundColor: colors.ink, alignSelf: 'flex-end' },
  bubbleText: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink, lineHeight: 19 },
  bubbleTextMine: { color: colors.cream },

  viewingsCard: {
    margin: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  viewingsTitle: { ...type.title, fontSize: 18, color: colors.ink },
  viewingsBody: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.inkMid, lineHeight: 19 },
  rightmoveBtn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  rightmoveBtnOn: { backgroundColor: colors.inkMid },
  rightmoveBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    paddingTop: spacing.sm,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon: { width: 22, height: 22 },
  tabLabel: { ...type.tab, color: colors.inkLt },
  tabLabelActive: { color: colors.teal },

  dots: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 68,
    flexDirection: 'row',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.creamDk },
  dotActive: { backgroundColor: colors.teal, width: 16 },

  cursor: {
    position: 'absolute',
    top: -14,
    left: -14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cursorRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(46,125,122,0.18)',
  },
  cursorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.teal,
    borderWidth: 2,
    borderColor: colors.white,
  },
});
