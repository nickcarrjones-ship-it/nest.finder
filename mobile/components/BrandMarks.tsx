import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';

/**
 * The three onboarding icons, drawn as geometry rather than emoji —
 * 2026-08-23: stock emoji read as placeholder art and carry none of the
 * brand. These are built from Views (no SVG dependency, see MalocaLogo.tsx
 * for why) and each one echoes something real in the product rather than
 * being decorative: the reach ring is the map's polygon, the ranked bars
 * are the shortlist.
 *
 * Each sits in a soft-tinted tile with the saturated mark inside — the
 * modern chip treatment.
 */

/**
 * Two tones only — teal and ink, the two colours the 4b mark itself is
 * made of. The third tone used to be terracotta, and it was the last
 * thing in the app still reading as the old copper scheme (Nick spotted
 * it on the "Find your perfect area" row, 2026-08-26).
 */
type Tone = 'teal' | 'ink';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  teal: { bg: colors.tealSoft, fg: colors.teal },
  ink: { bg: 'rgba(34,40,46,0.08)', fg: colors.ink },
};

/**
 * `solid` inverts the treatment — saturated tile, white mark. The soft
 * version suits the calm welcome screen; the sign-in pitch needs to carry
 * more weight than a tint (2026-08-23), so that one uses solid.
 */
function Tile({ tone, solid, children }: { tone: Tone; solid?: boolean; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: solid ? TONES[tone].fg : TONES[tone].bg },
        solid && styles.tileSolid,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A sparkle — the near-universal shorthand for "AI did this". Two diamonds
 * at different scales, which is what a 4-point sparkle reduces to once you
 * only have Views to draw with.
 */
export function SparkleMark({ solid }: { solid?: boolean } = {}) {
  const fg = solid ? colors.white : TONES.teal.fg;
  return (
    <Tile tone="teal" solid={solid}>
      <View style={[styles.sparkBig, { backgroundColor: fg }]} />
      <View style={[styles.sparkSmall, { backgroundColor: fg }]} />
    </Tile>
  );
}

/** Concentric ring — the commute region, drawn small. */
export function ReachMark() {
  const fg = TONES.teal.fg;
  return (
    <Tile tone="teal">
      <View style={[styles.ring, { borderColor: fg }]} />
      <View style={[styles.ringDot, { backgroundColor: fg }]} />
    </Tile>
  );
}

/** A diamond — the "picks" bubble language, abstracted. */
export function VibeMark() {
  const fg = TONES.teal.fg;
  return (
    <Tile tone="teal">
      <View style={[styles.diamond, { backgroundColor: fg }]} />
    </Tile>
  );
}

/** Three bars, descending — a ranked shortlist. */
export function RankMark({ solid }: { solid?: boolean } = {}) {
  const fg = solid ? colors.white : TONES.ink.fg;
  return (
    <Tile tone="ink" solid={solid}>
      <View style={styles.bars}>
        <View style={[styles.bar, { width: 16, backgroundColor: fg }]} />
        <View style={[styles.bar, { width: 11, backgroundColor: fg, opacity: 0.62 }]} />
        <View style={[styles.bar, { width: 7, backgroundColor: fg, opacity: 0.34 }]} />
      </View>
    </Tile>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 42,
    height: 42,
    borderRadius: radius.lg + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSolid: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  sparkBig: { width: 15, height: 15, borderRadius: 3.5, transform: [{ rotate: '45deg' }], marginTop: 3, marginRight: 4 },
  sparkSmall: {
    position: 'absolute', top: 9, right: 8,
    width: 7, height: 7, borderRadius: 1.8, transform: [{ rotate: '45deg' }],
  },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  ringDot: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5 },
  diamond: { width: 15, height: 15, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  bars: { gap: 3.5 },
  bar: { height: 3, borderRadius: 2 },
});
