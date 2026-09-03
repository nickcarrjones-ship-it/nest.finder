import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { TierBadge } from './TierPills';
import type { AreaRanking } from '../lib/verdictRank';

/**
 * One area on the household's league table: where it sits, and what each
 * person actually said about it.
 *
 * The rank number is the only score shown. The net figure behind it
 * (lib/verdictRank.ts) is a real number but not a meaningful one to read —
 * "0.25" answers nothing anybody asked — and this app's standing rule is
 * not to print numbers nobody can check. What CAN be checked is the row of
 * verdicts underneath, which is also the answer to "why is this one above
 * that one": two "loved it"s beat a "loved it" and a "maybe", visibly.
 */
export function ShortlistRankCard({ rank, ranking }: { rank: number; ranking: AreaRanking }) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>{ranking.area}</Text>
      </View>

      <View style={styles.verdicts}>
        {ranking.byMember.map((m) => (
          <TierBadge key={m.memberId} tier={m.tier} name={m.name || undefined} />
        ))}
      </View>

      {/* Said plainly rather than hidden: the order can still move when the
          other half of the household weighs in, and someone should be able
          to see that rather than wonder why it shifted overnight. */}
      {ranking.awaiting.length > 0 && (
        <Text style={styles.awaiting}>
          Waiting on {list(ranking.awaiting)}
        </Text>
      )}
    </View>
  );
}

/** "Harriet and Rosie" — reads better than a comma list of two. */
function list(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: spacing.md,
    gap: spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 13, fontFamily: fonts.bold, color: colors.teal },
  name: { flex: 1, fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  verdicts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  awaiting: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMid },
});
