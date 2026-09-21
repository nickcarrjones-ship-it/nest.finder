import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../theme';
import { PickDetailCard } from './PickDetailCard';
import type { PickWithLocation } from './PicksCarousel';
import type { Member } from '../lib/types';

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

/** Nick's own words, 2026-09-21, kept as he wrote them. No em dashes
 *  anywhere in app copy from that date on. */
const TABS: TabLine[] = [
  {
    icon: 'map',
    name: 'Map',
    what: "What you can see in the background - your commutable zone, the areas you've told us you love and the ones we think you should consider based on what you've told us - plus an easy way to search for properties within those areas!",
  },
  {
    icon: 'agent',
    name: 'Agent',
    what: "Ask anything about new areas you're considering. Maloca agent knows a lot about London - from residential vibe to whether an area is a weekend hotspot for fun or has a sleepier character. More to come here in the future too.",
  },
  {
    icon: 'viewings',
    name: 'Viewings',
    what: 'Set your must have criteria and get objective rankings of all of your viewings and sync them to your phone calendar. Paste a rightmove link and a property pin will drop onto the map too.',
  },
  {
    icon: 'settings',
    name: 'Settings',
    what: 'Your account, the people you share with, and your data.',
  },
];

type Anchor = 'tabs' | 'carousel' | 'top';

interface Step {
  title: string;
  body?: string;
  tabs?: boolean;
  /** Show a real area card, so the last step describes something on
   *  screen rather than something to imagine. */
  sampleCard?: boolean;
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
    body: 'Go ahead and swipe along the row. The ones you told us you love sit alongside the ones Maloca has gone and found for you.',
    anchor: 'carousel',
  },
  {
    title: 'What a card is telling you',
    body: '“Yours” means you named it yourself. A match badge means Maloca found it, and how strongly it fits. The price is what a home there typically goes for, and the arrow is which way it has been moving.',
    anchor: 'carousel',
  },
  {
    title: 'Tap one to go deeper',
    body: 'Here is what opens up: why it matched, what it shares with the places you already like, the schools nearby and what homes there cost. Tap the heart and it becomes one of yours, and everything else re-ranks around it.',
    sampleCard: true,
    anchor: 'top',
  },
];

export const TOUR_STEPS = STEPS.length;

/**
 * Earlsfield, with real numbers behind it.
 *
 * The last step used to describe a card nobody could see. It now shows
 * one (Nick, 2026-09-21), and the card is the REAL component rather than
 * a drawing of it: PickDetailCard reads prices, schools and trend from
 * the same data files the live card does, so what the tour promises and
 * what the app delivers cannot drift apart.
 *
 * Earlsfield because it is an ordinary London neighbourhood with a full
 * set of data behind it, not a headline one.
 *
 * The evidence is illustrative, and it is the one part that is: a real
 * one would name an area THIS household loves, which we cannot know while
 * writing a fixed example. Everything the card computes for itself is
 * genuine.
 */
const SAMPLE_PICK: PickWithLocation = {
  neighbourhood: 'Earlsfield',
  score: 0.82,
  reason:
    'Quiet residential streets with a high street that does the everyday jobs, a big green space in walking distance and a fast train into town.',
  confidence: 'high',
  visited: false,
  lat: 51.442337,
  lng: -0.187715,
  why: {
    anchor: 'Balham',
    score: 0.82,
    sharedTraits: ['greenSpaceHa', 'preWarShare', 'terraceShare'],
    distanceKm: 2.1,
    confidence: 'high',
  },
};

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
  /** Passed straight through to the sample card, so the walkthrough shows
   *  the household's own names rather than strangers'. */
  members: Member[];
}

export function OnboardingTour({
  step,
  onNext,
  onSkip,
  carouselBottom,
  carouselHeight,
  members,
}: Props) {
  const insets = useSafeAreaInsets();
  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const last = step >= STEPS.length - 1;

  // Above the cards when it is talking about the cards; hard against the
  // tab bar when it is talking about the tabs; at the top when a sample
  // card is filling the middle of the screen.
  const bottom =
    current.anchor === 'carousel'
      ? carouselBottom + carouselHeight + spacing.sm
      : spacing.sm;

  return (
    /**
     * box-none, and NO tap-to-advance (Nick, 2026-09-21).
     *
     * The overlay used to be one big button, so the moment somebody tried
     * to swipe the row of area cards the step it was telling them to swipe
     * skipped past them. The cards are the real ones, sitting right there,
     * and the second step says to swipe them: the tour has to let that
     * happen. Only Next and Skip move it on now.
     *
     * box-none rather than none, because the bubble's own buttons still
     * need to be pressable.
     */
    <View style={styles.overlay} pointerEvents="box-none">
      {/* No dim either. It made the area cards look faded out and
          unavailable at exactly the moment the tour is asking somebody to
          play with them. The bubble carries its own shadow and sits on
          paper, which is enough separation from a map. */}

      {current.sampleCard && (
        // Display only. It is the live card, so without this the heart,
        // the score and the Rightmove button would all be live too, and a
        // walkthrough would be writing verdicts for an area nobody has
        // been to.
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <PickDetailCard
            pick={SAMPLE_PICK}
            members={members}
            onToggleVisited={() => {}}
            onClose={() => {}}
          />
        </View>
      )}

      <View
        style={[
          styles.bubble,
          current.anchor === 'top'
            ? { top: insets.top + spacing.sm }
            : { bottom },
        ]}
      >
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
          row of cards below it. Not on the sample-card step: there the
          bubble sits above the card it is describing, so an arrow
          underneath would point at the right thing from the wrong side. */}
      {current.anchor !== 'top' && (
        <View style={[styles.pointer, { bottom: bottom - 7 }]} pointerEvents="none" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...(StyleSheet.absoluteFill as object) },

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
