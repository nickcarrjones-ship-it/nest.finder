import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { OutingStop } from '../lib/agentChat/outing';

/**
 * One stop on a day out.
 *
 * The itinerary used to arrive as a paragraph with a raw google.com/maps
 * URL sitting in it as unclickable text, which is a worse version of the
 * Rightmove button this app already has elsewhere (Nick, 2026-09-14).
 *
 * The picture is the point. Searching a place on Google shows you what it
 * looks like before anything else, and "is this the kind of pub I'd sit
 * in" is answered by a photograph far faster than by a rating.
 */
export function OutingCard({ stop }: { stop: OutingStop }) {
  const rating = typeof stop.rating === 'number' ? stop.rating.toFixed(1) : null;

  return (
    <View style={styles.card}>
      {/* Absent is a plainer card, not a broken one — a photo is a second
          billable request and it is allowed to fail. */}
      {stop.photoUrl ? (
        <Image source={{ uri: stop.photoUrl }} style={styles.photo} resizeMode="cover" />
      ) : null}

      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.name} numberOfLines={2}>{stop.name}</Text>
          {rating && (
            <View style={styles.rating}>
              <Text style={styles.ratingValue}>{rating}</Text>
              <Text style={styles.star}>★</Text>
            </View>
          )}
        </View>

        {typeof stop.ratingCount === 'number' && stop.ratingCount > 0 && (
          <Text style={styles.count}>
            {stop.ratingCount.toLocaleString('en-GB')} review{stop.ratingCount === 1 ? '' : 's'}
          </Text>
        )}

        <Text style={styles.reason}>{stop.reason}</Text>

        <Pressable
          style={styles.mapsBtn}
          onPress={() => Linking.openURL(stop.mapsUrl).catch(() => {})}
          accessibilityRole="link"
          accessibilityLabel={`Open ${stop.name} in Google Maps`}
        >
          <Text style={styles.mapsBtnText}>Open in Maps</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: 132, backgroundColor: colors.creamMid },
  body: { padding: spacing.md, gap: 4 },

  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  name: { ...type.bodyStrong, fontSize: 15, color: colors.ink, flex: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingValue: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  star: { fontSize: 12, color: colors.amber },
  count: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkGhost },

  reason: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.inkMid, lineHeight: 19, marginTop: 2 },

  mapsBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: colors.tealLine,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  mapsBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.teal },
});
