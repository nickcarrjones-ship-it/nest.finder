import { lineColour, placeName, type PersonRoute } from './routes';

/**
 * The route map in the Ask (Nick, 2026-10-02, option A of two mock-ups):
 * the real track shapes from TfL in TfL's colours, the Thames in the
 * welcome orb's dotted teal, the stretch everyone shares drawn first, then
 * each person's way on, then a dot running each route like a train with
 * their name at their office.
 *
 * PURE: layoutRouteMap() fits everything to the card once; routeMapFrame()
 * says what to draw at a moment in time. components/RouteCard.tsx draws it.
 */

type XY = [number, number];

export interface MapSegment { x1: number; y1: number; x2: number; y2: number; color: string; w: number; a: number }
export interface MapDot { x: number; y: number; r: number; color: string; a: number }
export interface MapRing { x: number; y: number; r: number; a: number }
export interface MapLabel { x: number; y: number; text: string; align: 'left' | 'right' | 'center'; a: number; size: number }
export interface MapPill { x: number; y: number; w: number; h: number; text: string; a: number }

export interface RouteMapFrame {
  segments: MapSegment[];
  dots: MapDot[];
  rings: MapRing[];
  labels: MapLabel[];
  pills: MapPill[];
}

interface DrawnLeg { pts: XY[]; color: string; walk: boolean; start: number; end: number }
interface Box { x: number; y: number; w: number; h: number }
interface PlacedLabel { at: XY; text: string; box: Box; align: MapLabel['align']; appear: number }

export interface RouteMapLayout {
  width: number;
  height: number;
  river: XY[];
  legs: DrawnLeg[];
  trains: XY[][];
  stations: { at: XY; appear: number }[];
  labels: PlacedLabel[];
  pills: { box: Box; text: string }[];
}

export const TEAL = '#2E7D7A';
const LABEL_SIZE = 10;
const PILL_SIZE = 9.5;
const RING = 4.2;

// When things happen, in seconds.
export const ROUTE_TIMES = {
  river: 0.6,
  sharedFrom: 0.6,
  sharedTo: 2.0,
  onwardTo: 3.4,
  trains: 3.4,
  /** Trains stop after this - a card in the history should not run forever. */
  settle: 14,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const dist = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const pathLength = (pts: XY[]) => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);

/** Every nth point, keeping both ends. */
function thin(pts: XY[], max: number): XY[] {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
}

/** The first fraction f of a polyline, by length. */
export function partial(pts: XY[], f: number): XY[] {
  if (f <= 0 || pts.length < 2) return pts.slice(0, 1);
  if (f >= 1) return pts;
  const want = pathLength(pts) * f;
  const out: XY[] = [pts[0]];
  let run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const s = dist(pts[i], pts[i + 1]);
    if (run + s >= want) {
      const t = s ? (want - run) / s : 0;
      out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
      return out;
    }
    out.push(pts[i + 1]);
    run += s;
  }
  return out;
}

const textWidth = (text: string, size: number, mono = false) => text.length * size * (mono ? 0.62 : 0.55);
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Box, w: number, h: number) => a.x >= 2 && a.y >= 2 && a.x + a.w <= w - 2 && a.y + a.h <= h - 2;

/**
 * Fit the routes and the Thames to a card `width` x `height`, and place
 * every label and name where it collides with nothing else.
 */
export function layoutRouteMap(
  area: string,
  people: PersonRoute[],
  thames: [number, number][], // [lng, lat]
  width: number,
  height: number,
): RouteMapLayout {
  // Everything any route touches decides the frame; the Thames is cut to it.
  const all = people.flatMap((p) => p.route.legs.flatMap((l) => l.path));
  const c = Math.cos((51.5 * Math.PI) / 180);
  const xs = all.map(([, lng]) => lng * c);
  const ys = all.map(([lat]) => lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 26;
  const k = Math.min((width - pad * 2) / Math.max(1e-6, maxX - minX), (height - pad * 2) / Math.max(1e-6, maxY - minY));
  const [cx, cy] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const P = (lat: number, lng: number): XY => [width / 2 + (lng * c - cx) * k, height / 2 - (lat - cy) * k];

  const river = thin(
    thames.map(([lng, lat]) => P(lat, lng)).filter(([x, y]) => x >= -20 && x <= width + 20 && y >= -20 && y <= height + 20),
    70,
  );

  // Legs, timed: each person's first leg together, then the rest of theirs
  // one after another in proportion to length.
  const legs: DrawnLeg[] = [];
  const trains: XY[][] = [];
  for (const p of people) {
    const projected = p.route.legs.map((l) => thin(l.path.map(([lat, lng]) => P(lat, lng)), 24));
    trains.push(projected.flat());
    const onwardLen = projected.slice(1).reduce((s, pts) => s + pathLength(pts), 0) || 1;
    let run = 0;
    p.route.legs.forEach((l, i) => {
      const pts = projected[i];
      if (pts.length < 2) return;
      let start: number;
      let end: number;
      if (i === 0) {
        [start, end] = [ROUTE_TIMES.sharedFrom, ROUTE_TIMES.sharedTo];
      } else {
        const span = ROUTE_TIMES.onwardTo - ROUTE_TIMES.sharedTo;
        start = ROUTE_TIMES.sharedTo + (span * run) / onwardLen;
        run += pathLength(pts);
        end = ROUTE_TIMES.sharedTo + (span * run) / onwardLen;
      }
      legs.push({ pts, color: lineColour(l), walk: l.mode === 'walking', start, end });
    });
  }

  // Stations: where they start, wherever they change, where each one ends.
  const stations: { at: XY; name: string; appear: number; people: string[] }[] = [];
  const addStation = (at: XY, name: string, appear: number, person?: string) => {
    const near = stations.find((s) => dist(s.at, at) < 7);
    if (near) {
      // Two people at one office share a ring, and a name tag.
      if (person) {
        near.people.push(person);
        near.name = name;
        near.appear = Math.max(near.appear, appear);
      }
      return;
    }
    stations.push({ at, name, appear, people: person ? [person] : [] });
  };
  people.forEach((p) => {
    const first = p.route.legs[0];
    if (first?.path.length) addStation(P(first.path[0][0], first.path[0][1]), area, 0.4);
  });
  people.forEach((p) => {
    p.route.legs.forEach((l, i) => {
      // Where they change: the end of a ride with another ride still to
      // come. Not the end of the last ride before a final walk - the office
      // gets the ring, or "Canary Wharf" would be labelled twice.
      const anotherRide = p.route.legs.slice(i + 1).some((n) => n.mode !== 'walking');
      if (l.mode === 'walking' || !anotherRide || !l.path.length) return;
      const end = l.path[l.path.length - 1];
      addStation(P(end[0], end[1]), placeName(l.to), 1.8);
    });
  });
  people.forEach((p) => {
    const last = p.route.legs[p.route.legs.length - 1];
    const end = last?.path[last.path.length - 1];
    if (end) addStation(P(end[0], end[1]), p.office, 3.1, p.name);
  });

  // Labels, then names, each where it collides with nothing placed so far.
  const taken: Box[] = stations.map((s) => ({ x: s.at[0] - RING - 1, y: s.at[1] - RING - 1, w: RING * 2 + 2, h: RING * 2 + 2 }));
  // The routes themselves, as small boxes every few points along them, so a
  // name never sits across a line (it did: "Waterloo" over the Jubilee).
  const lineBits: Box[] = legs.flatMap((l) => {
    const out: Box[] = [];
    const L = pathLength(l.pts);
    for (let d = 0; d <= L; d += 5) {
      const q = partial(l.pts, d / (L || 1));
      const [x, y] = q[q.length - 1];
      out.push({ x: x - 2, y: y - 2, w: 4, h: 4 });
    }
    return out;
  });
  const labels: PlacedLabel[] = [];
  const place = (at: XY, w: number, h: number, gap: number): { box: Box; align: MapLabel['align'] } => {
    const options: { box: Box; align: MapLabel['align'] }[] = [
      { box: { x: at[0] + gap, y: at[1] - h / 2, w, h }, align: 'left' },
      { box: { x: at[0] - gap - w, y: at[1] - h / 2, w, h }, align: 'right' },
      { box: { x: at[0] - w / 2, y: at[1] - gap - h, w, h }, align: 'center' },
      { box: { x: at[0] - w / 2, y: at[1] + gap, w, h }, align: 'center' },
    ];
    const score = (o: { box: Box }) =>
      (inside(o.box, width, height) ? 0 : 100)
      + taken.filter((t) => overlaps(o.box, t)).length * 10
      + lineBits.filter((t) => overlaps(o.box, t)).length;
    return options.reduce((best, o) => (score(o) < score(best) ? o : best));
  };
  for (const s of stations) {
    const spot = place(s.at, textWidth(s.name, LABEL_SIZE), LABEL_SIZE * 1.3, RING + 4);
    taken.push(spot.box);
    labels.push({ at: s.at, text: s.name, box: spot.box, align: spot.align, appear: s.appear });
  }
  const pills: { box: Box; text: string }[] = [];
  for (const s of stations.filter((st) => st.people.length)) {
    const text = s.people.join(' & ').toUpperCase();
    const w = textWidth(text, PILL_SIZE) + 12;
    const spot = place(s.at, w, 15, RING + 4);
    taken.push(spot.box);
    pills.push({ box: spot.box, text });
  }

  return {
    width,
    height,
    river,
    legs,
    trains,
    stations: stations.map(({ at, appear }) => ({ at, appear })),
    labels,
    pills,
  };
}

/** What to draw at `t` seconds. `still` is the finished map, for Reduce Motion. */
export function routeMapFrame(layout: RouteMapLayout, t: number, still = false): RouteMapFrame {
  const now = still ? ROUTE_TIMES.settle + 1 : t;
  const segments: MapSegment[] = [];
  const dots: MapDot[] = [];

  // The Thames, faint, in the welcome orb's dotted teal.
  const ra = clamp01(now / ROUTE_TIMES.river);
  layout.river.forEach((p, i) => {
    const q = layout.river[i + 1];
    if (q) segments.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1], color: TEAL, w: 1.1, a: 0.28 * ra });
    if (i % 3 === 0) dots.push({ x: p[0], y: p[1], r: 1.3, color: TEAL, a: 0.45 * ra });
  });

  // The routes drawing themselves in.
  for (const leg of layout.legs) {
    const f = ease(clamp01((now - leg.start) / Math.max(0.01, leg.end - leg.start)));
    const pts = partial(leg.pts, f);
    if (pts.length < 2) continue;
    if (leg.walk) {
      // A walk is dotted, as on a TfL map.
      const L = pathLength(pts);
      for (let d = 0; d <= L; d += 4) {
        const q = partial(pts, d / (L || 1));
        const at = q[q.length - 1];
        dots.push({ x: at[0], y: at[1], r: 1.1, color: leg.color, a: 1 });
      }
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        segments.push({ x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1], color: leg.color, w: 3.4, a: 1 });
      }
    }
  }

  // Trains: a dot with a short tail running each whole route, then resting.
  const running = !still && now >= ROUTE_TIMES.trains && now < ROUTE_TIMES.settle;
  if (running) {
    const fade = clamp01((now - ROUTE_TIMES.trains) / 0.3) * clamp01((ROUTE_TIMES.settle - now) / 0.5);
    layout.trains.forEach((pts, i) => {
      const u = ((now - ROUTE_TIMES.trains) * 0.28 + i * 0.35) % 1;
      for (let tail = 0; tail < 4; tail++) {
        const q = partial(pts, Math.max(0, u - tail * 0.018));
        const at = q[q.length - 1];
        dots.push({ x: at[0], y: at[1], r: 3.6 - tail * 0.6, color: TEAL, a: fade * (1 - tail * 0.25) });
      }
    });
  }

  const rings: MapRing[] = layout.stations
    .map((s) => ({ x: s.at[0], y: s.at[1], r: RING, a: clamp01((now - s.appear) / 0.3) }))
    .filter((r) => r.a > 0);

  const labels: MapLabel[] = layout.labels
    .map((l) => ({
      x: l.align === 'left' ? l.box.x : l.align === 'right' ? l.box.x + l.box.w : l.box.x + l.box.w / 2,
      y: l.box.y,
      text: l.text,
      align: l.align,
      a: clamp01((now - l.appear) / 0.3),
      size: LABEL_SIZE,
    }))
    .filter((l) => l.a > 0);

  const pa = clamp01((now - ROUTE_TIMES.trains) / 0.3);
  const pills: MapPill[] = pa > 0
    ? layout.pills.map((p) => ({ x: p.box.x, y: p.box.y, w: p.box.w, h: p.box.h, text: p.text, a: pa }))
    : [];

  return { segments, dots, rings, labels, pills };
}
