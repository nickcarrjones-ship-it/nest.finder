import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing, type } from '../../theme';
import { ShortlistCard } from '../../components/ShortlistCard';
import { usePicks } from '../../hooks/usePicks';
import { useShortlistStore } from '../../store/shortlistStore';
import { useRatingsStore } from '../../store/ratingsStore';
import { useProfileStore } from '../../store/profileStore';

/**
 * "Top Picks" full-list view — matches the web app's existing "Maloca Top
 * Picks" concept (js/map-filter.js), not the deferred property Shortlist
 * tab (still a month-3 placeholder at shortlist.tsx).
 *
 * The primary way to browse picks is now the map carousel (index.tsx) —
 * swiping pans the camera to each one, which the web app's badge-on-map
 * version couldn't do. This screen is the "see everything at once" list,
 * sharing usePicks so both stay in sync rather than computing separately.
 *
 * HONEST STATE TODAY: real AI ranking needs Firebase auth (Week 3, not
 * built) to reach the anthropicMessages proxy — see lib/ranking/rank.ts.
 * Ordered by walking budget until then; visiting and rating are real now.
 */
export default function PicksScreen() {
  const insets = useSafeAreaInsets();
  const { picks, ready } = usePicks();
  const toggleVisited = useShortlistStore((s) => s.toggleVisited);
  const setRating = useRatingsStore((s) => s.setRating);
  const getRating = useRatingsStore((s) => s.getRating);
  const primaryMemberId = useProfileStore((s) => s.profile.members?.[0]?.id);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Top Picks</Text>
        <Text style={styles.subtitle}>
          Ordered by walking freedom for now — AI ranking by your preferences arrives with sign-in.
        </Text>
      </View>

      <FlatList
        data={picks}
        keyExtractor={(item) => item.neighbourhood}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <ShortlistCard
            rank={index + 1}
            entry={item}
            rating={primaryMemberId ? getRating(item.neighbourhood, primaryMemberId) : undefined}
            onRate={(v) => primaryMemberId && setRating(item.neighbourhood, primaryMemberId, v)}
            onToggleVisited={() => toggleVisited(item.neighbourhood)}
            onPress={() => {}}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {ready ? 'No reachable areas yet — check your commute settings.' : 'Finding your areas…'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 4 },
  title: { ...type.title, color: colors.ink },
  subtitle: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkLt, lineHeight: 17 },
  list: { padding: spacing.lg, gap: spacing.sm },
  empty: { fontFamily: fonts.regular, textAlign: 'center', color: colors.inkLt, marginTop: spacing.xxl, fontSize: 14 },
});
