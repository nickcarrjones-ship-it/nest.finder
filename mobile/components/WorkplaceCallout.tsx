import { StyleSheet, Text, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { colors, radius, type } from '../theme';

interface Props {
  lng: number;
  lat: number;
  name: string;
}

/**
 * A short-lived "Harriet's workplace" tag above a workplace pin. The pins
 * carry initials, which are only meaningful once you've been told what
 * they stand for — so this says it plainly for a few seconds on first load
 * and then gets out of the way (Nick, 2026-08-23). Timing lives in the map
 * screen, which owns the whole first-run sequence.
 *
 * Uses Marker, NOT ViewAnnotation, for the same reason WorkplacePin does —
 * see the long note there: on Android ViewAnnotation composites inside the
 * map surface and ignores RN layering, which made pins vanish behind the
 * area circles twice before.
 */
export function WorkplaceCallout({ lng, lat, name }: Props) {
  return (
    // anchor="bottom" puts the tag's base on the coordinate; the offset
    // then lifts it clear of the 28px pin drawn at that same point.
    <Marker lngLat={[lng, lat]} anchor="bottom" offset={[0, -20]}>
      <View style={styles.bubble} pointerEvents="none">
        <Text style={styles.text} numberOfLines={1}>
          {possessive(name)} workplace
        </Text>
        <View style={styles.tail} />
      </View>
    </Marker>
  );
}

/** "Nick" -> "Nick's", "Chris" -> "Chris'", "You" -> "Your" */
function possessive(name: string): string {
  const n = name.trim();
  if (!n) return 'Their';
  if (n.toLowerCase() === 'you') return 'Your';
  return n.endsWith('s') ? `${n}'` : `${n}'s`;
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: 5,
    paddingHorizontal: 9,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 5,
  },
  text: { ...type.bodyStrong, fontSize: 11.5, color: colors.cream },
  // Little downward pointer, so the tag reads as belonging to the pin below.
  tail: {
    position: 'absolute',
    bottom: -4,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.ink,
  },
});
