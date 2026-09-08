import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, FlatList, Pressable, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { ShortlistEntry } from '../store/shortlistStore';
import type { AnchorEvidence } from '../lib/ranking/anchor';
import { matchStrength, STRENGTH_LABEL } from '../lib/ranking/matchStrength';
import { compareToLoved, formatMedian, medianFor, trendFor } from '../lib/areaPrices';
import { useProfileStore } from '../store/profileStore';

export interface PickWithLocation extends ShortlistEntry {
  lat: number;
  lng: number;
  /**
   * Which loved area this one resembles, and on what.
   *
   * Optional on purpose: the walk-budget placeholder has no evidence, and
   * neither does the model-led path taken by someone new to London who
   * named nowhere. Absent means "no reason to show", never an error.
   *
   * No longer drawn on the card itself — it belongs on the detail card,
   * where there is room to be honest about how close the match is. See the
   * note on the card below.
   */
  why?: AnchorEvidence;
}

/**
 * Narrow enough that the NEXT card is always visibly cut off at the right
 * edge. That overhang is the scroll affordance — on a 390pt screen it
 * leaves roughly 60pt of a third card showing, which says "there is more
 * this way" without a chevron, a shadow or an animation (Nick, 2026-09-01).
 * At the old 176 the strip happened to fit two cards almost exactly and
 * looked like a finished row of two.
 */
const CARD_WIDTH = 148;
const CARD_GAP = spacing.sm;
const STRIDE = CARD_WIDTH + CARD_GAP;

/**
 * Room for a second row — the match badge — under the name (Nick,
 * 2026-09-02: "the height can double and still look good"). Fixed rather
 * than content-driven, so a card with no match evidence (the walk-budget
 * placeholder, or the model-led path taken by someone new to London) is
 * exactly as tall as one with a badge — see the empty badge slot in
 * PickCard below.
 */
const CARD_HEIGHT = 76;

interface Props {
  picks: PickWithLocation[];
  /** The line above the strip — what these are and where they came from. */
  title: string;
  onCenterChange: (pick: PickWithLocation) => void;
  onOpen: (pick: PickWithLocation) => void;
}

/**
 * A horizontal strip of picks sitting above the tab bar. Swiping through it
 * pans the map to each one in turn — the browsing motion IS the spatial
 * context, rather than a list you read next to a map that doesn't react.
 * Tapping a card (as opposed to scrolling past it) opens the rating sheet.
 *
 * Deliberately small — a glance-height strip, not a drawer. Nick's framing:
 * "leave a little area... to click into", not a takeover of the map.
 */
/** Memoised so a settle-driven re-render of the screen does not re-render
 *  every card in the strip. */
const PickCard = memo(function PickCard({
  pick,
  rank,
  onOpen,
}: {
  pick: PickWithLocation;
  rank: number;
  onOpen: (pick: PickWithLocation) => void;
}) {
  // Absent for the walk-budget placeholder and the model-led path — no
  // badge then, not a wrong one. The slot below still reserves its height.
  const strength = pick.why ? matchStrength(pick.why.score) : null;

  /**
   * The price, said against somewhere they already know.
   *
   * A median alone is a number people have to do arithmetic on; "£85k
   * dearer than Tooting" is the same fact already compared to the thing
   * they were comparing it to anyway. Falls back to the bare median when
   * they have named nowhere to compare against — and to nothing at all
   * where we hold too few sales to say (Land Registry, OGL).
   */
  const loved = useProfileStore((st) => st.profile.areaCards);
  const lovedNames = Object.entries(loved ?? {})
    .filter(([, v]) => v === 'love')
    .map(([k]) => k);
  const comparison = compareToLoved(pick.neighbourhood, lovedNames);
  const band = medianFor(pick.neighbourhood);
  const trend = trendFor(pick.neighbourhood);

  return (
    <Pressable style={styles.card} onPress={() => onOpen(pick)}>
      <View style={styles.row}>
        <Text style={styles.rank}>{rank}</Text>
        <Text style={styles.name} numberOfLines={1}>{pick.neighbourhood}</Text>
        {pick.visited && <Text style={styles.visitedDot}>●</Text>}
      </View>
      {band && (
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMedian(band.median)}</Text>
          {/* An arrow only where the change is big enough to have a
              direction; "flat" gets a dash, because a tiny arrow implies a
              movement the sample cannot support. */}
          {trend && (
            <Text
              style={[styles.trend, trend.direction === 'up' && styles.trendUp,
                trend.direction === 'down' && styles.trendDown]}
              accessibilityLabel={
                trend.direction === 'flat'
                  ? 'Prices about level'
                  : `Prices ${trend.direction} ${Math.abs(trend.changePct)} percent`
              }
            >
              {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '–'}
            </Text>
          )}
          {comparison && (
            <Text style={styles.compare} numberOfLines={1}>{comparison.label}</Text>
          )}
        </View>
      )}

      <View style={styles.badgeSlot}>
        {strength && (
          <View style={[styles.badge, BADGE[strength]]}>
            <Text style={[styles.badgeText, BADGE_TEXT[strength]]} numberOfLines={1}>
              {STRENGTH_LABEL[strength]}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

// Same three tones WhyThisArea's badge uses on the detail card — the
// carousel version is the same claim in miniature, not a different scale.
const BADGE = StyleSheet.create({
  strong: { backgroundColor: colors.greenBg, borderColor: colors.greenLine },
  potential: { backgroundColor: colors.amberBg, borderColor: colors.creamDk },
  loose: { backgroundColor: colors.cream, borderColor: colors.rule },
});
const BADGE_TEXT = StyleSheet.create({
  strong: { color: colors.green },
  potential: { color: colors.amber },
  loose: { color: colors.inkLt },
});

export function PicksCarousel({ picks, title, onCenterChange, onOpen }: Props) {
  const lastCentered = useRef<string | null>(null);
  const [index, setIndex] = useState(0);
  const thumbAt = useRef(new Animated.Value(0)).current;

  // Driven off the settled index, same as the camera and the counter — not
  // off onScroll, which is exactly the per-frame work that was pulled out
  // of this component on 2026-08-31 (see settle() below).
  useEffect(() => {
    Animated.timing(thumbAt, { toValue: index, duration: 220, useNativeDriver: false }).start();
  }, [index, thumbAt]);

  /**
   * Fires when the scroll SETTLES, not while it moves.
   *
   * This used to run on every throttled scroll frame, so one flick past
   * four cards fired four centre changes — each starting a 900ms camera
   * flyTo that interrupted the last, and each re-rendering the whole map
   * subtree mid-gesture. That was the jump and the buffering; the snapping
   * was never the problem (Nick, 2026-08-31).
   */
  const settle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const at = Math.max(
        0,
        Math.min(Math.round(e.nativeEvent.contentOffset.x / STRIDE), picks.length - 1),
      );
      setIndex(at);
      const pick = picks[at];
      if (pick && pick.neighbourhood !== lastCentered.current) {
        lastCentered.current = pick.neighbourhood;
        onCenterChange(pick);
      }
    },
    [picks, onCenterChange],
  );

  const renderItem = useCallback(
    ({ item, index: i }: { item: PickWithLocation; index: number }) => (
      <PickCard pick={item} rank={i + 1} onOpen={onOpen} />
    ),
    [onOpen],
  );

  /** Fixed-width cards, so FlatList never needs to measure them. */
  const getItemLayout = useCallback(
    (_: unknown, i: number) => ({ length: STRIDE, offset: STRIDE * i, index: i }),
    [],
  );

  if (picks.length === 0) return null;

  return (
    <View>
      {/* Sits on its own ground rather than straight on the map. The old
          line was italic grey text laid over whatever the basemap happened
          to be showing, and over pale streets it simply could not be read
          (Nick, 2026-09-01). */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {picks.length > 1 && (
          <Text style={styles.counter}>{index + 1}/{picks.length}</Text>
        )}
      </View>

      <FlatList
        horizontal
        data={picks}
        keyExtractor={(p) => p.neighbourhood}
        showsHorizontalScrollIndicator={false}
        snapToInterval={STRIDE}
        decelerationRate="fast"
        // One flick travels one card. Without it, "fast" deceleration carries
        // several strides and the camera has several cards to catch up on.
        disableIntervalMomentum
        onMomentumScrollEnd={settle}
        // A slow drag released without momentum never fires the above.
        onScrollEndDrag={settle}
        getItemLayout={getItemLayout}
        contentContainerStyle={styles.list}
        style={styles.strip}
        renderItem={renderItem}
      />

      {/* The scroll signal. The overhanging next card already hints there is
          more; this says where you are in the whole row, the way the
          onboarding hairline (SetupProgress.tsx) says how far through the
          questions — same "a thumb moving IS the feedback" idea, applied to
          a strip instead of a single total. */}
      {picks.length > 1 && (
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.thumb,
              {
                width: `${100 / picks.length}%`,
                left: thumbAt.interpolate({
                  inputRange: [0, Math.max(picks.length - 1, 1)],
                  outputRange: ['0%', `${100 - 100 / picks.length}%`],
                }),
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    marginLeft: spacing.lg,
    marginBottom: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    // The app's own ground, at enough opacity to lift the text off the
    // basemap without becoming another solid card on a crowded screen.
    backgroundColor: 'rgba(242,241,238,0.93)',
    maxWidth: '92%',
  },
  title: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    lineHeight: 14,
    color: colors.inkMid,
  },
  // The second half of the scroll signal: the overhanging card says there
  // is more, this says how much more.
  counter: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    color: colors.inkGhost,
    fontVariant: ['tabular-nums'],
  },
  // Grown from the old single-line 40 to fit the card's second row — see
  // CARD_HEIGHT above, which the two numbers are kept next to on purpose.
  strip: { maxHeight: CARD_HEIGHT + 6 },
  list: { paddingHorizontal: spacing.lg, gap: CARD_GAP },
  /**
   * One line: the median, a direction, and what it means against somewhere
   * they already know. Kept to a single row because the carousel card is
   * small and its job is still the NAME — this is context for the name, not
   * a second headline.
   */
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  price: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink },
  // Neutral by default. Rising prices are not good news or bad news — it
  // depends entirely on whether you are buying or already own — so the
  // arrow reports a direction and declines to colour it as a verdict.
  trend: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.inkLt },
  trendUp: { color: colors.inkMid },
  trendDown: { color: colors.inkMid },
  compare: { flex: 1, fontFamily: fonts.regular, fontSize: 11.5, color: colors.inkMid },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rank: { fontSize: 10, fontFamily: fonts.bold, color: colors.teal },
  name: { flex: 1, fontSize: 13, fontFamily: fonts.bold, color: colors.ink },
  visitedDot: { fontSize: 8, color: colors.green },
  // Reserved even when empty (no match evidence), so every card in the
  // strip holds its height — see the comment on CARD_HEIGHT.
  badgeSlot: { height: 20, justifyContent: 'center' },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 9.5 },
  // A hairline scrollbar, same idea as the onboarding progress line
  // (SetupProgress.tsx): a thumb whose position and width say where you
  // are and how much there is, without a row of dots to count.
  track: {
    height: 3,
    borderRadius: 2,
    marginTop: 7,
    marginHorizontal: spacing.lg,
    backgroundColor: 'rgba(242,241,238,0.75)',
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.teal,
  },
});
