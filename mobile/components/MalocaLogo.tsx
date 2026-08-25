import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

/**
 * The 4b brand mark — "the uneven span" (Claude Design "Maloca app logo
 * concepts", Round 04, 2026-08-25). A big roof and a small one on a shared
 * baseline, grounded by a single leg, the small counter filled teal: the
 * shortlist and the one you take. This replaces the old wordmark-over-key
 * logo entirely (the key, its TEETH geometry and the logoRed colour are
 * retired on Nick's instruction).
 *
 * Drawn from plain Views rather than SVG on purpose — same reasoning as
 * the old key: react-native-svg is a native dependency, and adding one
 * means another prebuild + EAS rebuild cycle before anything is testable.
 * Each arch is a full ring View clipped to its top half by an
 * overflow:hidden parent, which reproduces the SVG's butt-capped
 * semicircle strokes exactly (the cut is a clean horizontal line at the
 * baseline, no border-bevel artifacts). Coordinates are the design doc's
 * own 100-unit viewBox values, offset to the mark's tight bounding box
 * (x from 14, y from 30; the box is 72 x 41 units).
 *
 * Doc geometry (4b Regular): big arch baseline y=55, x 20-58 (r19); small
 * arch x 58-80 (r11); leg at x=20 down to y=71; all strokes 12 wide; teal
 * half-disc x 64-74 (r5). The doc's below-22px stroke step-up isn't
 * implemented — nothing in the app renders the mark that small.
 */

interface MarkProps {
  /** Mark height in px (the box is 72:41, width follows). */
  height?: number;
}

/** The mark alone — big arch, small arch, leg, teal counter. */
export function MalocaMark({ height = 41 }: MarkProps) {
  const s = height / 41;
  const px = (n: number) => n * s;
  // Per the doc, the teal fill is dropped at tiny sizes — the counter void
  // is smaller than a pixel there and the silhouette alone still reads.
  const showFill = height >= 10;

  return (
    <View style={{ width: px(72), height: px(41) }}>
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
      {/* Leg */}
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
  /** 1 = 34px wordmark, mark scaled to match (the doc's lockup ratios). */
  scale?: number;
  tagline?: boolean;
}

/**
 * The horizontal lockup from the doc's "4b in use" sheet: mark left,
 * lowercase wordmark right, optically centred. Mark height, gap and
 * tracking all follow the doc's lockup-scale ratios (mark ~0.47x the
 * word size, gap ~0.5x, tracking -3%).
 */
export function MalocaLogo({ scale = 1, tagline = false }: Props) {
  const fontSize = 34 * scale;

  return (
    <View style={styles.block}>
      <View style={[styles.lockup, { gap: fontSize * 0.5 }]}>
        <MalocaMark height={fontSize * 0.47} />
        <Text style={[styles.wordmark, { fontSize, letterSpacing: -0.03 * fontSize }]}>
          maloca
        </Text>
      </View>
      {tagline && (
        <Text style={[styles.tagline, { fontSize: 12 * scale }]}>
          a new way to find your perfect home.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'flex-start' },
  lockup: { flexDirection: 'row', alignItems: 'center' },
  wordmark: { fontFamily: fonts.medium, color: colors.ink },
  tagline: { fontFamily: fonts.regular, color: colors.inkMid, marginTop: 8 },
  abs: { position: 'absolute' },
  clip: { overflow: 'hidden' },
});
