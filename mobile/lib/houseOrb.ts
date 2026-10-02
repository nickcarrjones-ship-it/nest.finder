/**
 * The thinking orb building homes (Nick, 2026-10-02: "a version of that orb
 * that can sit over the Maloca ... where it forms a shape of a house", then
 * "repeat the process ... a house, then back into an orb, then a multi-story
 * flat ... could it also form a similar shape to the isochrones").
 *
 * It starts as the same spinning dotted globe as the "connecting" orb in
 * Ask. Each dot then flies to its place in a shape, the shape holds for a
 * moment, and the dots fly back to the globe before the next one:
 *
 *   house - pitched roof, walls, and an arched door echoing the Maloca mark
 *   flats - a tower block with a grid of lit windows
 *   zone  - a REAL walking zone from the map's own data: the 10-minute walk
 *           around Clapham Common, Clapham South, Balham and Tooting Bec,
 *           with those four stations joined by their tube line and a bright
 *           dot running along it like a train. It says what the app does.
 *
 * Once a shape is built it turns gently side to side and a bright dot runs
 * its edges, as the orb's packets do.
 *
 * PURE: every frame is worked out from the time alone, as the thinking-orbs
 * engine does, and comes out in the same shape (dots + lines with position,
 * radius and shade) so components/ThinkingOrb.tsx's renderer can draw it.
 */

export interface HouseDot {
  x: number;
  y: number;
  /** Depth: nearer dots are bigger and darker. */
  z: number;
  r: number;
  /** Shade: 0 is full ink, 1 fades to the background. */
  white: number;
  a?: number;
}

export interface HouseLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  white: number;
  a?: number;
  w: number;
}

export interface HouseFrame {
  dots: HouseDot[];
  lines: HouseLine[];
}

/**
 * once - builds the house and keeps it (and is what Reduce Motion shows).
 * loop - house, flats, zone, each built from the globe and returned to it.
 */
export type HouseTimeline = 'once' | 'loop';

export type ShapeName = 'house' | 'flats' | 'zone';

type Pt = [number, number];
type Kind = 'edge' | 'corner' | 'window' | 'fill' | 'station';

interface Target { x: number; y: number; kind: Kind }
interface Edge { i: number; j: number; strong: boolean }
interface Shape {
  name: ShapeName;
  targets: Target[];
  edges: Edge[];
  /** Index paths a bright dot runs along once the shape is built. */
  runs: { path: number[]; closed: boolean }[];
}

/** Every shape uses every dot, so each one always has somewhere to go. */
export const ORB_DOT_COUNT = 60;

interface Part { pts: Pt[]; closed?: boolean; corners?: boolean; strong?: boolean }

/**
 * Spreads `total` dots along the parts in proportion to their length,
 * landing on every corner, and joins neighbours with lines.
 */
function sampleParts(parts: Part[], total: number, first = 0) {
  const segs: { part: number; a: Pt; b: Pt; len: number }[] = [];
  parts.forEach((p, pi) => {
    const n = p.closed ? p.pts.length : p.pts.length - 1;
    for (let s = 0; s < n; s++) {
      const a = p.pts[s];
      const b = p.pts[(s + 1) % p.pts.length];
      segs.push({ part: pi, a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }
  });
  // Open parts also need a dot at their far end.
  const budget = total - parts.filter((p) => !p.closed).length;
  const L = segs.reduce((s, g) => s + g.len, 0);
  const want = segs.map((g) => (budget * g.len) / L);
  const n = want.map((w) => Math.max(1, Math.floor(w)));
  let sum = n.reduce((a, b) => a + b, 0);
  while (sum < budget) {
    let best = 0;
    for (let i = 1; i < n.length; i++) if (want[i] - n[i] > want[best] - n[best]) best = i;
    n[best]++; sum++;
  }
  while (sum > budget) {
    let best = -1;
    for (let i = 0; i < n.length; i++) {
      if (n[i] > 1 && (best < 0 || want[i] - n[i] < want[best] - n[best])) best = i;
    }
    n[best]--; sum--;
  }

  const targets: Target[] = [];
  const edges: Edge[] = [];
  const paths: { path: number[]; closed: boolean }[] = [];
  let si = 0;
  parts.forEach((p) => {
    const start = first + targets.length;
    const segCount = p.closed ? p.pts.length : p.pts.length - 1;
    for (let s = 0; s < segCount; s++, si++) {
      const { a, b } = segs[si];
      for (let k = 0; k < n[si]; k++) {
        targets.push({
          x: a[0] + ((b[0] - a[0]) * k) / n[si],
          y: a[1] + ((b[1] - a[1]) * k) / n[si],
          kind: k === 0 && p.corners ? 'corner' : 'edge',
        });
      }
    }
    if (!p.closed) {
      const last = p.pts[p.pts.length - 1];
      targets.push({ x: last[0], y: last[1], kind: p.corners ? 'corner' : 'edge' });
    }
    const end = first + targets.length;
    const path: number[] = [];
    for (let i = start; i < end; i++) path.push(i);
    for (let i = start; i < end - 1; i++) edges.push({ i, j: i + 1, strong: Boolean(p.strong) });
    if (p.closed) edges.push({ i: end - 1, j: start, strong: Boolean(p.strong) });
    paths.push({ path, closed: Boolean(p.closed) });
  });
  return { targets, edges, paths };
}

// --- house ------------------------------------------------------------------
// The roof is a chevron sitting just clear of the walls, as in a line-drawn
// house icon, so the dots never crowd where the two would meet.
const HOUSE: Shape = (() => {
  const door: Pt[] = [[0.43, 0.86]];
  for (let k = 0; k <= 4; k++) {
    const ang = Math.PI - (k * Math.PI) / 4;
    door.push([0.5 + 0.07 * Math.cos(ang), 0.72 - 0.07 * Math.sin(ang)]);
  }
  door.push([0.57, 0.86]);
  const { targets, edges, paths } = sampleParts(
    [
      { pts: [[0.12, 0.54], [0.5, 0.16], [0.88, 0.54]], corners: true },
      { pts: [[0.22, 0.5], [0.22, 0.86], [0.78, 0.86], [0.78, 0.5]], corners: true },
      { pts: door, corners: true },
    ],
    ORB_DOT_COUNT,
  );
  return { name: 'house', targets, edges, runs: paths.slice(0, 2) };
})();

// --- flats ------------------------------------------------------------------
const FLATS: Shape = (() => {
  const windows: Target[] = [];
  for (const y of [0.22, 0.31, 0.4, 0.49, 0.58, 0.67]) {
    for (const x of [0.4, 0.5, 0.6]) windows.push({ x, y, kind: 'window' });
  }
  const { targets, edges, paths } = sampleParts(
    [
      { pts: [[0.31, 0.13], [0.69, 0.13], [0.69, 0.87], [0.31, 0.87]], closed: true, corners: true },
      { pts: [[0.45, 0.87], [0.45, 0.78], [0.55, 0.78], [0.55, 0.87]], corners: true },
    ],
    ORB_DOT_COUNT - windows.length,
  );
  return { name: 'flats', targets: [...targets, ...windows], edges, runs: paths.slice(0, 1) };
})();

// --- zone -------------------------------------------------------------------
// Traced from data/isochrones/budget-10.json: the union of the four
// stations' 10-minute walks, simplified to 23 corners and fitted to the
// square, north up. Station positions are from assets/data/stations.json.
const ZONE_RING: Pt[] = [
  [0.483, 0.766], [0.491, 0.822], [0.288, 0.86], [0.256, 0.729], [0.292, 0.623],
  [0.337, 0.627], [0.326, 0.588], [0.394, 0.487], [0.383, 0.445], [0.417, 0.327],
  [0.487, 0.321], [0.477, 0.264], [0.524, 0.174], [0.609, 0.14], [0.74, 0.185],
  [0.744, 0.301], [0.702, 0.366], [0.603, 0.363], [0.633, 0.482], [0.543, 0.532],
  [0.607, 0.628], [0.527, 0.727], [0.485, 0.716],
];
/** Clapham Common, Clapham South, Balham, Tooting Bec. */
const ZONE_STATIONS: Pt[] = [[0.619, 0.261], [0.511, 0.431], [0.451, 0.606], [0.37, 0.747]];

function inside([x, y]: Pt, ring: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function distToSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax;
  const dy = by - ay;
  const f = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + f * dx), py - (ay + f * dy));
}

const ZONE: Shape = (() => {
  // A few faint dots scattered inside, standing in for the map's fill.
  const fill: Target[] = [];
  for (let y = 0.2; y < 0.85 && fill.length < 12; y += 0.07) {
    for (let x = 0.27; x < 0.75 && fill.length < 12; x += 0.07) {
      const p: Pt = [x + (hash(x * 31 + y * 17) - 0.5) * 0.03, y + (hash(x * 13 + y * 41) - 0.5) * 0.03];
      if (!inside(p, ZONE_RING)) continue;
      const nearEdge = ZONE_RING.some((a, i) => distToSegment(p, a, ZONE_RING[(i + 1) % ZONE_RING.length]) < 0.04);
      const nearLine = ZONE_STATIONS.slice(1).some((b, i) => distToSegment(p, ZONE_STATIONS[i], b) < 0.045);
      if (!nearEdge && !nearLine) fill.push({ x: p[0], y: p[1], kind: 'fill' });
    }
  }
  const ring = sampleParts([{ pts: ZONE_RING, closed: true }], ORB_DOT_COUNT - ZONE_STATIONS.length - fill.length);
  const first = ring.targets.length;
  const stations: Target[] = ZONE_STATIONS.map(([x, y]) => ({ x, y, kind: 'station' }));
  const line: Edge[] = ZONE_STATIONS.slice(1).map((_, i) => ({ i: first + i, j: first + i + 1, strong: true }));
  const linePath = ZONE_STATIONS.map((_, i) => first + i);
  return {
    name: 'zone',
    targets: [...ring.targets, ...stations, ...fill],
    edges: [...ring.edges, ...line],
    runs: [{ path: linePath, closed: false }],
  };
})();

const SHAPES: Shape[] = [HOUSE, FLATS, ZONE];
export const HOUSE_EDGE_COUNT = HOUSE.edges.length;

/** Even directions over a sphere (Fibonacci lattice), one per dot. */
const SPHERE: [number, number, number][] = Array.from({ length: ORB_DOT_COUNT }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / ORB_DOT_COUNT;
  const rad = Math.sqrt(1 - y * y);
  const th = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(th) * rad, y, Math.sin(th) * rad];
});

/** Each dot's nearest neighbour on the globe - the globe's web of lines. */
const WEB: [number, number][] = SPHERE.map((p, i) => {
  let best = -1;
  let bestD = Infinity;
  SPHERE.forEach((q, j) => {
    if (j === i) return;
    const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    if (d < bestD) { bestD = d; best = j; }
  });
  return [i, best];
});

/** Deterministic 0-1, so each dot sets off at its own moment. */
function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

const PHASE = { globe: 0.8, build: 1.6, hold: 2.4, unbuild: 1.1 };
const SHAPE_SECONDS = PHASE.globe + PHASE.build + PHASE.hold + PHASE.unbuild;
/** One full round: house, flats, zone. */
export const HOUSE_LOOP_SECONDS = SHAPE_SECONDS * SHAPES.length;

/** Which shape is being built or shown at time t. */
export function shapeAt(t: number, timeline: HouseTimeline): ShapeName {
  if (timeline === 'once') return 'house';
  const u = ((t % HOUSE_LOOP_SECONDS) + HOUSE_LOOP_SECONDS) % HOUSE_LOOP_SECONDS;
  return SHAPES[Math.floor(u / SHAPE_SECONDS)].name;
}

/** How built the current shape is at time t: 0 is the globe, 1 the finished shape. */
export function builtAt(t: number, timeline: HouseTimeline): number {
  if (timeline === 'once') return clamp01((t - 0.5) / PHASE.build);
  const u = ((t % SHAPE_SECONDS) + SHAPE_SECONDS) % SHAPE_SECONDS;
  if (u < PHASE.globe) return 0;
  if (u < PHASE.globe + PHASE.build) return (u - PHASE.globe) / PHASE.build;
  if (u < PHASE.globe + PHASE.build + PHASE.hold) return 1;
  return 1 - (u - PHASE.globe - PHASE.build - PHASE.hold) / PHASE.unbuild;
}

const STAGGER = 0.4;

const LOOK: Record<Kind, { r: number; white: number; a: number }> = {
  edge: { r: 1, white: 0.14, a: 1 },
  corner: { r: 1.25, white: 0.14, a: 1 },
  window: { r: 1.15, white: 0.12, a: 1 },
  fill: { r: 0.75, white: 0.55, a: 0.85 },
  station: { r: 1.7, white: 0, a: 1 },
};

/**
 * One frame, in points, for a square of `size`. `still` drops all motion
 * (Reduce Motion): no sway, no drift, no running dot.
 */
export function houseFrame(
  size: number,
  t: number,
  timeline: HouseTimeline = 'once',
  still = false,
): HouseFrame {
  const shape = SHAPES.find((s) => s.name === shapeAt(t, timeline)) ?? HOUSE;
  const built = builtAt(t, timeline);
  const k = size / 128;
  const rDot = 1.9 * k;
  const lineW = Math.max(0.6, 0.85 * k);

  // The globe: spinning, tilted towards the viewer.
  const yaw = t * 0.55;
  const tilt = 0.4;
  const R = 0.34 * size;
  const gx = 0.5 * size;
  const gy = 0.52 * size;

  // A finished shape turns a little side to side and gently breathes.
  const settled = clamp01((built - 0.9) / 0.1);
  const sway = still ? 0 : Math.sin(t * 0.8) * 0.22 * settled;

  const dots: HouseDot[] = [];
  const progress: number[] = [];
  const pos: { x: number; y: number; z: number }[] = [];

  shape.targets.forEach((tg, i) => {
    const [sx, sy, sz] = SPHERE[i];
    const x1 = sx * Math.cos(yaw) + sz * Math.sin(yaw);
    const z1 = -sx * Math.sin(yaw) + sz * Math.cos(yaw);
    const y1 = sy * Math.cos(tilt) - z1 * Math.sin(tilt);
    const z2 = sy * Math.sin(tilt) + z1 * Math.cos(tilt);
    const globe = { x: gx + x1 * R, y: gy - y1 * R, z: z2 };

    const hxOff = tg.x - 0.5;
    const drift = still ? 0 : settled * 0.004 * size;
    const home = {
      x: (0.5 + hxOff * Math.cos(sway)) * size + Math.sin(t * 1.7 + i * 1.3) * drift,
      y: tg.y * size + Math.cos(t * 1.3 + i * 0.7) * drift,
      z: hxOff * Math.sin(sway) * 2,
    };

    const p = ease(clamp01((built - hash(i) * STAGGER) / (1 - STAGGER)));
    progress.push(p);
    const x = lerp(globe.x, home.x, p);
    const y = lerp(globe.y, home.y, p);
    const z = lerp(globe.z, home.z, p);
    pos.push({ x, y, z });

    const near = (z + 1) / 2; // 0 far .. 1 near
    const look = LOOK[tg.kind];
    dots.push({
      x,
      y,
      z,
      r: lerp(rDot * (0.7 + 0.5 * near), rDot * look.r, p),
      white: lerp(0.62 - 0.5 * near, look.white - 0.08 * Math.max(-1, Math.min(1, home.z)), p),
      a: lerp(0.55 + 0.45 * near, look.a, p),
    });
  });

  const lines: HouseLine[] = [];

  // The globe's web fades as the dots leave it.
  for (const [i, j] of WEB) {
    const a = 0.16 * (1 - Math.max(progress[i], progress[j])) * (0.5 + 0.5 * (pos[i].z + 1) / 2);
    if (a < 0.02) continue;
    lines.push({ x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y, white: 0.3, a, w: lineW });
  }

  // The outline draws itself in as both ends of each edge arrive. The tube
  // line in the zone is drawn stronger, as a line on a map would be.
  for (const { i, j, strong } of shape.edges) {
    const a = (strong ? 0.85 : 0.55) * Math.min(progress[i], progress[j]) ** 3;
    if (a < 0.02) continue;
    lines.push({
      x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y,
      white: strong ? 0 : 0.1, a, w: strong ? lineW * 1.8 : lineW,
    });
  }

  // A bright dot with a short tail runs each edge path - back and forth
  // along an open one, round and round a closed one.
  if (!still && settled > 0) {
    shape.runs.forEach(({ path, closed }, ri) => {
      const ring = closed ? [...path, path[0]] : path;
      for (let tail = 0; tail < 3; tail++) {
        let u = (((t * 0.3 + ri * 0.5 - tail * 0.025) % 1) + 1) % 1;
        if (!closed) u = 1 - Math.abs(2 * u - 1);
        const f = u * (ring.length - 1);
        const a0 = ring[Math.floor(f)];
        const b0 = ring[Math.min(ring.length - 1, Math.floor(f) + 1)];
        const fr = f - Math.floor(f);
        dots.push({
          x: lerp(pos[a0].x, pos[b0].x, fr),
          y: lerp(pos[a0].y, pos[b0].y, fr),
          z: 2,
          r: rDot * (1.5 - tail * 0.3),
          white: 0,
          a: settled * (0.9 - tail * 0.3),
        });
      }
    });
  }

  dots.sort((a, b) => a.z - b.z);
  return { dots: dots.filter((d) => (d.a ?? 1) >= 0.02), lines };
}
