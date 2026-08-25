import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

/**
 * The 4b brand mark — "the uneven span" (Claude Design "Maloca app logo
 * concepts", Round 04) — used AS the letter m: the lockup is the mark
 * joined straight into "aloca" so the whole thing reads as one
 * handwritten-feeling word (Nick, 2026-08-25). The mark's arches span
 * exactly the font's x-height (Familjen Grotesk's x-height is 0.5 em —
 * read from the TTF's OS/2 table, so one design unit = fontSize / 50 and
 * the arch tops line up with the a/o/c tops precisely, not approximately),
 * its open right terminal tucks into the first "a", and the single leg
 * drops below the text baseline like a signature flourish.
 *
 * Drawn from plain Views rather than SVG on purpose — react-native-svg is
 * a native dependency and would cost a prebuild + EAS rebuild cycle. Each
 * arch is a full ring View clipped to its top half by an overflow:hidden
 * parent (a clean butt-capped semicircle, matching the doc's SVG strokes).
 * Doc geometry, 100-unit viewBox: big arch baseline y=55, x 20-58 (r19);
 * small arch x 58-80 (r11); leg at x=20 down to y=71; strokes 12; teal
 * half-disc x 64-74 (r5). Offsets below are to the mark's tight box
 * (x from 14, y from 30): 72 wide, 25 above the arch baseline, leg 16 below.
 *
 * Baseline trick: in the joined lockup the mark's container is exactly the
 * above-baseline 25 units tall and ALL its children are position:absolute
 * (the leg hanging out the bottom, overflow visible) — Yoga gives a view
 * whose children are all absolute a baseline at its own bottom edge, so
 * alignItems:'baseline' in the row seats the mark on the text baseline
 * with no font-metric guesswork.
 */

interface MarkProps {
  /** Mark height in px for the full 41-unit box (standalone use). */
  height?: number;
  /**
   * Lockup mode: the container ends at the arch baseline (25 of 41 units)
   * and the leg overflows below, so a baseline-aligned row seats the
   * arches on the text baseline.
   */
  joined?: boolean;
}

/** The mark alone — big arch, small arch, leg, teal counter. */
export function MalocaMark({ height = 41, joined = false }: MarkProps) {
  const s = height / 41;
  const px = (n: number) => n * s;
  // Per the doc, the teal fill drops at tiny sizes — the counter void is
  // smaller than a pixel there and the silhouette alone still reads.
  const showFill = height >= 10;

  return (
    <View style={{ width: px(72), height: joined ? px(25) : px(41) }}>
      {showFill && (
        <View
          style={[
            styles.abs,
            {
              left: px(50), top: px(20),
              width: px(10), height: px(5),
              borderTopLeftRadius: px(5), borderTopRightRadius: px(5),
              backgroundColor: colors.teal,
            },
          ]}
        />
      )}
      {/* Big arch — ring clipped to its top half */}
      <View style={[styles.abs, styles.clip, { left: 0, top: 0, width: px(50), height: px(25) }]}>
        <View
          style={{
            width: px(50), height: px(50), borderRadius: px(25),
            borderWidth: px(12), borderColor: colors.ink,
          }}
        />
      </View>
      {/* Small arch */}
      <View style={[styles.abs, styles.clip, { left: px(38), top: px(8), width: px(34), height: px(17) }]}>
        <View
          style={{
            width: px(34), height: px(34), borderRadius: px(17),
            borderWidth: px(12), borderColor: colors.ink,
          }}
        />
      </View>
      {/* Leg — below the arch baseline; in joined mode it simply overflows
          the container, which is what puts it under the text baseline. */}
      <View
        style={[
          styles.abs,
          { left: 0, top: px(25), width: px(12), height: px(16), backgroundColor: colors.ink },
        ]}
      />
    </View>
  );
}

interface Props {
  /** 1 = 34px wordmark; everything scales from the font size. */
  scale?: number;
  tagline?: boolean;
}

/** The wordmark: [mark-as-m]aloca, joined on a shared baseline. */
export function MalocaLogo({ scale = 1, tagline = false }: Props) {
  const fontSize = 34 * scale;
  const u = fontSize / 50; // one design unit (x-height 0.5em / 25 units)

  return (
    <View style={styles.block}>
      <View style={styles.lockup}>
        <MalocaMark height={u * 41} joined />
        <Text
          style={[
            styles.wordmark,
            // Tucked one unit under the arch terminal so mark and word
            // read as a single written gesture, not two parts.
            { fontSize, letterSpacing: -0.03 * fontSize, marginLeft: -u },
          ]}
        >
          aloca
        </Text>
      </View>
      {tagline && (
        // marginTop clears the leg's flourish, which hangs ~0.32em below
        // the baseline (deeper than the font's own descenders).
        <Text style={[styles.tagline, { fontSize: 12 * scale, marginTop: 6 + u * 6 }]}>
          a new way to find your perfect home.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'flex-start' },
  lockup: { flexDirection: 'row', alignItems: 'baseline' },
  wordmark: { fontFamily: fonts.medium, color: colors.ink },
  tagline: { fontFamily: fonts.regular, color: colors.inkMid },
  abs: { position: 'absolute' },
  clip: { overflow: 'hidden' },
});
