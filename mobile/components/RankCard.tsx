import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { RankKind, Ranking, RankRow } from '../lib/areaRanking';
import { useReduceMotion } from './ThinkingOrb';

/**
 * The household's areas ranked on one thing, as a podium (Nick,
 * 2026-10-03 - option B of two mock-ups): the top three rise up, first in
 * the middle, the winner's reason under them, and everyone else listed
 * below. Loved areas in the love rose the map already uses for them
 * (Nick: "use love red"), Maloca's picks in teal. No numbers: the podium
 * heights and the order say it.
 *
 * One animation clock on the native driver; Reduce Motion gets it finished.
 */
const KIND_COLOUR: Record<RankKind, string> = { love: colors.anchorRose, pick: colors.teal };
const BLOCK_H = [100, 72, 50]; // first, second, third
const PODIUM_H = 172;
const RUN_MS = 2800;

export function RankCard({ ranking }: { ranking: Ranking }) {
  const clock = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      clock.setValue(1);
      return;
    }
    const run = Animated.timing(clock, { toValue: 1, duration: RUN_MS, easing: Easing.linear, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [clock, reduceMotion]);

  /** A value going 0 -> 1 between two moments (in seconds). */
  const between = (from: number, to: number) =>
    clock.interpolate({
      inputRange: [0, from / (RUN_MS / 1000), to / (RUN_MS / 1000), 1],
      outputRange: [0, 0, 1, 1],
      extrapolate: 'clamp',
    });

  const top = ranking.rows.slice(0, 3);
  const rest = ranking.rows.slice(3);
  // Second on the left, first in the middle, third on the right.
  const order = [1, 0, 2].filter((i) => top[i]);
  const rises: Record<number, [number, number]> = { 0: [0.3, 0.9], 1: [0.8, 1.4], 2: [1.2, 1.8] };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{ranking.title}</Text>
      <Text style={styles.subtitle}>{ranking.subtitle}</Text>

      <View style={styles.podium}>
        {order.map((i) => (
          <PodiumColumn
            key={top[i].name}
            row={top[i]}
            place={i}
            rise={between(...rises[i])}
            label={between(rises[i][1] - 0.2, rises[i][1] + 0.2)}
          />
        ))}
      </View>

      {top[0] && (
        <Animated.Text style={[styles.winnerWhy, { opacity: between(1.6, 2.0) }]}>{top[0].reason}</Animated.Text>
      )}

      {rest.map((r, k) => (
        <Animated.View key={r.name} style={[styles.row, { opacity: between(1.8 + k * 0.12, 2.1 + k * 0.12) }]}>
          <Text style={styles.rowRank}>{k + 4}</Text>
          <Text style={styles.rowName} numberOfLines={1}>{r.name}</Text>
          <Tag kind={r.kind} />
        </Animated.View>
      ))}

      {ranking.footnote && (
        <Animated.Text style={[styles.footnote, { opacity: between(2.2, 2.6) }]}>{ranking.footnote}</Animated.Text>
      )}
    </View>
  );
}

function PodiumColumn({
  row,
  place,
  rise,
  label,
}: {
  row: RankRow;
  place: number;
  rise: Animated.AnimatedInterpolation<number>;
  label: Animated.AnimatedInterpolation<number>;
}) {
  const h = BLOCK_H[place];
  return (
    <View style={styles.column}>
      <Animated.View style={[styles.columnLabels, { opacity: label }]}>
        <Tag kind={row.kind} />
        <Text style={styles.columnName} numberOfLines={2}>{row.name}</Text>
      </Animated.View>
      {/* The block rises out of the floor: it slides up inside a box that
          clips it, rather than growing, so the native driver can run it. */}
      <View style={[styles.blockWell, { height: h }]}>
        <Animated.View
          style={[
            styles.block,
            { height: h, backgroundColor: KIND_COLOUR[row.kind] },
            { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [h, 0] }) }] },
          ]}
        >
          <Text style={styles.blockNumber}>{place + 1}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

function Tag({ kind }: { kind: RankKind }) {
  return (
    <View style={[styles.tag, { backgroundColor: KIND_COLOUR[kind] }]}>
      <Text style={styles.tagText}>{kind === 'love' ? 'YOU LOVE' : 'MALOCA PICK'}</Text>
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
    padding: spacing.md,
    gap: 2,
  },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkMid, marginBottom: spacing.sm },
  podium: { height: PODIUM_H, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  columnLabels: { alignItems: 'center', gap: 4, marginBottom: 6, paddingHorizontal: 2 },
  columnName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink, textAlign: 'center', lineHeight: 16 },
  blockWell: { alignSelf: 'stretch', overflow: 'hidden', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  block: { borderRadius: 10, alignItems: 'center', paddingTop: 8 },
  blockNumber: { fontFamily: fonts.bold, fontSize: 24, color: colors.white },
  winnerWhy: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.inkMid,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  rowRank: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkGhost, width: 18 },
  rowName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, flexShrink: 1 },
  tag: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1.5 },
  tagText: { fontFamily: fonts.monoMedium, fontSize: 8.5, color: colors.white, letterSpacing: 0.4 },
  footnote: { fontFamily: fonts.regular, fontSize: 11, color: colors.inkGhost, marginTop: spacing.sm, lineHeight: 15 },
});
