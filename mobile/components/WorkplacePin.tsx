import { StyleSheet, Text, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { colors, fonts } from '../theme';

interface WorkplacePinProps {
  lng: number;
  lat: number;
  initial: string;
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
export function WorkplacePin({ lng, lat, initial }: WorkplacePinProps) {
  return (
    <Marker lngLat={[lng, lat]}>
      <View style={styles.pin}>
        <Text style={styles.initial}>{initial}</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
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
