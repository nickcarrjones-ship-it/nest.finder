import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { colors, fonts } from '../theme';

/**
 * A property the household is going to see.
 *
 * TERRACOTTA, and a different SHAPE from everything else on this map
 * (Nick's call, 2026-09-12). The map already carries the commute region,
 * rose numbered bubbles for areas they love, teal numbered bubbles for
 * Maloca's picks and ink workplace dots — so a fifth thing had to be
 * unmistakable at a glance, not just another coloured circle. A teardrop
 * says "a place", where a numbered bubble says "an area ranked Nth".
 *
 * Terracotta has sat on the 4b palette unused since 2026-08-25, documented
 * as an option to check with Nick before reintroducing. This is that
 * decision: viewings are a genuinely new category, which is exactly the
 * role it was held back for.
 *
 * Uses Marker for the same reason WorkplacePin does — ViewAnnotation is
 * composited inside the map surface on Android, where React Native's
 * zIndex does nothing and the pin disappears behind the area circles.
 */
interface Props {
  lng: number;
  lat: number;
  /** Shown in the callout when tapped — the address, short enough to read. */
  label: string;
  /** "Sat 14 Sep, 2:30pm", or null when nothing is booked yet. */
  when: string | null;
  /**
   * False when the listing only gave an area rather than the building.
   * Drawn hollow so the map never implies a precision the listing did not
   * claim — someone navigating to a pin should know which kind it is.
   */
  accurate: boolean;
  open: boolean;
  onPress: () => void;
}

export function ViewingPin({ lng, lat, label, when, accurate, open, onPress }: Props) {
  return (
    <Marker lngLat={[lng, lat]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.stack}>
        {open && (
          <View style={styles.bubble}>
            <Text style={styles.bubbleText} numberOfLines={1}>{label}</Text>
            {when && <Text style={styles.bubbleWhen}>{when}</Text>}
            {!accurate && <Text style={styles.bubbleApprox}>approximate location</Text>}
            <View style={styles.tail} />
          </View>
        )}
        <View style={[styles.pin, !accurate && styles.pinApprox]}>
          <View style={[styles.pinDot, !accurate && styles.pinDotApprox]} />
        </View>
      </Pressable>
    </Marker>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center' },
  bubble: {
    backgroundColor: colors.ink,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
    maxWidth: 200,
    alignItems: 'center',
  },
  bubbleText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.cream },
  bubbleWhen: { fontFamily: fonts.regular, fontSize: 11, color: colors.cream, opacity: 0.8 },
  bubbleApprox: { fontFamily: fonts.regular, fontSize: 10, color: colors.cream, opacity: 0.6 },
  tail: {
    position: 'absolute',
    bottom: -3,
    width: 7,
    height: 7,
    backgroundColor: colors.ink,
    transform: [{ rotate: '45deg' }],
  },
  /**
   * A teardrop: a circle with one square corner, rotated 45°, so it has a
   * point at the bottom sitting on the coordinate. The inner dot is
   * counter-rotated so it stays a circle.
   */
  pin: {
    width: 24,
    height: 24,
    backgroundColor: colors.terracotta,
    borderColor: colors.white,
    borderWidth: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 2,
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  // Hollow for an approximate pin — same shape, visibly less certain.
  pinApprox: { backgroundColor: colors.white, borderColor: colors.terracotta },
  pinDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.white,
    transform: [{ rotate: '45deg' }],
  },
  pinDotApprox: { backgroundColor: colors.terracotta },
});
