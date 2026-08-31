import { memo, useCallback, useRef } from 'react';
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
   */
  why?: AnchorEvidence;
}

const CARD_WIDTH = 176;
const CARD_GAP = spacing.sm;
const STRIDE = CARD_WIDTH + CARD_GAP;

interface Props {
  picks: PickWithLocation[];
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
      <View style={styles.topRow}>
        <Text style={styles.rank}>{rank}</Text>
        <Text style={styles.name} numberOfLines={1}>{pick.neighbourhood}</Text>
        {pick.visited && <Text style={styles.visitedDot}>●</Text>}
      </View>
      {/* The whole point of the second line: every suggestion says which of
          THEIR areas it came from, so ten derived answers stop looking like
          ten guesses. Absent on the placeholder and on the model-led path,
          where there is genuinely no resemblance to claim. */}
      {pick.why && (
        <Text style={styles.like} numberOfLines={1}>
          like {pick.why.anchor}
        </Text>
      )}
    </Pressable>
  );
});

export function PicksCarousel({ picks, onCenterChange, onOpen }: Props) {
  const lastCentered = useRef<string | null>(null);

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
      const index = Math.round(e.nativeEvent.contentOffset.x / STRIDE);
      const pick = picks[Math.max(0, Math.min(index, picks.length - 1))];
      if (pick && pick.neighbourhood !== lastCentered.current) {
        lastCentered.current = pick.neighbourhood;
        onCenterChange(pick);
      }
    },
    [picks, onCenterChange],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: PickWithLocation; index: number }) => (
      <PickCard pick={item} rank={index + 1} onOpen={onOpen} />
    ),
    [onOpen],
  );

  /** Fixed-width cards, so FlatList never needs to measure them. */
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: STRIDE, offset: STRIDE * index, index }),
    [],
  );

  if (picks.length === 0) return null;

  return (
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
  );
}

const styles = StyleSheet.create({
  // Two lines now: the area, and which of their own areas it resembles.
  // A reason line was removed in 2026-08-23 because it was the model's
  // prose; this is different — it is the provenance, and it is the thing
  // that makes the list read as derived rather than assembled.
  //
  // Was 44 while index.tsx reserved 60 for the same strip, so the card was
  // being clipped — part of why the pills felt skinny.
  strip: { maxHeight: 62 },
  list: { paddingHorizontal: spacing.lg, gap: CARD_GAP },
  card: {
    width: CARD_WIDTH,
    justifyContent: 'center',
    gap: 1,
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
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rank: { fontSize: 10, fontFamily: fonts.bold, color: colors.teal },
  name: { flex: 1, fontSize: 13, fontFamily: fonts.bold, color: colors.ink },
  visitedDot: { fontSize: 8, color: colors.green },
  like: { fontSize: 11, fontFamily: fonts.regular, color: colors.anchorRose, marginLeft: 16 },
});
