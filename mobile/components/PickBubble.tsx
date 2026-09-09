import { Pressable, StyleSheet, Text } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { colors, fonts } from '../theme';
import type { PickWithLocation } from './PicksCarousel';

interface Props {
  pick: PickWithLocation;
  rank: number;
  centered: boolean;
  onPress: () => void;
  /**
   * Teal for the AI's own picks, rose for a loved area (Nick, 2026-09-09).
   *
   * Loved areas used to be a separate component (AnchorPin) — an unlabelled
   * dot you tapped to reveal a name that then faded again. Nick wanted that
   * whole mechanism gone, replaced with exactly this one: a numbered
   * bubble you tap to open the same detail card every other pick opens.
   * One component, one interaction, a colour is the only difference.
   */
  tone?: 'teal' | 'rose';
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
export function PickBubble({ pick, rank, centered, onPress, tone = 'teal' }: Props) {
  return (
    <Marker lngLat={[pick.lng, pick.lat]}>
      <Pressable onPress={onPress} hitSlop={6}>
        <Text style={[
          styles.bubble,
          tone === 'rose' && styles.bubbleRose,
          centered ? styles.bubbleCentered : styles.bubbleDimmed,
        ]}>
          {rank}
        </Text>
      </Pressable>
    </Marker>
  );
}

const BORDER = 2;
const BORDER_CENTERED = 3;
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
  borderWidth: BORDER,
  borderColor: colors.white,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.22,
  shadowRadius: 3,
};

/**
 * The number sits in the CONTENT box, which is the bubble minus its border
 * on both sides — so a line height has to be derived from the border it is
 * sitting inside, not from the outer size.
 *
 * That was the bug (Nick, 2026-09-08): every size used `size - 4`, which is
 * right for a 2pt border and wrong for the centred bubble, because that one
 * thickens its border to 3. Its content box is 6pt shorter than its outer
 * size while the line was still being laid out as though it were 4 — so the
 * digit sat low, and only on the bubble you had just tapped.
 */
const inner = (size: number, border: number) => size - border * 2;

const styles = StyleSheet.create({
  bubble: {
    ...shared, width: BASE, height: BASE,
    lineHeight: inner(BASE, BORDER), fontSize: 12,
  },
  bubbleCentered: {
    width: CENTERED, height: CENTERED,
    lineHeight: inner(CENTERED, BORDER_CENTERED), fontSize: 14,
    borderWidth: BORDER_CENTERED, borderColor: colors.ink,
  },
  bubbleDimmed: {
    width: DIMMED, height: DIMMED,
    lineHeight: inner(DIMMED, BORDER), fontSize: 10, opacity: 0.75,
  },
  // Just the fill — size, border and dimming all come from the styles
  // already above, in the same order for either tone, so a loved area's
  // bubble grows and dims exactly the way an AI pick's does.
  bubbleRose: { backgroundColor: colors.anchorRose },
});
