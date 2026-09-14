import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';

/**
 * The first-run walkthrough, third attempt (Nick, 2026-09-14).
 *
 * The first two tried to SHOW the app: a shrunken fake screen with its own
 * fake tab bar, scripted taps and a cursor moving about. Both were
 * rejected, and the second landed as "three blobs on a cream background
 * with a blue line through the middle" — a miniature of a map that never
 * rendered, next to a duplicate of a tab bar the person could already see
 * an inch below it.
 *
 * So this one shows nothing. The REAL map is behind it, mid-ranking, with
 * the REAL tab bar underneath and the REAL area cards where they will
 * always be. All this adds is a small bubble that names what is already on
 * screen, and a tap to move on.
 *
 * The tab bar belongs to the navigator rather than to this screen, so an
 * overlay here cannot cover it — it stays bright and undimmed underneath,
 * which is precisely what the first step needs to point at.
 */

const TAB_ICONS = {
  map: require('../assets/tab-icons/map.png'),
  agent: require('../assets/tab-icons/agent.png'),
  viewings: require('../assets/tab-icons/viewings.png'),
  settings: require('../assets/tab-icons/settings.png'),
} as const;

interface TabLine {
  icon: keyof typeof TAB_ICONS;
  name: string;
  what: string;
}

const TABS: TabLine[] = [
  {
    icon: 'map',
    name: 'Map',
    what: 'Where you are now — your commute zone, the areas you love, and the ones Maloca finds for you.',
  },
  {
    icon: 'agent',
    name: 'Agent',
    what: 'Ask anything about anywhere in London. Answers come from the data, not from guesswork.',
  },
  {
    icon: 'viewings',
    name: 'Viewings',
    what: 'Paste a Rightmove link and it lands here — in your calendar, on your map, and scored against what matters to you.',
  },
  {
    icon: 'settings',
    name: 'Settings',
    what: 'Your account, the people you share with, and your data.',
  },
];

type Anchor = 'tabs' | 'carousel';

interface Step {
  title: string;
  body?: string;
  tabs?: boolean;
  anchor: Anchor;
}

/**
 * Four beats, in the order somebody actually needs them: where everything
 * lives, what the row of cards is, what a card is telling you, and what
 * happens when you say you like one.
 */
const STEPS: Step[] = [
  {
    title: 'Four tabs, four jobs',
    tabs: true,
    anchor: 'tabs',
  },
  {
    title: 'These are your areas',
    body: 'Swipe along the row. The ones you told us you love sit alongside the ones Maloca has gone and found for you.',
    anchor: 'carousel',
  },
  {
    title: "What a card is telling you",
    body: '“Yours” means you named it yourself. A match badge means Maloca found it and how strongly it fits. The price is what a home there typically goes for, and the arrow is which way it has been moving.',
    anchor: 'carousel',
  },
  {
    title: 'Tap one to go deeper',
    body: 'A card opens up to show why it matched — the things it shares with the places you already like. Tap the heart and it becomes one of yours, and everything else re-ranks around it.',
    anchor: 'carousel',
  },
];

export const TOUR_STEPS = STEPS.length;

interface Props {
  step: number;
  onNext: () => void;
  onSkip: () => void;
  /** How far the picks carousel sits above the tab bar, and how tall it
   *  is — so a bubble anchored to it clears it instead of covering the
   *  very thing it is describing. Both come from the map screen, which
   *  owns that geometry. */
  carouselBottom: number;
  carouselHeight: number;
}

export function OnboardingTour({
  step,
  onNext,
  onSkip,
  carouselBottom,
  carouselHeight,
}: Props) {
  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const last = step >= STEPS.length - 1;

  // Above the cards when it is talking about the cards; hard against the
  // tab bar when it is talking about the tabs.
  const bottom =
    current.anchor === 'carousel'
      ? carouselBottom + carouselHeight + spacing.sm
      : spacing.sm;

  return (
    <Pressable style={styles.overlay} onPress={onNext} accessibilityRole="button">
      {/* Light enough to read the map through — it is the thing being
          talked about, and the previous version's habit of hiding it was
          half of what made it useless. */}
      <View style={styles.dim} pointerEvents="none" />

      <View style={[styles.bubble, { bottom }]}>
        <View style={styles.head}>
          <Text style={styles.count}>{step + 1} OF {STEPS.length}</Text>
          <Pressable onPress={onSkip} hitSlop={10} accessibilityRole="button">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>{current.title}</Text>

        {current.tabs ? (
          <View style={styles.tabList}>
            {TABS.map((tab) => (
              <View key={tab.name} style={styles.tabRow}>
                <Image source={TAB_ICONS[tab.icon]} style={styles.tabIcon} resizeMode="contain" />
                <Text style={styles.tabText}>
                  <Text style={styles.tabName}>{tab.name}</Text>
                  {'  '}
                  {tab.what}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.body}>{current.body}</Text>
        )}

        <View style={styles.footer}>
          <View style={styles.dots}>
            {STEPS.map((s, i) => (
              <View key={s.title} style={[styles.dot, i === step && styles.dotOn]} />
            ))}
          </View>
          <Pressable style={styles.next} onPress={onNext} accessibilityRole="button">
            <Text style={styles.nextText}>{last ? 'Got it' : 'Next'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Points at whatever the bubble is about — the tabs below it, or the
          row of cards below it. */}
      <View style={[styles.pointer, { bottom: bottom - 7 }]} pointerEvents="none" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...(StyleSheet.absoluteFill as object) },
  dim: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(34,40,46,0.22)' },

  bubble: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: colors.ink,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pointer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -8,
    width: 16,
    height: 16,
    backgroundColor: colors.paper,
    transform: [{ rotate: '45deg' }],
    borderRadius: 3,
  },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1.4, color: colors.inkGhost },
  skip: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkLt },

  title: { ...type.title, fontSize: 19, color: colors.ink },
  body: { ...type.body, fontSize: 14.5, color: colors.inkMid, lineHeight: 20 },

  tabList: { gap: spacing.sm },
  tabRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  tabIcon: { width: 20, height: 20, marginTop: 1 },
  tabText: { flex: 1, fontFamily: fonts.regular, fontSize: 13.5, color: colors.inkMid, lineHeight: 18.5 },
  tabName: { fontFamily: fonts.semibold, color: colors.ink },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.creamDk },
  dotOn: { backgroundColor: colors.teal, width: 16 },
  next: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 20,
  },
  nextText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
});
