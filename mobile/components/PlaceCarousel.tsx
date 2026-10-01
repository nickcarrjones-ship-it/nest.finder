import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { PlaceCard } from '../lib/agentChat/placeCards';

/**
 * Places under a friend-style answer, as small photo cards you swipe
 * through (Nick, 2026-10-01, option A). Tapping a card opens it in Maps.
 * Below them, hand-offs to TikTok and Instagram for a look at the place.
 */
export function PlaceCarousel({
  places,
  social,
}: {
  places: PlaceCard[];
  social?: { tiktok: string; instagram: string };
}) {
  return (
    <View style={styles.wrap}>
      {places.length > 0 && (
        <Text style={styles.hint}>Tap a place to get directions in Maps</Text>
      )}
      {places.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          decelerationRate="fast"
          snapToInterval={CARD_W + spacing.sm}
        >
          {places.map((p) => (
            <Pressable
              key={p.placeId}
              style={styles.card}
              onPress={() => Linking.openURL(p.mapsUrl).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel={`${p.name}${p.rating ? `, rated ${p.rating.toFixed(1)}` : ''}, ${p.walkMins} minute walk from ${p.station} station. Opens in Maps.`}
            >
              {p.photoUrl ? (
                <Image source={{ uri: p.photoUrl }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={[styles.photo, styles.noPhoto]}>
                  <Text style={styles.noPhotoText}>{p.name.slice(0, 1)}</Text>
                </View>
              )}
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {p.rating ? <Text style={styles.star}>★ {p.rating.toFixed(1)}</Text> : null}
                  {p.rating && p.label ? ' · ' : ''}
                  {p.label ?? ''}
                </Text>
                {p.walkMins > 0 && (
                  <Text style={styles.meta} numberOfLines={1}>{p.walkMins} min from station</Text>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {social && (
        <View style={styles.socialRow}>
          <Pressable
            style={styles.social}
            onPress={() => Linking.openURL(social.tiktok).catch(() => {})}
            accessibilityRole="link"
            accessibilityHint="Opens TikTok"
          >
            <Text style={styles.socialText}>See it on TikTok</Text>
          </Pressable>
          <Pressable
            style={styles.social}
            onPress={() => Linking.openURL(social.instagram).catch(() => {})}
            accessibilityRole="link"
            accessibilityHint="Opens Instagram"
          >
            <Text style={styles.socialText}>See it on Instagram</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const CARD_W = 148;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkLt },
  row: { gap: spacing.sm, paddingRight: spacing.lg },
  card: {
    width: CARD_W,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.rule,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: 88, backgroundColor: colors.creamMid },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { fontFamily: fonts.semibold, fontSize: 26, color: colors.inkGhost },
  body: { paddingHorizontal: 9, paddingVertical: 7, gap: 1 },
  name: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkLt },
  star: { color: colors.amber, fontFamily: fonts.semibold },
  socialRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  social: {
    borderWidth: 1,
    borderColor: colors.tealLine,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  socialText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.teal },
});
