import { useEffect, useState } from 'react';
import { Marker } from '@maplibre/maplibre-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

interface AnchorPinProps {
  lng: number;
  lat: number;
  /** The area as THEY named it — "Clapham Common", not a rank. Always
   *  supplied, so a tap can always answer "which one is this?". */
  name: string;
  /**
   * Whether the name shows without being asked for.
   *
   * False when the pin is sitting on the basemap's own label for the place,
   * which is the usual case: printing "Tooting" in rose on top of the map's
   * own "Tooting" is the same word twice. The map does the naming; the rose
   * says whose it is.
   */
  showLabel: boolean;
}

/** How long a tapped name stays up before the map is quiet again. Long
 *  enough to read a place name, short enough that nobody has to dismiss it. */
const REVEAL_MS = 2600;

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
 * It carries the NAME, not a number, when it carries anything — a rank on a
 * suggestion is a position in a list and needs no explanation; a number on
 * somewhere they chose themselves would be a puzzle where a name is a
 * confirmation. Usually it carries nothing, because it is sitting on the
 * basemap's own label for the place and that label is already the name
 * (Nick, 2026-09-01).
 *
 * Uses Marker rather than ViewAnnotation for the reason PickBubble records:
 * ViewAnnotation composites inside the map on Android and ignores RN
 * zIndex, which made pins disappear under the region fill.
 */
export function AnchorPin({ lng, lat, name, showLabel }: AnchorPinProps) {
  /**
   * Tap a bare dot and it tells you which area it is.
   *
   * Zoomed out far enough, the basemap stops drawing its own place names —
   * and these pins were then unlabelled dots on an unlabelled map, marking
   * places with no way to find out which (Nick, 2026-09-08). Rather than
   * watching the zoom and guessing when the basemap has given up, the name
   * is simply always one tap away: correct at every zoom, and no second
   * opinion about what the map is currently showing.
   *
   * It clears itself, because a label that had to be dismissed would be
   * worse than the dot it replaced.
   */
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!revealed) return undefined;
    const t = setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  const labelled = showLabel || revealed;

  return (
    <Marker lngLat={[lng, lat]}>
      <Pressable
        onPress={() => setRevealed((r) => !r)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={name}
        style={styles.stack}
      >
        {labelled && (
          <View style={[styles.label, revealed && !showLabel && styles.labelRevealed]}>
            <Text style={styles.labelText} numberOfLines={1}>{name}</Text>
          </View>
        )}
        <View style={[styles.dot, !labelled && styles.dotAlone]} />
      </Pressable>
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
  /** A tapped name is a momentary answer rather than part of the map's
   *  furniture, so it says so with a ring the standing labels do not have. */
  labelRevealed: { borderWidth: 1.5, borderColor: colors.white },
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
  /**
   * Alone on the basemap's label, the dot IS the marker rather than a tail
   * under one, so it grows enough to be seen against the map's own text and
   * loses the gap it needed to sit below a chip.
   */
  dotAlone: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
});
