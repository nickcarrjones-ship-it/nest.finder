import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { colors, fonts } from '../theme';

interface WorkplacePinProps {
  lng: number;
  lat: number;
  initial: string;
  /** Shown above the pin: "Nick works here". */
  caption?: string;
  /** Tapping the pin brings the caption back once it has been dismissed. */
  onPress?: () => void;
}

/**
 * A workplace marker — matches the web app's circular initial-letter pins
 * (js/map-core.js computeZones: "var initial = m.name.substring(0,1)...").
 *
 * Uses Marker, NOT ViewAnnotation, and the difference is the whole reason
 * the pins kept disappearing behind the area circles:
 *
 *   ViewAnnotation is a PointAnnotation. On Android its children are drawn
 *   onto a bitmap that MapLibre composites INSIDE the map surface, so the
 *   map decides the stacking and React Native's zIndex does nothing at all.
 *   Two previous attempts to fix this with zIndex were no-ops.
 *
 *   Marker places a real native view on the map projection (Android) /
 *   MLNPointAnnotation (iOS), which sits above the rendered map layers.
 *   MapLibre's own docs point here for anything that isn't a static image.
 *
 * Still verify on a real device after changing this — the failure mode is
 * silent and only visible when a pin overlaps a circle.
 */
export function WorkplacePin({ lng, lat, initial, caption, onPress }: WorkplacePinProps) {
  return (
    <Marker lngLat={[lng, lat]}>
      {/* The caption sits above the pin rather than in a legend, so it names
          the thing it is pointing at. It appears on load, goes when the
          commute slider moves — by then it has been read, and it would only
          be in the way — and comes back if the pin is tapped (Nick,
          2026-08-29). */}
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.stack}>
        {caption ? (
          <View style={styles.bubble}>
            <Text style={styles.bubbleText} numberOfLines={1}>{caption}</Text>
            <View style={styles.tail} />
          </View>
        ) : null}
        <View style={styles.pin}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
      </Pressable>
    </Marker>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center' },
  bubble: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 5,
    // Markers are laid out from their anchor, so the bubble must not push
    // the pin off the coordinate it belongs to.
    alignItems: 'center',
  },
  bubbleText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.cream },
  tail: {
    position: 'absolute',
    bottom: -3,
    width: 7,
    height: 7,
    backgroundColor: colors.ink,
    transform: [{ rotate: '45deg' }],
  },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  initial: {
    color: colors.cream,
    fontSize: 13,
    fontFamily: fonts.bold,
  },
});
