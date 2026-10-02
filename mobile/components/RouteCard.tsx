import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { chipLabel, chipTextColour, lineColour, type PersonRoute } from '../lib/routes';
import { layoutRouteMap, routeMapFrame, ROUTE_TIMES, type RouteMapFrame } from '../lib/routeMap';
import { useReduceMotion } from './ThinkingOrb';
import THAMES from '../assets/data/thames-centreline.json';

/**
 * Each person's way to work from an area, as an animated map under the
 * Ask's answer (Nick, 2026-10-02 - option A of the two mock-ups): the real
 * track shapes in TfL's colours, the Thames in the welcome orb's teal, a
 * dot running each route, names at the offices. lib/routeMap.ts works out
 * the picture; this only draws it, with plain Views like the orbs.
 *
 * Runs for ROUTE_TIMES.settle seconds and then stops redrawing - a card
 * scrolled up the history should cost nothing. Reduce Motion gets the
 * finished map straight away.
 */
const MAP_H = 168;

export function RouteCard({ area, people }: { area: string; people: PersonRoute[] }) {
  const [width, setWidth] = useState(0);
  const reduceMotion = useReduceMotion();
  const layout = useMemo(
    () => (width > 0 ? layoutRouteMap(area, people, THAMES as [number, number][], width, MAP_H) : null),
    [area, people, width],
  );
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!layout || reduceMotion) return;
    const start = performance.now();
    let last = 0;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const s = (now - start) / 1000;
      // 30 frames a second is plenty, and halves the work.
      if (now - last >= 32) {
        last = now;
        setT(s);
      }
      if (s <= ROUTE_TIMES.settle + 0.6) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [layout, reduceMotion]);

  const frame = layout ? routeMapFrame(layout, t, reduceMotion) : null;

  return (
    <View style={styles.card}>
      <View
        style={styles.map}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {frame && <MapMarks frame={frame} width={width} />}
      </View>

      {people.map((p) => (
        <View key={p.name} style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
          <View style={styles.chips}>
            {p.route.legs.map((leg, i) => {
              const colour = lineColour(leg);
              const walk = leg.mode === 'walking';
              return (
                <View
                  key={i}
                  style={[styles.chip, walk ? styles.chipWalk : { backgroundColor: colour }]}
                >
                  <Text style={[styles.chipText, { color: walk ? colors.inkMid : chipTextColour(colour) }]}>
                    {chipLabel(leg).toUpperCase()}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.mins}>{p.route.mins} min</Text>
        </View>
      ))}
    </View>
  );
}

function MapMarks({ frame, width }: { frame: RouteMapFrame; width: number }) {
  return (
    <>
      {frame.segments.map((s, i) => {
        const dx = s.x2 - s.x1;
        const dy = s.y2 - s.y1;
        const len = Math.hypot(dx, dy);
        return (
          <View
            key={`s${i}`}
            style={{
              position: 'absolute',
              left: (s.x1 + s.x2) / 2 - len / 2 - s.w / 2,
              top: (s.y1 + s.y2) / 2 - s.w / 2,
              // A touch longer than the gap, so joins between segments
              // stay closed on the bends.
              width: len + s.w,
              height: s.w,
              borderRadius: s.w / 2,
              backgroundColor: s.color,
              opacity: s.a,
              transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
            }}
          />
        );
      })}
      {frame.dots.map((d, i) => (
        <View
          key={`d${i}`}
          style={{
            position: 'absolute',
            left: d.x - d.r,
            top: d.y - d.r,
            width: d.r * 2,
            height: d.r * 2,
            borderRadius: d.r,
            backgroundColor: d.color,
            opacity: d.a,
          }}
        />
      ))}
      {frame.rings.map((r, i) => (
        <View
          key={`r${i}`}
          style={[styles.ring, { left: r.x - r.r, top: r.y - r.r, width: r.r * 2, height: r.r * 2, borderRadius: r.r, opacity: r.a }]}
        />
      ))}
      {frame.labels.map((l, i) => (
        <Text
          key={`l${i}`}
          numberOfLines={1}
          style={[
            styles.label,
            { fontSize: l.size, top: l.y, opacity: l.a },
            l.align === 'left'
              ? { left: l.x }
              : l.align === 'right'
                ? { right: width - l.x, textAlign: 'right' }
                : { left: l.x - 60, width: 120, textAlign: 'center' },
          ]}
        >
          {l.text}
        </Text>
      ))}
      {frame.pills.map((p, i) => (
        <View key={`p${i}`} style={[styles.pill, { left: p.x, top: p.y, width: p.w, height: p.h, opacity: p.a }]}>
          <Text style={styles.pillText} numberOfLines={1}>{p.text}</Text>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  map: { height: MAP_H, overflow: 'hidden' },
  ring: { position: 'absolute', backgroundColor: colors.white, borderWidth: 1.6, borderColor: colors.ink },
  label: { position: 'absolute', fontFamily: fonts.regular, color: colors.inkMid },
  pill: {
    position: 'absolute',
    backgroundColor: colors.teal,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 9.5, color: colors.white, letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  name: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, width: 64 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  chipWalk: { borderWidth: 1, borderColor: colors.inkGhost },
  chipText: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.3 },
  mins: { fontFamily: fonts.semibold, fontSize: 14, color: colors.teal },
});
