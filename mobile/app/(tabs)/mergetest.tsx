import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../../theme';
import { cachedSharedRegion, cacheKey, clearRegionCache, type MergeProgress } from '../../lib/mergeRegions';
import { countPoints, type Ring } from '../../lib/mergeStrategies';
import fixture from '../../assets/data/merge-fixture.json';

/**
 * TEMPORARY measurement screen — delete once the isochrone work is settled.
 *
 * The spinner below is the point of the test, not decoration: it is driven by
 * a plain JS animation, so if the merge blocks the thread it visibly stalls.
 * A smooth spinner means the app stayed responsive while working.
 */

const SETS = fixture.sets as unknown as Ring[][];

export default function MergeTestScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<MergeProgress | null>(null);
  const [rows, setRows] = useState<{ label: string; value: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;      // JS thread
  const spinNative = useRef(new Animated.Value(0)).current; // UI thread

  useEffect(() => {
    // Deliberately a JS-driven animation: it freezes if the JS thread blocks,
    // which is exactly what we're testing for.
    const mk = (v: Animated.Value, native: boolean) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: native,
        }),
      );
    const a = mk(spin, false);       // stutters when JS blocks — the diagnostic
    const b = mk(spinNative, true);  // runs on the UI thread — what users would see
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [spin, spinNative]);

  async function run(useCache: boolean) {
    if (!useCache) clearRegionCache();
    setBusy(true);
    setRows([]);
    setStatus(useCache ? 'Running again (cache warm)…' : 'Merging…');
    await new Promise((r) => setTimeout(r, 30));

    const key = cacheKey(['canary_wharf', 'holborn', 50, 5, 12]);
    const t0 = Date.now();
    const { region, cached } = await cachedSharedRegion(key, SETS, setProgress);
    const ms = Date.now() - t0;

    setRows([
      { label: cached ? 'From cache' : 'Computed', value: `${ms} ms` },
      { label: 'Regions where you both fit', value: `${region.length}` },
      { label: 'Outline points', value: countPoints(region).toLocaleString() },
      {
        label: 'Verdict',
        value: ms < 100 ? 'instant' : ms < 800 ? 'responsive' : 'still slow',
      },
    ]);
    setProgress(null);
    setStatus('');
    setBusy(false);
  }

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateNative = spinNative.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
    >
      <Text style={styles.h1}>Merge performance</Text>
      <Text style={styles.body}>
        Two squares, same animation. The copper one is driven by the thread doing the
        merging; the dark one runs on the UI thread. Watch both while it works — the
        difference is what a real loading indicator would look like.
      </Text>

      <View style={styles.stage}>
        <View style={styles.spinRow}>
          <View style={styles.spinCol}>
            <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
            <Text style={styles.spinLabel}>JS thread</Text>
            <Text style={styles.spinNote}>stutters</Text>
          </View>
          <View style={styles.spinCol}>
            <Animated.View
              style={[styles.spinner, styles.spinnerNative, { transform: [{ rotate: rotateNative }] }]}
            />
            <Text style={styles.spinLabel}>UI thread</Text>
            <Text style={styles.spinNote}>stays smooth</Text>
          </View>
        </View>
        <Text style={styles.stageText}>
          {progress ? `${progress.done} / ${progress.total} groups` : status || 'Idle'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Test data</Text>
        <Text style={styles.cardValue}>{SETS.map((s) => s.length).join(' + ')} catchments</Text>
        <Text style={styles.cardNote}>
          {SETS.reduce((n, s) => n + s.reduce((m, r) => m + r.length, 0), 0).toLocaleString()} vertices,
          two people, 50 min limit
        </Text>
      </View>

      <View style={styles.btnRow}>
        <Pressable style={[styles.btn, busy && styles.btnBusy]} onPress={() => run(false)} disabled={busy}>
          <Text style={styles.btnText}>Merge (cold)</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnAlt, busy && styles.btnBusy]} onPress={() => run(true)} disabled={busy}>
          <Text style={[styles.btnText, styles.btnTextAlt]}>Run again</Text>
        </Pressable>
      </View>

      {rows.length > 0 && (
        <View style={styles.results}>
          {rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue}>{r.value}</Text>
            </View>
          ))}
          <Text style={styles.footnote}>
            &ldquo;Run again&rdquo; reuses the cached result for the same settings — the case
            that matters most, since people rarely change their commute limit.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  h1: { ...type.title, color: colors.ink },
  body: { ...type.body, color: colors.inkMid },
  stage: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.rule, paddingVertical: spacing.xl, alignItems: 'center',
    gap: spacing.md,
  },
  spinner: {
    width: 34, height: 34, borderRadius: radius.sm,
    backgroundColor: colors.copper,
  },
  stageText: { fontSize: 13, color: colors.inkLt, fontVariant: ['tabular-nums'] },
  spinRow: { flexDirection: 'row', gap: spacing.xxl },
  spinCol: { alignItems: 'center', gap: spacing.sm },
  spinnerNative: { backgroundColor: colors.ink },
  spinLabel: { fontSize: 12, fontWeight: '700', color: colors.inkMid },
  spinNote: { fontSize: 11, color: colors.inkGhost, marginTop: -4 },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.rule, gap: 2,
  },
  cardLabel: {
    fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase',
    color: colors.inkGhost, fontWeight: '700',
  },
  cardValue: { fontSize: 22, fontWeight: '700', color: colors.ink },
  cardNote: { fontSize: 12, color: colors.inkLt },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1, backgroundColor: colors.ink, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  btnAlt: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.ink },
  btnBusy: { opacity: 0.5 },
  btnText: { color: colors.cream, fontWeight: '700', fontSize: 15 },
  btnTextAlt: { color: colors.ink },
  results: { gap: spacing.sm, marginTop: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.rule,
  },
  rowLabel: { fontSize: 14, color: colors.inkMid },
  rowValue: { fontSize: 16, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  footnote: { fontSize: 12, lineHeight: 17, color: colors.inkLt, marginTop: spacing.xs },
});
