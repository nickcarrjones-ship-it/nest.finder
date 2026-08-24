import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { colors, type } from '../theme';

/**
 * The real Maloca brand mark, rebuilt natively. Repositioned 2026-08-24
 * (Nick's original design intent, not the web app's own layout): the key
 * sits BENEATH the wordmark, spanning its full measured width, so "Maloca"
 * reads as sitting on top of it — like a signature resting on a baseline.
 * The web app's inline SVG (index.html:355-384) instead puts the key
 * beside the word; that's the source geometry, not the target layout.
 *
 * Drawn from plain Views rather than SVG on purpose: react-native-svg is a
 * native dependency, and adding one means another prebuild + pod install +
 * EAS rebuild cycle on both platforms before anything is even testable.
 * The key is entirely circles and rectangles, so Views reproduce it exactly
 * — coordinates below are the SVG's own, offset to the mark's bounding box
 * (x from 164, y from 5).
 *
 * The wordmark is Outfit Light in the web app; that font isn't loaded on
 * mobile yet (see theme/index.ts). Weight bumped 300 -> 500 (2026-08-24) —
 * a synthetic "light" on the plain system face read as merely thin next to
 * the app's genuinely bold headings, not as the deliberate brand light Outfit
 * itself would carry. Loading the real face is the actual fix; that needs
 * expo-font wired up and confirmed linked in a fresh build, not done blind
 * mid-session against an already-installed binary.
 */

interface Props {
  /** 1 = the SVG's own size: ~34px wordmark, key matched to its width. */
  scale?: number;
  tagline?: boolean;
}

export function MalocaLogo({ scale = 1, tagline = false }: Props) {
  // Seeded with a same-ballpark estimate so the key doesn't pop in from
  // zero width on the first frame; onLayout then locks it to the real
  // rendered width once the wordmark actually paints.
  const [wordmarkWidth, setWordmarkWidth] = useState(112 * scale);

  const onWordmarkLayout = (e: LayoutChangeEvent) => {
    setWordmarkWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.block}>
      <Text
        style={[styles.wordmark, { fontSize: 34 * scale }]}
        onLayout={onWordmarkLayout}
      >
        Maloca
      </Text>
      <View style={styles.keyUnderline}>
        <MalocaKey width={wordmarkWidth} />
      </View>
      {tagline && (
        <Text style={[styles.tagline, { fontSize: 12 * scale }]}>
          a new way to find your perfect home.
        </Text>
      )}
    </View>
  );
}

interface KeyProps {
  /** SVG scale — the key's natural size, unrelated to the wordmark. */
  scale?: number;
  /** Exact px the key should span — overrides `scale` when given, used to
   *  lock the key to the wordmark's own measured width. */
  width?: number;
}

/** The key alone — bow (three concentric circles), shaft, teeth. */
export function MalocaKey({ scale = 1, width }: KeyProps) {
  const s = width !== undefined ? width / 129 : scale * 0.42;
  const px = (n: number) => n * s;

  return (
    <View style={{ width: px(129), height: px(20) }}>
      {/* Bow — outer ring, inner ring, centre dot */}
      <View
        style={[
          styles.abs,
          {
            left: 0, top: 0,
            width: px(20), height: px(20), borderRadius: px(10),
            borderWidth: Math.max(1, px(2.5)), borderColor: colors.logoRed,
          },
        ]}
      />
      <View
        style={[
          styles.abs,
          {
            left: px(4.5), top: px(4.5),
            width: px(11), height: px(11), borderRadius: px(5.5),
            borderWidth: Math.max(0.8, px(2)), borderColor: colors.logoRed,
          },
        ]}
      />
      <View
        style={[
          styles.abs,
          {
            left: px(8), top: px(8),
            width: px(4), height: px(4), borderRadius: px(2),
            backgroundColor: colors.logoRed,
          },
        ]}
      />
      {/* Shaft */}
      <View
        style={[
          styles.abs,
          {
            left: px(19), top: px(8),
            width: px(110), height: Math.max(1.5, px(4)), borderRadius: px(1.5),
            backgroundColor: colors.logoRed,
          },
        ]}
      />
      {/* Teeth, then the solid end block */}
      {TEETH.map(([left, width2, height], i) => (
        <View
          key={i}
          style={[
            styles.abs,
            {
              left: px(left), top: px(12),
              width: px(width2), height: px(height), borderRadius: px(1),
              backgroundColor: colors.logoRed,
            },
          ]}
        />
      ))}
    </View>
  );
}

/** [left, width, height] in SVG units, relative to the mark's bounding box. */
const TEETH: [number, number, number][] = [
  [37, 4, 7],
  [52, 4, 4],
  [67, 4, 8],
  [82, 4, 5],
  [97, 4, 6],
  [112, 4, 4],
  [111, 18, 7],
];

const styles = StyleSheet.create({
  block: { alignItems: 'flex-start' },
  wordmark: { fontWeight: '500', color: colors.ink, letterSpacing: 0.3 },
  // Tight gap so the key reads as a base the word rests on, not a separate
  // element floating underneath it.
  keyUnderline: { marginTop: 2 },
  tagline: { ...type.body, color: colors.inkMid, marginTop: 6 },
  abs: { position: 'absolute' },
});
