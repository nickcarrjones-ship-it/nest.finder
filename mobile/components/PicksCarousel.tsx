import { memo, useCallback, useRef, useState } from 'react';
import {
  FlatList, Pressable, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { ShortlistEntry } from '../store/shortlistStore';
import type { AnchorEvidence } from '../lib/ranking/anchor';

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
  return (
    <Pressable style={styles.card} onPress={() => onOpen(pick)}>
      <Text style={styles.rank}>{rank}</Text>
      <Text style={styles.name} numberOfLines={1}>{pick.neighbourhood}</Text>
      {pick.visited && <Text style={styles.visitedDot}>●</Text>}
    </Pressable>
  );
});

export function PicksCarousel({ picks, title, onCenterChange, onOpen }: Props) {
  const lastCentered = useRef<string | null>(null);
  const [index, setIndex] = useState(0);

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
  // One line again. The "like Clapham Common" second line came off on
  // 2026-09-01 — it said the same thing on all ten cards, which is no
  // information at all, and the detail card says it better.
  strip: { maxHeight: 40 },
  list: { paddingHorizontal: spacing.lg, gap: CARD_GAP },
  card: {
    width: CARD_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  rank: { fontSize: 10, fontFamily: fonts.bold, color: colors.teal },
  name: { flex: 1, fontSize: 13, fontFamily: fonts.bold, color: colors.ink },
  visitedDot: { fontSize: 8, color: colors.green },
});
