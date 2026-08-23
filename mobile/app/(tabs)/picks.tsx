import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../../theme';
import { ShortlistCard } from '../../components/ShortlistCard';
import { useShortlistStore } from '../../store/shortlistStore';
import { useRatingsStore } from '../../store/ratingsStore';
import { useProfileStore } from '../../store/profileStore';
import { useMapDataStore } from '../../store/mapDataStore';
import { computeAreaBudgets } from '../../lib/walkBudget';
import { computeAreaCandidates, identityStationsOnly } from '../../lib/ranking/candidates';

/**
 * "Top Picks" — matches the web app's existing "Maloca Top Picks" concept
 * (js/map-filter.js), not the deferred property Shortlist tab (still a
 * month-3 placeholder at app/(tabs)/shortlist.tsx). Different feature, same
 * established name, kept in its own tab so nothing about the roadmap gets
 * silently overwritten.
 *
 * Nick's framing (2026-08-23): the map answers "where could I live", this
 * answers "which of those should you actually go and look at" — a short,
 * ranked list you narrow down by visiting and rating, not another 283-row
 * spreadsheet.
 *
 * HONEST STATE TODAY: the real AI ranking needs the Firebase auth work
 * (Week 3, not built) to route through the anthropicMessages proxy — see
 * lib/ranking/rank.ts. Until then this shows areas ordered by a real,
 * useful, non-AI signal (walking budget — how much room the commute leaves
 * you), clearly labelled as a placeholder ordering. Visiting and rating
 * work for real today; only the AI reasoning is pending.
 *
 * Neighbourhood grouping also uses a placeholder (identityStationsOnly —
 * one station per row) until the real OSM-derived station->neighbourhood
 * mapping lands, so Clapham's three stations still show separately for now.
 */
export default function PicksScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const status = useMapDataStore((s) => s.status);
  const stations = useMapDataStore((s) => s.stations);
  const journeyTimes = useMapDataStore((s) => s.journeyTimes);
  const entries = useShortlistStore((s) => s.entries);
  const setResult = useShortlistStore((s) => s.setResult);
  const toggleVisited = useShortlistStore((s) => s.toggleVisited);
  const setRating = useRatingsStore((s) => s.setRating);
  const getRating = useRatingsStore((s) => s.getRating);

  const candidates = useMemo(() => {
    if (status !== 'ready') return [];
    const budgets = computeAreaBudgets(stations, journeyTimes, profile);
    const identities = identityStationsOnly(stations.map((s) => s.name));
    return computeAreaCandidates(budgets, identities);
  }, [status, stations, journeyTimes, profile]);

  // Placeholder ordering: most walking freedom first. Real scoring arrives
  // with the AI pass — this line is the one thing that changes when it does.
  const top10 = useMemo(
    () => [...candidates].sort((a, b) => b.walkBudgetMins - a.walkBudgetMins).slice(0, 10),
    [candidates],
  );

  const primaryMemberId = profile.members?.[0]?.id;

  if (entries.length === 0 && top10.length > 0) {
    setResult(
      top10.map((c) => ({
        neighbourhood: c.neighbourhood,
        score: c.walkBudgetMins,
        reason: `${c.commuteMins} min commute, ${c.walkBudgetMins} min walking budget once you're there.`,
        confidence: 'low' as const,
      })),
      null,
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Top Picks</Text>
        <Text style={styles.subtitle}>
          Ordered by walking freedom for now — AI ranking by your preferences arrives with sign-in.
        </Text>
      </View>

      <FlatList
        data={entries}
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
            {status === 'loading' ? 'Finding your areas…' : 'No reachable areas yet — check your commute settings.'}
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
  subtitle: { fontSize: 12.5, color: colors.inkLt, lineHeight: 17 },
  list: { padding: spacing.lg, gap: spacing.sm },
  empty: { textAlign: 'center', color: colors.inkLt, marginTop: spacing.xxl, fontSize: 14 },
});
