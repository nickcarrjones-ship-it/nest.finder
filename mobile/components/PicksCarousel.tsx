import { useCallback, useRef } from 'react';
import {
  FlatList, Pressable, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { ShortlistEntry } from '../store/shortlistStore';

export interface PickWithLocation extends ShortlistEntry {
  lat: number;
  lng: number;
}

const CARD_WIDTH = 132;
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
export function PicksCarousel({ picks, onCenterChange, onOpen }: Props) {
  const lastCentered = useRef<string | null>(null);

  const handleScroll = useCallback(
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

  if (picks.length === 0) return null;

  return (
    <FlatList
      horizontal
      data={picks}
      keyExtractor={(p) => p.neighbourhood}
      showsHorizontalScrollIndicator={false}
      snapToInterval={STRIDE}
      decelerationRate="fast"
      onScroll={handleScroll}
      scrollEventThrottle={32}
      contentContainerStyle={styles.list}
      style={styles.strip}
      renderItem={({ item, index }) => (
        <Pressable style={styles.card} onPress={() => onOpen(item)}>
          <Text style={styles.rank}>{index + 1}</Text>
          <Text style={styles.name} numberOfLines={1}>{item.neighbourhood}</Text>
          {item.visited && <Text style={styles.visitedDot}>●</Text>}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  // Shrunk from an 84pt card with a reason line to a single-row pill with
  // just the name (2026-08-23) — the AI's reasoning is one tap away on the
  // detail card, not something the glance-height strip needs to carry.
  strip: { maxHeight: 44 },
  list: { paddingHorizontal: spacing.lg, gap: CARD_GAP },
  card: {
    width: CARD_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  rank: { fontSize: 10, fontFamily: fonts.bold, color: colors.terracotta },
  name: { flex: 1, fontSize: 12.5, fontFamily: fonts.bold, color: colors.ink },
  visitedDot: { fontSize: 8, color: colors.green },
});
