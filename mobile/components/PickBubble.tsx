import { Pressable, StyleSheet, Text } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { colors, fonts } from '../theme';
import type { PickWithLocation } from './PicksCarousel';

interface Props {
  pick: PickWithLocation;
  rank: number;
  centered: boolean;
  onPress: () => void;
}

/**
 * A top-10 pick's own marker on the map — deep teal (colors.pinTop), NOT
 * the web app's purple "Maloca Top Picks" badges. That precedent was
 * explicitly rejected for this rebuild (2026-08-23): "I hate purple, never
 * use purple or AI slop colours." Teal was chosen specifically because it
 * sits apart from every other colour already on this map — green/amber/red
 * (AI verdicts), teal (the region + slider), blue (workplace-adjacent
 * pins) — without reaching for a generic saturated hue.
 *
 * Uses Marker, not ViewAnnotation — same fix as WorkplacePin earlier this
 * session: ViewAnnotation is composited INSIDE the map on Android and
 * ignores RN's zIndex/layering, which is exactly the bug that made
 * workplace pins vanish under the area circles. Marker sits genuinely
 * above the map.
 *
 * Sizing is a plain style change, not a MapLibre expression — each bubble
 * is its own React view (a handful at most, never hundreds), so "grow the
 * centered one" is just conditional styling driven by carousel scroll
 * position, no GL layer trickery needed.
 */
export function PickBubble({ pick, rank, centered, onPress }: Props) {
  return (
    <Marker lngLat={[pick.lng, pick.lat]}>
      <Pressable onPress={onPress} hitSlop={6}>
        <Text style={[
          styles.bubble,
          centered ? styles.bubbleCentered : styles.bubbleDimmed,
        ]}>
          {rank}
        </Text>
      </Pressable>
    </Marker>
  );
}

const BASE = 26;
const CENTERED = Math.round(BASE * 1.2); // "slightly bigger and bolder" when in focus
const DIMMED = Math.round(BASE * 0.85);  // "slightly smaller" for everything else

const shared = {
  textAlign: 'center' as const,
  fontFamily: fonts.bold,
  borderRadius: 999,
  overflow: 'hidden' as const,
  color: colors.white,
  backgroundColor: colors.pinTop,
  borderWidth: 2,
  borderColor: colors.white,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.22,
  shadowRadius: 3,
};

const styles = StyleSheet.create({
  bubble: { ...shared, width: BASE, height: BASE, lineHeight: BASE - 4, fontSize: 12 },
  bubbleCentered: {
    width: CENTERED, height: CENTERED, lineHeight: CENTERED - 4, fontSize: 14,
    borderWidth: 3, borderColor: colors.ink,
  },
  bubbleDimmed: { width: DIMMED, height: DIMMED, lineHeight: DIMMED - 4, fontSize: 10, opacity: 0.75 },
});
