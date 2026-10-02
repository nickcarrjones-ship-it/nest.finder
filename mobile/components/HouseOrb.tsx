import { useEffect, useState } from 'react';
import { houseFrame, type HouseFrame, type HouseTimeline } from '../lib/houseOrb';
import { OrbMarks, useReduceMotion } from './ThinkingOrb';
import { colors } from '../theme';

/**
 * The orb that builds homes - a house, flats, a walking zone
 * (lib/houseOrb.ts has the shapes and the timing). Drawn by the same
 * renderer as the Ask orb, so the two read as one family.
 */
export function HouseOrb({
  size = 128,
  timeline = 'once',
  color = colors.teal,
}: {
  size?: number;
  timeline?: HouseTimeline;
  color?: string;
}) {
  const reduceMotion = useReduceMotion();
  const [frame, setFrame] = useState<HouseFrame>(() => houseFrame(size, 0, timeline));

  useEffect(() => {
    // Reduce Motion skips straight to the finished house, standing still.
    if (reduceMotion) {
      setFrame(houseFrame(size, 60, 'once', true));
      return;
    }
    const start = performance.now();
    let raf = 0;
    const loop = () => {
      setFrame(houseFrame(size, (performance.now() - start) / 1000, timeline));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size, timeline, reduceMotion]);

  return <OrbMarks frame={frame} size={size} color={color} />;
}
