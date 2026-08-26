import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
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
      {/* The counter is drawn a HAIR oversized (radius 5.5 against the
          arch's inner radius of 5) so it tucks under the arch instead of
          meeting it on a shared edge. Two shapes that share an exact edge
          each anti-alias against the background, leaving a visible hairline
          of page colour between them — which is what Nick saw around the
          teal and the right leg (2026-08-26). It paints first, so the arch
          covers the overlap and the extra never shows. Its flat bottom
          stays exactly on the baseline. */}
      {showFill && (
        <View
          style={[
            styles.abs,
            {
              left: px(49.5), top: px(19.5),
              width: px(11), height: px(5.5),
              borderTopLeftRadius: px(5.5), borderTopRightRadius: px(5.5),
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
          the uneven drop keeps it in step with the uneven arches.

          Each starts 0.6 units ABOVE the baseline and is that much taller,
          so the foot lands exactly where it should while the top overlaps
          the arch above rather than butting against it — the same
          anti-aliasing seam the counter avoids. Legs paint last, so the
          overlap is hidden under solid ink. Keep top and height moving
          together: the short leg's foot at 33 units is what the joined
          lockup seats the wordmark on. */}
      <View
        style={[
          styles.abs,
          { left: 0, top: px(24.4), width: px(12), height: px(16.6), backgroundColor: markColor },
        ]}
      />
      <View
        style={[
          styles.abs,
          { left: px(60), top: px(24.4), width: px(12), height: px(8.6), backgroundColor: markColor },
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
 * Widths at font size 1, as STARTING ESTIMATES only.
 *
 * These came from the real TTFs (hmtx advances / unitsPerEm), which is
 * exact for the font file but NOT for what a platform actually paints:
 * Android rendered the wordmark visibly narrower than the metrics predict,
 * so the block fell short of the button and read as left-shifted while iOS
 * looked right (Nick, 2026-08-26). Rather than carry a per-platform fudge,
 * the component measures what it actually drew and re-solves — see
 * useFittedText. These values only decide the first frame.
 *
 * MARK_EM is the mark itself: 72 design units minus the 1-unit tuck, over
 * 50 units per em. That one IS exact — it's geometry we draw ourselves,
 * not text — so it is never re-measured.
 */
const MARK_EM = 71 / 50;
const WORD_EM_ESTIMATE = 2.4142 - 0.15; // "aloca" at -0.03em tracking
const TAGLINE_EM_ESTIMATE = 15.4333;
/** Overshooting means the tagline wraps, so aim a hair under the target. */
const FIT_SAFETY = 0.995;

/**
 * Remembers the real rendered width of a piece of text, expressed per unit
 * of font size, so the next render can solve for an exact width.
 *
 * Converges in one extra frame: draw at the estimate, measure, re-solve.
 * Guarded two ways against a feedback loop — changes under 0.5% are
 * ignored, and it stops adjusting after a few corrections, since text
 * width is linear in font size and anything still moving is noise.
 */
function useFittedText(estimate: number): [number, (width: number, fontSize: number) => void] {
  const [em, setEm] = useState(estimate);
  const corrections = useRef(0);
  const measure = useCallback((width: number, fontSize: number) => {
    if (!width || !fontSize || corrections.current > 3) return;
    const actual = width / fontSize;
    setEm((prev) => {
      if (Math.abs(actual - prev) / prev < 0.005) return prev;
      corrections.current += 1;
      return actual;
    });
  }, []);
  return [em, measure];
}

/** See the tagline block below — the cap only applies to `scale` sizing. */
const TAGLINE_MAX_SIZE = 19;

/** The wordmark: [mark-as-m]aloca, joined on a shared baseline. */
export function MalocaLogo({ scale = 1, tagline = false, fitWidth }: Props) {
  const [wordEm, measureWord] = useFittedText(WORD_EM_ESTIMATE);
  const [tagEm, measureTagline] = useFittedText(TAGLINE_EM_ESTIMATE);

  // Solve for the size that makes each line exactly fitWidth, so the
  // wordmark and the tagline end on the same edge. The mark's share of the
  // lockup is exact geometry; only the text part is measured.
  const target = fitWidth ? fitWidth * FIT_SAFETY : 0;
  const fontSize = fitWidth ? target / (MARK_EM + wordEm) : 34 * scale;
  const taglineSize = fitWidth
    ? target / tagEm
    : Math.min(12 * scale, TAGLINE_MAX_SIZE);
  const u = fontSize / 50; // one design unit (x-height 0.5em / 25 units)

  const onWordLayout = (e: LayoutChangeEvent) => {
    if (fitWidth) measureWord(e.nativeEvent.layout.width, fontSize);
  };
  const onTaglineLayout = (e: LayoutChangeEvent) => {
    if (fitWidth) measureTagline(e.nativeEvent.layout.width, taglineSize);
  };

  return (
    <View style={styles.block}>
      <View style={styles.lockup}>
        <MalocaMark height={u * 41} joined />
        <Text
          onLayout={onWordLayout}
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
          onLayout={onTaglineLayout}
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
