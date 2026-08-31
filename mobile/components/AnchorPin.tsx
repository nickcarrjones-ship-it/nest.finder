import { Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

interface AnchorPinProps {
  lng: number;
  lat: number;
  /** The area as THEY named it — "Clapham Common", not a rank. */
  name: string;
}

/**
 * An area the household said they love, on the map in deep rose.
 *
 * The whole shortlist is derived from these, and until now they were
 * invisible: shortlistByAnchor deliberately EXCLUDES a named area from the
 * candidates (anchor.ts, `exclude: [...hated, ...anchors]`), so a loved
 * area could never appear as a pick bubble. The one thing that would make
 * ten suggestions look non-random — seeing what they were derived from —
 * was the one thing the map could not show (2026-08-31).
 *
 * It carries the NAME, not a number. A rank on a suggestion is a position
 * in a list and needs no explanation; a number on somewhere they chose
 * themselves would be a puzzle where a name is a confirmation.
 *
 * Uses Marker rather than ViewAnnotation for the reason PickBubble records:
 * ViewAnnotation composites inside the map on Android and ignores RN
 * zIndex, which made pins disappear under the region fill.
 */
export function AnchorPin({ lng, lat, name }: AnchorPinProps) {
  return (
    <Marker lngLat={[lng, lat]}>
      <View style={styles.stack} pointerEvents="none">
        <View style={styles.label}>
          <Text style={styles.labelText} numberOfLines={1}>{name}</Text>
        </View>
        <View style={styles.dot} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center' },
  label: {
    backgroundColor: colors.anchorRose,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    maxWidth: 150,
    // Lifts it off the basemap the way the workplace caption does — without
    // this the rose sits flat against the region fill.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 4,
  },
  labelText: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    color: colors.white,
    letterSpacing: 0.1,
  },
  /** A small anchored point under the label, so it marks a place rather
   *  than floating near one. */
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 3,
    backgroundColor: colors.anchorRose,
    borderWidth: 2,
    borderColor: colors.white,
  },
});
