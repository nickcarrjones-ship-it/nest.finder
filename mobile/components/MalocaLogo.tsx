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
 * small arch x 58-80 (r11); legs at x=20 (down to y=71) and x=80 (down to
 * y=63, half the drop); strokes 12; teal half-disc x 64-74 (r5). Offsets
 * below are to the mark's tight box (x from 14, y from 30): 72 wide, 25
 * above the arch baseline, long leg 16 below. The second leg is this
 * app's own addition to the doc's 4b drawing.
 *
 * Baseline trick: in the joined lockup the mark's container ends at the
 * short leg's foot (33 units) and ALL its children are position:absolute
 * (the long leg hanging out the bottom, overflow visible) — Yoga gives a
 * view whose children are all absolute a baseline at its own bottom edge,
 * so alignItems:'baseline' in the row seats the word on that foot with no
 * font-metric guesswork.
 */

interface MarkProps {
  /** Mark height in px for the full 41-unit box (standalone use). */
  height?: number;
  /**
   * Lockup mode: the container ends at the SHORT leg's foot (33 of 41
   * units) and the long leg overflows below, so a baseline-aligned row
   * seats the word on the short leg's base — the m's last stem and the
   * "a" stand on one line, with only the long leg dropping below as the
   * flourish (Nick, 2026-08-26: the word was floating too high when the
   * arch baseline was the seat).
   */
  joined?: boolean;
  /** Arches and legs. Defaults to ink — override to sit on a dark fill. */
  markColor?: string;
  /** The small counter fill. Defaults to the brand teal. */
  counterColor?: string;
}

/** The mark alone — big arch, small arch, legs, teal counter. */
export function MalocaMark({
  height = 41,
  joined = false,
  markColor = colors.ink,
  counterColor = colors.teal,
}: MarkProps) {
  const s = height / 41;
  const px = (n: number) => n * s;
  // Per the doc, the teal fill drops at tiny sizes — the counter void is
  // smaller than a pixel there and the silhouette alone still reads.
  const showFill = height >= 10;

  return (
    <View style={{ width: px(72), height: joined ? px(33) : px(41) }}>
      {showFill && (
        <View
          style={[
            styles.abs,
            {
              left: px(50), top: px(20),
              width: px(10), height: px(5),
              borderTopLeftRadius: px(5), borderTopRightRadius: px(5),
              backgroundColor: counterColor,
            },
          ]}
        />
      )}
      {/* Big arch — ring clipped to its top half */}
      <View style={[styles.abs, styles.clip, { left: 0, top: 0, width: px(50), height: px(25) }]}>
        <View
          style={{
            width: px(50), height: px(50), borderRadius: px(25),
            borderWidth: px(12), borderColor: markColor,
          }}
        />
      </View>
      {/* Small arch */}
      <View style={[styles.abs, styles.clip, { left: px(38), top: px(8), width: px(34), height: px(17) }]}>
        <View
          style={{
            width: px(34), height: px(34), borderRadius: px(17),
            borderWidth: px(12), borderColor: markColor,
          }}
        />
      </View>
      {/* Legs — below the arch baseline; in joined mode they simply overflow
          the container, which is what puts them under the text baseline.
          The right one drops half as far (8 units to the left's 16): that
          second stem is what makes the mark read as a lowercase m rather
          than two spans balanced on a single post (Nick, 2026-08-26), and
          the uneven drop keeps it in step with the uneven arches. */}
      <View
        style={[
          styles.abs,
          { left: 0, top: px(25), width: px(12), height: px(16), backgroundColor: markColor },
        ]}
      />
      <View
        style={[
          styles.abs,
          { left: px(60), top: px(25), width: px(12), height: px(8), backgroundColor: markColor },
        ]}
      />
    </View>
  );
}

interface Props {
  /** 1 = 34px wordmark; everything scales from the font size. Ignored when
   *  fitWidth is given. */
  scale?: number;
  tagline?: boolean;
  /**
   * Size the lockup — and the tagline with it — to be exactly this wide.
   * Both lines then share an edge with each other and with whatever sets
   * the width (on the landing screen, the Get started button), instead of
   * each being whatever size its own text happens to come out at.
   */
  fitWidth?: number;
}

/**
 * Width of each line at font size 1, measured from the real TTFs
 * (hmtx advances / unitsPerEm), so a size can be solved for a target width
 * instead of guessed and nudged.
 *
 * LOCKUP_EM covers the whole mark-plus-word: 72 design units of mark, minus
 * the 1-unit tuck, plus "aloca" at -0.03em tracking — 71/50 + (2.4142 -
 * 0.15). If the mark geometry or the wordmark text ever changes, these are
 * wrong and both lines will mis-size; recompute rather than adjust by eye.
 */
const LOCKUP_EM = 3.6842;
const TAGLINE_EM = 15.4333;
/** Kerning and hinting can render a hair wider than raw advances predict,
 *  and overshooting means the tagline wraps. A 1.5% haircut is invisible
 *  and makes overflow impossible. */
const FIT_SAFETY = 0.985;

/** See the tagline block below — the cap only applies to `scale` sizing. */
const TAGLINE_MAX_SIZE = 19;

/** The wordmark: [mark-as-m]aloca, joined on a shared baseline. */
export function MalocaLogo({ scale = 1, tagline = false, fitWidth }: Props) {
  // Solve for the size that makes each line exactly fitWidth, so the
  // wordmark and the tagline end on the same edge.
  const fontSize = fitWidth ? (fitWidth * FIT_SAFETY) / LOCKUP_EM : 34 * scale;
  const taglineSize = fitWidth
    ? (fitWidth * FIT_SAFETY) / TAGLINE_EM
    : Math.min(12 * scale, TAGLINE_MAX_SIZE);
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
        // Under fitWidth this is solved to match the lockup exactly. Under
        // plain `scale` it grows with the mark but stops at
        // TAGLINE_MAX_SIZE: the line is 35 characters and needs ~15.4x its
        // own font size in width, so past 19px it exceeds a 360pt phone and
        // wraps mid-phrase, which reads as a mistake rather than a break.
        //
        // No extra top clearance needed: the long leg drops 8 units (0.16em)
        // below the baseline, inside the font's own 0.225em descender space,
        // so it never reaches into this line.
        <Text
          numberOfLines={1}
          style={[
            styles.tagline,
            { fontSize: taglineSize, marginTop: taglineSize * 0.7 },
          ]}
        >
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
