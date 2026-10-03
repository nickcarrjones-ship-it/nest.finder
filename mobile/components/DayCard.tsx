import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { clock, type DayCardData, type DayStopCard } from '../lib/dayPlan';
import { useReduceMotion } from './ThinkingOrb';

/**
 * A day out as a swipeable strip (Nick, 2026-10-03 - option B of two
 * mock-ups): the hours they have as a line with a dot for each stop, then
 * a card per stop with its time, photo, name and rating, and the walk to
 * the next between them. Dinner gets "Book a table" - the restaurant's own
 * booking page, the closest the app can get to booking for them (Nick
 * asked for that; it needs a booking partner to go further).
 *
 * Cards slide in once on the native driver; Reduce Motion skips it.
 */
const CARD_W = 152;
const GAP_W = 38;

export function DayCard({ day }: { day: DayCardData }) {
  const enter = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    const run = Animated.timing(enter, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [enter, reduceMotion]);

  const span = Math.max(1, day.end - day.start);
  const along = (h: number) => `${Math.min(100, Math.max(0, ((h - day.start) / span) * 100))}%` as const;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{day.title}</Text>
      <Text style={styles.subtitle}>{day.subtitle}</Text>

      {/* The hours they have, a dot for each stop. */}
      <View style={styles.lineWrap}>
        <View style={styles.lineEnds}>
          <Text style={styles.lineEnd}>{clock(day.start).toUpperCase()}</Text>
          <Text style={styles.lineEnd}>{clock(day.end).toUpperCase()}</Text>
        </View>
        <View style={styles.line}>
          {day.stops.map((s) => (
            <View key={s.placeId} style={[styles.lineDot, { left: along(s.at) }]} />
          ))}
        </View>
        <View style={styles.lineTimes}>
          {day.stops.map((s) => (
            <Text key={s.placeId} style={[styles.lineTime, { left: along(s.at) }]}>{s.time}</Text>
          ))}
        </View>
      </View>

      <Animated.View
        style={{
          opacity: enter,
          transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          decelerationRate="fast"
          snapToInterval={CARD_W + GAP_W}
        >
          {day.stops.map((s, i) => (
            <View key={s.placeId} style={styles.stopRow}>
              <StopCard stop={s} />
              {i < day.stops.length - 1 && (
                <View style={styles.walk}>
                  <Text style={styles.walkArrow}>→</Text>
                  <Text style={styles.walkMins}>{day.stops[i + 1].walkFromPrev ?? 1} min</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function StopCard({ stop }: { stop: DayStopCard }) {
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <View style={styles.stop}>
      <View style={styles.photo}>
        {stop.photoUrl ? <Image source={{ uri: stop.photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <View style={styles.timeBadge}>
          <Text style={styles.timeBadgeText}>{stop.time}</Text>
        </View>
      </View>
      <View style={styles.stopBody}>
        <Text style={styles.activity}>{stop.label.toUpperCase()}</Text>
        <Text style={styles.name} numberOfLines={2}>{stop.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[stop.kind, stop.rating ? `★ ${stop.rating.toFixed(1)}` : null].filter(Boolean).join(' · ')}
        </Text>
        {stop.bookUrl ? (
          <Pressable style={styles.book} onPress={() => open(stop.bookUrl as string)} accessibilityRole="link">
            <Text style={styles.bookText}>Book a table</Text>
          </Pressable>
        ) : null}
        <View style={styles.links}>
          <Pressable onPress={() => open(stop.mapsUrl)} hitSlop={6} accessibilityRole="link">
            <Text style={styles.link}>Directions</Text>
          </Pressable>
          {stop.phone ? (
            <Pressable onPress={() => open(`tel:${stop.phone?.replace(/\s+/g, '')}`)} hitSlop={6} accessibilityRole="link">
              <Text style={styles.link}>Call</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: 2,
  },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink, paddingHorizontal: spacing.md },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkMid, paddingHorizontal: spacing.md },
  lineWrap: { marginTop: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md + 6 },
  lineEnds: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  lineEnd: { fontFamily: fonts.monoMedium, fontSize: 8.5, color: colors.inkGhost, letterSpacing: 0.4 },
  line: { height: 3, borderRadius: 2, backgroundColor: colors.rule, justifyContent: 'center' },
  lineDot: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 5.5,
    marginLeft: -5.5,
    backgroundColor: colors.teal,
  },
  lineTimes: { height: 16, marginTop: 5 },
  lineTime: { position: 'absolute', fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.inkMid, width: 60, marginLeft: -30, textAlign: 'center' },
  // Every card the height of the tallest (dinner, with Book a table), so
  // the links line up along the bottom.
  strip: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, alignItems: 'stretch' },
  stopRow: { flexDirection: 'row', alignItems: 'stretch' },
  stop: {
    width: CARD_W,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  photo: { height: 96, margin: 6, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.creamDk },
  timeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.teal,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  timeBadgeText: { fontFamily: fonts.monoMedium, fontSize: 10, color: colors.white },
  stopBody: { flex: 1, paddingHorizontal: 10, paddingBottom: 10, gap: 2 },
  activity: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.teal, letterSpacing: 0.4 },
  name: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink, lineHeight: 17 },
  meta: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.inkMid },
  book: {
    marginTop: 6,
    backgroundColor: colors.teal,
    borderRadius: radius.sm,
    paddingVertical: 6,
    alignItems: 'center',
  },
  bookText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  links: { flexDirection: 'row', gap: spacing.md, marginTop: 'auto', paddingTop: 6 },
  link: { fontFamily: fonts.semibold, fontSize: 12, color: colors.teal },
  walk: { width: GAP_W, alignItems: 'center', paddingTop: 44 },
  walkArrow: { fontFamily: fonts.semibold, fontSize: 15, color: colors.inkGhost },
  walkMins: { fontFamily: fonts.monoMedium, fontSize: 8.5, color: colors.inkGhost },
});
