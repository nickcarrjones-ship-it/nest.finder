import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts, radius, spacing, type } from '../theme';
import { clearDataGaps, rankGaps, readDataGaps, type DataGapLog } from '../lib/dataGaps';

/**
 * What people asked that the app could not answer — the owner's view.
 *
 * Nick's requirement (2026-09-07): see the PATTERNS in what the data is
 * missing, so the roadmap follows real demand rather than guesswork about
 * what a house-hunter wants. "Eleven questions hit an area with no crime
 * data" is a better argument for building crime data than anyone's opinion.
 *
 * It shows counts and nothing else, because counts are all that is stored.
 * No question text, no user, nothing to leak — see lib/dataGaps.ts for why
 * that is a design decision rather than an omission.
 *
 * On-device only for now. The cross-user version is the actual goal and
 * needs a Firebase path and a rules deploy; this proves the capture and
 * gives it somewhere to be read in the meantime.
 */
export function DataGapsPanel() {
  const [log, setLog] = useState<DataGapLog | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      readDataGaps().then((l) => { if (alive) setLog(l); });
      return () => { alive = false; };
    }, []),
  );

  if (!log) return null;
  const gaps = rankGaps(log);
  const asked = gaps.reduce((n, g) => n + g.count, 0) + log.answeredCleanly;
  if (asked === 0) {
    return (
      <Text style={styles.empty}>
        Nothing yet — this fills in as people ask the Agent about areas.
      </Text>
    );
  }

  const topAreas = Object.entries(log.areas).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <View style={styles.wrap}>
      {/* The denominator matters: without it a rising gap count could just
          mean the Agent is being used more. */}
      <Text style={styles.summary}>
        {log.answeredCleanly} of {asked} answered entirely from our own data.
      </Text>

      {gaps.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>MOST-MISSED DATA</Text>
          {gaps.slice(0, 6).map((g) => (
            <View key={g.subject} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>{g.subject}</Text>
              <Text style={styles.rowCount}>
                {g.count}
                {g.fellBackToModel > 0 ? ` · ${g.fellBackToModel} answered from general knowledge` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {topAreas.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>AREAS WE ANSWER THINLY</Text>
          {topAreas.map(([area, n]) => (
            <View key={area} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>{area}</Text>
              <Text style={styles.rowCount}>{n}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => clearDataGaps().then(() => readDataGaps().then(setLog))}
        style={styles.reset}
        accessibilityRole="button"
      >
        <Text style={styles.resetText}>Reset counts</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  empty: { fontFamily: fonts.italic, fontSize: 12.5, color: colors.inkLt },
  summary: { ...type.body, fontSize: 13, color: colors.inkMid },
  block: { gap: 3 },
  blockLabel: {
    fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.6, color: colors.inkLt,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.rule, borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    backgroundColor: colors.white,
  },
  rowName: { flex: 1, fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink },
  rowCount: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.inkMid },
  reset: { alignSelf: 'flex-start', paddingVertical: 4 },
  resetText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.teal },
});
