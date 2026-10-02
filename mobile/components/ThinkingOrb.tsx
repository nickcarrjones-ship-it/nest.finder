import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { MODE_FRAMES, resolvePreset, type OrbFrame, type OrbSize, type OrbState } from 'thinking-orbs/engine';
import { colors } from '../theme';

/**
 * The animated "thinking" orb from thinking-orbs (Nick, 2026-10-02), drawn
 * natively.
 *
 * The package's own <ThinkingOrb> paints onto a browser canvas, which a
 * phone app doesn't have. Its engine, though, is pure maths - each frame is
 * just a list of dots and lines with positions, sizes and shades - so this
 * draws that list with ordinary Views. The animation is theirs; only the
 * drawing is ours. Pinned to an exact version in package.json so an update
 * can't change it unseen.
 */
interface Props {
  state?: OrbState;
  size?: OrbSize;
  /**
   * On-screen size in points, when it should differ from the preset. The
   * small presets are separate designs, not shrunk copies - "connecting"
   * has no lines at all at 20 - so drawing the 64 preset smaller is how to
   * keep its look at a modest size.
   */
  displaySize?: number;
  /** Ink tint as #rrggbb. Defaults to Maloca teal. */
  color?: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** The engine's light-background shading: white 0 is full ink, 1 fades to paper. */
function ink(tint: { r: number; g: number; b: number }, white: number, alpha = 1): string {
  const w = Math.min(1, Math.max(0, white));
  const ramp = (c: number) => Math.round(c + (255 - c) * w);
  return `rgba(${ramp(tint.r)},${ramp(tint.g)},${ramp(tint.b)},${alpha})`;
}

/** Whether the phone's Reduce Motion setting is on, kept live. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);
  return reduceMotion;
}

export function ThinkingOrb({ state = 'connecting', size = 20, displaySize, color = colors.teal }: Props) {
  const { mode, speed, opts } = useMemo(() => resolvePreset(state, size), [state, size]);
  const draw = MODE_FRAMES[mode];
  const [frame, setFrame] = useState<OrbFrame>(() => draw(size, 0.6, opts));
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    // Reduce Motion gets one still frame, as the web version does.
    if (reduceMotion) {
      setFrame(draw(size, 0.6, opts));
      return;
    }
    let raf = 0;
    const loop = () => {
      setFrame(draw(size, (performance.now() / 1000) * speed, opts));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, size, speed, opts, reduceMotion]);

  return <OrbMarks frame={frame} size={size} shown={displaySize ?? size} color={color} />;
}

/**
 * Draws one finished frame - lines first, so dots sit on top of their
 * edges, then dots far to near. Shared by every orb, including the house
 * on the welcome screen (components/HouseOrb.tsx).
 */
export function OrbMarks({
  frame,
  size,
  shown = size,
  color = colors.teal,
}: {
  frame: OrbFrame;
  /** The square the frame was worked out for. */
  size: number;
  /** The size it appears on screen. */
  shown?: number;
  color?: string;
}) {
  const tint = useMemo(() => hexToRgb(color), [color]);
  return (
    <View
      style={[styles.frame, { width: shown, height: shown }]}
      // Decoration: the words around it say what's happening.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={{ width: size, height: size, transform: [{ scale: shown / size }] }}>
        {frame.lines.map((l, i) => {
          const dx = l.x2 - l.x1;
          const dy = l.y2 - l.y1;
          const len = Math.hypot(dx, dy);
          return (
            <View
              key={`l${i}`}
              style={[
                styles.mark,
                {
                  left: (l.x1 + l.x2) / 2 - len / 2,
                  top: (l.y1 + l.y2) / 2 - l.w / 2,
                  width: len,
                  height: l.w,
                  backgroundColor: ink(tint, l.white, l.a ?? 1),
                  transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                },
              ]}
            />
          );
        })}
        {frame.dots.map((d, i) => (
          <View
            key={`d${i}`}
            style={[
              styles.mark,
              {
                left: d.x - d.r,
                top: d.y - d.r,
                width: d.r * 2,
                height: d.r * 2,
                borderRadius: d.r,
                backgroundColor: ink(tint, d.white, d.a ?? 1),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute' },
});
