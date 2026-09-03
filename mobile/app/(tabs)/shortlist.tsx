import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, type } from '../../theme';
import { ShortlistRankCard } from '../../components/ShortlistRankCard';
import { useVerdictsStore } from '../../store/verdictsStore';
import { useProfileStore } from '../../store/profileStore';
import { rankAreas } from '../../lib/verdictRank';

/**
 * The household's league table of everywhere they have actually been.
 *
 * It fills up as they go (Nick, 2026-09-02): an area appears the moment
 * anyone gives it a verdict, and the order is what the household thinks
 * rather than what the model thinks — which is what separates this tab
 * from Top Picks, where the AI's own ranking lives.
 *
 * The ordering rule and the reasoning behind it are in lib/verdictRank.ts.
 * The short version: everyone counts equally, and a household split — one
 * of you in love, the other ruling it out — ranks below a place you both
 * merely shrugged at, because you do not move somewhere one of you has
 * vetoed.
 */
export default function ShortlistScreen() {
  const insets = useSafeAreaInsets();
  const verdicts = useVerdictsStore((s) => s.verdicts);
  const members = useProfileStore((s) => s.profile.members);

  const ranked = useMemo(
    () => rankAreas(Object.values(verdicts), members ?? []),
    [verdicts, members],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Shortlist</Text>
        <Text style={styles.subtitle}>
          {ranked.length > 0
            ? 'Everywhere you’ve been, best first — by what you all made of it.'
            : 'Where you’ve been, ranked by what you all made of it.'}
        </Text>
      </View>

      <FlatList
        data={ranked}
        keyExtractor={(r) => r.area}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        renderItem={({ item, index }) => (
          <ShortlistRankCard rank={index + 1} ranking={item} />
        )}
        ListEmptyComponent={
          // Nothing here yet is the normal first state, not a failure — so
          // it says what to do rather than apologising for being empty.
          <View style={styles.empty}>
            <Text style={styles.emptyLead}>Nothing to rank yet</Text>
            <Text style={styles.emptyBody}>
              Go and have a look at somewhere on the map, tick that you’ve been, and say what you
              made of it. It’ll show up here — and once you’ve both scored a few, this becomes the
              list you argue over.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 4 },
  title: { ...type.title, color: colors.ink },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkMid, lineHeight: 17 },
  list: { padding: spacing.lg, gap: spacing.sm },
  empty: { paddingTop: spacing.xxl, paddingHorizontal: spacing.sm, gap: 6 },
  emptyLead: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, textAlign: 'center' },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.inkMid,
    textAlign: 'center',
  },
});
