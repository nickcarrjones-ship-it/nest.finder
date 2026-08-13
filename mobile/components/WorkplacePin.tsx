import { StyleSheet, Text, View } from 'react-native';
import { ViewAnnotation } from '@maplibre/maplibre-react-native';
import { colors } from '../theme';

interface WorkplacePinProps {
  lng: number;
  lat: number;
  initial: string;
}

/**
 * A workplace marker — matches the web app's circular initial-letter pins
 * (js/map-core.js computeZones: "var initial = m.name.substring(0,1)...").
 * Only two of these on screen at once, so ViewAnnotation (a real styled
 * React view anchored to a coordinate) is the right tool — its own docs
 * recommend the heavier GeoJSONSource/SymbolLayer route only for "many
 * points", which this isn't.
 */
export function WorkplacePin({ lng, lat, initial }: WorkplacePinProps) {
  return (
    <ViewAnnotation lngLat={[lng, lat]}>
      <View style={styles.pin}>
        <Text style={styles.initial}>{initial}</Text>
      </View>
    </ViewAnnotation>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.copper,
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
    fontWeight: '700',
  },
});
