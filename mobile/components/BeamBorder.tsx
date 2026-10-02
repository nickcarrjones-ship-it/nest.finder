import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from './ThinkingOrb';
import { colors } from '../theme';

/**
 * A beam of light running round a button's edge (Nick, 2026-10-02).
 *
 * The button sits inside a thin ring. A short comet - a head and a fading
 * tail of small round blobs - travels round the middle of that ring at a
 * steady speed, curving with the corners. The button covers the inside and
 * the ring's own rounded clip trims the outside, so all that shows is a
 * streak of light chasing round the border.
 *
 * Plain Views and the native animation driver: no gradient or drawing
 * library (none is in the app, and adding one would need a new App Store
 * build), and nothing for the JS thread to do once it starts. Reduce
 * Motion gets the button with no beam.
 */

/** Points round the ring's centre line, clockwise, with how far along each one is (0-1). */
function ringPath(w: number, h: number, radius: number, inset: number) {
  const [x0, y0, x1, y1] = [inset, inset, w - inset, h - inset];
  const r = Math.max(0, Math.min(radius - inset, (x1 - x0) / 2, (y1 - y0) / 2));
  const pts: [number, number][] = [];
  const corner = (cx: number, cy: number, from: number) => {
    for (let k = 0; k <= 6; k++) {
      const a = from + (k / 6) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(x0 + r, y0 + r, Math.PI); // top left
  corner(x1 - r, y0 + r, -Math.PI / 2); // top right
  corner(x1 - r, y1 - r, 0); // bottom right
  corner(x0 + r, y1 - r, Math.PI / 2); // bottom left
  pts.push(pts[0]);

  const xs: number[] = [];
  const ys: number[] = [];
  const along: number[] = [];
  let total = 0;
  pts.forEach(([x, y], i) => {
    if (i > 0) {
      const step = Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
      // Interpolation needs strictly increasing stops.
      if (step < 0.01) return;
      total += step;
    }
    xs.push(x);
    ys.push(y);
    along.push(total);
  });
  return { xs, ys, at: along.map((d) => d / total), length: total };
}

const TAIL = 18;

export function BeamBorder({
  children,
  radius,
  width = 2,
  ring = colors.teal,
  beam = colors.white,
  lapMs = 3600,
  style,
}: {
  children: ReactNode;
  /** The button's corner radius. */
  radius: number;
  /** How thick the ring is. */
  width?: number;
  /** The ring's colour where the beam isn't. */
  ring?: string;
  beam?: string;
  /** How long one lap takes. */
  lapMs?: number;
  /** For the outside - shadow, margins. */
  style?: StyleProp<ViewStyle>;
}) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const lap = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const run = Animated.loop(
      Animated.timing(lap, { toValue: 1, duration: lapMs, easing: Easing.linear, useNativeDriver: true }),
    );
    run.start();
    return () => run.stop();
  }, [lap, lapMs, reduceMotion]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (!box || box.w !== w || box.h !== h) setBox({ w, h });
  };

  // Blobs a little wider than the ring, so the beam fills it edge to edge.
  const blob = width * 3;
  const comet = useMemo(() => {
    if (!box) return [];
    const path = ringPath(box.w, box.h, radius, width / 2);
    const gap = Math.max(2, width * 1.5) / path.length;
    return Array.from({ length: TAIL }, (_, k) => {
      const where = Animated.modulo(Animated.add(lap, 1 - k * gap), 1);
      return {
        key: k,
        x: where.interpolate({ inputRange: path.at, outputRange: path.xs.map((x) => x - blob / 2) }),
        y: where.interpolate({ inputRange: path.at, outputRange: path.ys.map((y) => y - blob / 2) }),
        opacity: (1 - k / TAIL) ** 1.6,
      };
    });
  }, [box, radius, width, lap, blob]);

  return (
    <View style={[{ borderRadius: radius, backgroundColor: ring }, style]}>
      <View
        style={{ borderRadius: radius, overflow: 'hidden', padding: width, backgroundColor: ring }}
        onLayout={onLayout}
      >
        {!reduceMotion &&
          comet.map(({ key, x, y, opacity }) => (
            <Animated.View
              key={key}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: blob,
                height: blob,
                borderRadius: blob / 2,
                backgroundColor: beam,
                opacity,
                transform: [{ translateX: x }, { translateY: y }],
              }}
            />
          ))}
        {children}
      </View>
    </View>
  );
}
