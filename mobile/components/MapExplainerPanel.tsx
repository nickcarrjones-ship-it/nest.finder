import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../theme';
import { SparkleMark, RankMark } from './BrandMarks';
import { MapLegendRows } from './MapLegend';
import type { Member } from '../lib/types';

interface Props {
  members: Member[];
  maxCommuteMins: number;
  /** Reachable areas at the current setting — the pitch's hook is their own
   *  real number, not a generic claim. 0 while still computing, which the
   *  copy falls back gracefully for. */
  areaCount: number;
  signedIn: boolean;
  busy: boolean;
  onPress: () => void;
}

/**
 * The first-run explainer — bottom-anchored, deliberately NOT a card
 * floating over the middle of the map (Nick, 2026-08-23: a centred card
 * hid the very thing it was talking about, leaving "half a map with some
 * polygons on it"). It sits where the layer toggles and tab bar normally
 * live, both of which are hidden at this stage, so the map above it is
 * fully visible while this names what's on it.
 *
 * It reads the REAL profile rather than generic copy — actual names, the
 * actual commute number — because the whole point of this stage is showing
 * someone their own answer before asking them for anything else.
 */
export function MapExplainerPanel({
  members, maxCommuteMins, areaCount, signedIn, busy, onPress,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.md }]}>
      <MapLegendRows members={members} maxCommuteMins={maxCommuteMins} />

      <View style={styles.rule} />

      {signedIn ? (
        <Text style={styles.pitch}>
          Now let’s find which of these areas actually suit you — a few quick
          questions, by voice or text.
        </Text>
      ) : (
        <>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>Powered by Maloca AI</Text>
          </View>
          <Text style={styles.hook}>
            {areaCount > 0 ? `${areaCount} areas fit your commute.` : 'That’s the easy part.'}
          </Text>
          <Text style={styles.hookSub}>
            Now find the ones that fit your <Text style={styles.hookItalic}>vibe</Text>.
          </Text>

          <View style={styles.valueRow}>
            <SparkleMark solid />
            <View style={styles.valueCopy}>
              <Text style={styles.valueHead}>Find your perfect area</Text>
              <Text style={styles.valueText}>
                Maloca AI ranks every area inside your commute — so you know exactly where to look
              </Text>
            </View>
          </View>
          <View style={styles.valueRow}>
            <RankMark solid />
            <View style={styles.valueCopy}>
              <Text style={styles.valueHead}>Never lose track of a viewing</Text>
              <Text style={styles.valueText}>
                Score every place you see, kept in one list and synced to your calendar
              </Text>
            </View>
          </View>

          <Text style={styles.combo}>One sign-in unlocks both.</Text>
        </>
      )}

      <Pressable
        onPress={onPress}
        disabled={busy}
        style={[styles.cta, busy && styles.ctaBusy]}
        accessibilityRole="button"
        accessibilityLabel={signedIn ? 'Start with the Maloca Agent' : 'Sign in with Google'}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={styles.ctaText}>
            {signedIn ? 'Find my areas  →' : 'Unlock pro features with Google  →'}
          </Text>
        )}
      </Pressable>
      {!signedIn && (
        <Text style={styles.ctaFoot}>Free · takes about a minute</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  rule: {
    height: 1,
    backgroundColor: colors.rule,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  pitch: {
    ...type.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.inkLt,
    marginBottom: spacing.md,
  },
  aiBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(180,85,47,0.12)',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  aiBadgeText: { ...type.bodyStrong, fontSize: 10.5, letterSpacing: 0.4, color: colors.teal },
  hook: {
    ...type.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  hookItalic: { fontStyle: 'italic' },
  hookSub: {
    ...type.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: colors.teal,
    marginBottom: spacing.lg,
  },
  ctaFoot: {
    ...type.body,
    fontSize: 11.5,
    color: colors.inkGhost,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  valueCopy: { flex: 1, gap: 1 },
  valueHead: { ...type.bodyStrong, fontSize: 14, color: colors.ink },
  valueText: { ...type.body, fontSize: 12.5, lineHeight: 16.5, color: colors.inkLt },
  // The line that ties the two value rows together right before the ask —
  // "no real pull" was Nick's read on the button alone (2026-08-24); this
  // is what makes the button's promise land as BOTH features, not just
  // whichever one someone's eye lingered on.
  combo: {
    ...type.bodyStrong,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  cta: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  ctaBusy: { opacity: 0.7 },
  ctaText: { ...type.bodyStrong, fontSize: 15.5, color: colors.white },
});
