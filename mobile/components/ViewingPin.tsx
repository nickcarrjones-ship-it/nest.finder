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
  /** The address, short enough to read. */
  label: string;
  /** "£700,000" — shown as the listing gave it. */
  price: string | null;
  /** "3 bed flat". */
  description: string | null;
  /** Where it stands: "Sat 14 Sep, 2:30pm", "Want to see", "Viewed". */
  when: string | null;
  /** "7/10" once scored, otherwise null. */
  score: string | null;
  /**
   * False when the listing only gave an area rather than the building.
   * Drawn hollow so the map never implies a precision the listing did not
   * claim — someone navigating to a pin should know which kind it is.
   */
  accurate: boolean;
  open: boolean;
  onPress: () => void;
  onScorecard: () => void;
  /** Null when there is no listing to open (a property typed in by hand). */
  onListing: (() => void) | null;
}

/**
 * Tapping a pin opens a small card above it with the key facts and the same
 * two ways on as the Viewings tab — Scorecard and Listing (Nick,
 * 2026-09-25). The card is a SIBLING of the pin's tap target, not inside
 * it, so tapping the card's links never also closes it.
 */
export function ViewingPin({
  lng, lat, label, price, description, when, score, accurate, open, onPress, onScorecard, onListing,
}: Props) {
  return (
    // Anchored at the BOTTOM, not the default centre (Nick, 2026-09-25).
    // Centre-anchored, opening the callout made the marker taller, so its
    // centre moved and the pin visibly jumped away from the property. The
    // offset lifts it by the few pixels the rotated teardrop's point hangs
    // below its own layout box, so the tip sits on the coordinate.
    <Marker lngLat={[lng, lat]} anchor="bottom" offset={[0, -4]}>
      <View style={styles.stack}>
        {open && (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.address} numberOfLines={2}>{label}</Text>
              {score && <Text style={styles.score}>{score}</Text>}
            </View>
            {price && <Text style={styles.price}>{price}</Text>}
            {(description || when) && (
              <Text style={styles.meta} numberOfLines={1}>
                {[description, when].filter(Boolean).join(' · ')}
              </Text>
            )}
            {!accurate && <Text style={styles.approx}>Approximate location</Text>}
            <View style={styles.links}>
              <Pressable onPress={onScorecard} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>Scorecard</Text>
              </Pressable>
              {onListing && (
                <Pressable onPress={onListing} hitSlop={8} accessibilityRole="link">
                  <Text style={styles.link}>Listing</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.tail} />
          </View>
        )}
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}>
          <View style={[styles.pin, !accurate && styles.pinApprox]}>
            <View style={[styles.pinDot, !accurate && styles.pinDotApprox]} />
          </View>
        </Pressable>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center' },
  // Fixed width, so the card is the same size whatever the address and
  // the pin under it never shifts sideways.
  card: {
    width: 220,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  address: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  score: { fontFamily: fonts.semibold, fontSize: 13, color: colors.teal },
  price: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkLt },
  approx: { fontFamily: fonts.regular, fontSize: 11, color: colors.inkGhost },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.teal },
  tail: {
    position: 'absolute',
    bottom: -5,
    alignSelf: 'center',
    width: 9,
    height: 9,
    backgroundColor: colors.white,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.rule,
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
