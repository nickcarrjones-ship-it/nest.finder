/**
 * The thinking orb building homes (Nick, 2026-10-02: "a version of that orb
 * that can sit over the Maloca ... where it forms a shape of a house", then
 * "repeat the process ... a house, then back into an orb, then a multi-story
 * flat ... could it also form a similar shape to the isochrones", then
 * "the house and flats are 2D, can we make them 3D").
 *
 * It starts as the same spinning dotted globe as the "connecting" orb in
 * Ask. Each dot then flies to its place in a shape, the shape holds for a
 * moment, and the dots fly back to the globe before the next one:
 *
 *   house - a 3D wireframe: walls, gabled roof with its ridge, and an arched
 *           door echoing the Maloca mark, seen from a little above
 *   flats - a 3D tower block, lit windows on its front and side
 *   zone  - a REAL walking zone from the map's own data: the 10-minute walk
 *           around Clapham Common, Clapham South, Balham and Tooting Bec,
 *           with those four stations joined by their tube line and a bright
 *           dot running along it like a train. Flat, because it's a map.
 *
 * The 3D shapes turn gently at a three-quarter angle so their depth shows;
 * near dots are bigger and darker, far ones paler, as on the globe. Once a
 * shape is built a bright dot runs its edges, as the orb's packets do.
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
type V3 = [number, number, number];
type Kind = 'edge' | 'corner' | 'window' | 'fill' | 'station';

/**
 * Solid shapes are in model space (x right, y up, z towards the viewer,
 * roughly -1..1) and get turned in 3D. Flat ones are in the unit square,
 * as drawn.
 */
interface Target { x: number; y: number; z: number; kind: Kind }
interface Edge { i: number; j: number; strong: boolean }
interface Shape {
  name: ShapeName;
  solid: boolean;
  /** Dot size relative to the others. */
  dotScale: number;
  targets: Target[];
  edges: Edge[];
  /** Dot paths a bright dot runs along once the shape is built. */
  runs: { path: number[]; closed: boolean }[];
}

/** Every shape uses every dot, so each one always has somewhere to go. */
export const ORB_DOT_COUNT = 90;

/** Shares `budget` out in proportion to `lengths`, at least `min` each. */
function allocate(lengths: number[], budget: number, min: number): number[] {
  const L = lengths.reduce((s, l) => s + l, 0);
  const want = lengths.map((l) => (budget * l) / L);
  const n = want.map((w) => Math.max(min, Math.floor(w)));
  let sum = n.reduce((a, b) => a + b, 0);
  while (sum < budget) {
    let best = 0;
    for (let i = 1; i < n.length; i++) if (want[i] - n[i] > want[best] - n[best]) best = i;
    n[best]++; sum++;
  }
  while (sum > budget) {
    let best = -1;
    for (let i = 0; i < n.length; i++) {
      if (n[i] > min && (best < 0 || want[i] - n[i] < want[best] - n[best])) best = i;
    }
    n[best]--; sum--;
  }
  return n;
}

// --- solid shapes: a wireframe graph with dots spread along its edges ------

interface Graph {
  vertices: { p: V3; kind: Kind }[];
  edges: [number, number][];
  /** Dots that sit on a face rather than an edge - windows. */
  extras?: V3[];
}

function sampleGraph(g: Graph, total: number) {
  const targets: Target[] = g.vertices.map(({ p, kind }) => ({ x: p[0], y: p[1], z: p[2], kind }));
  const lens = g.edges.map(([a, b]) => {
    const [p, q] = [g.vertices[a].p, g.vertices[b].p];
    return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  });
  const extras = g.extras ?? [];
  const n = allocate(lens, total - g.vertices.length - extras.length, 0);
  const edges: Edge[] = [];
  const chains = new Map<string, number[]>();
  g.edges.forEach(([a, b], e) => {
    const [p, q] = [g.vertices[a].p, g.vertices[b].p];
    const chain = [a];
    for (let k = 1; k <= n[e]; k++) {
      const f = k / (n[e] + 1);
      targets.push({ x: p[0] + (q[0] - p[0]) * f, y: p[1] + (q[1] - p[1]) * f, z: p[2] + (q[2] - p[2]) * f, kind: 'edge' });
      chain.push(targets.length - 1);
    }
    chain.push(b);
    for (let c = 0; c < chain.length - 1; c++) edges.push({ i: chain[c], j: chain[c + 1], strong: false });
    chains.set(`${a}-${b}`, chain);
    chains.set(`${b}-${a}`, [...chain].reverse());
  });
  for (const [x, y, z] of extras) targets.push({ x, y, z, kind: 'window' });
  /** The dots along a walk round the given vertices. */
  const path = (vs: number[]) => {
    const out = [vs[0]];
    for (let k = 1; k < vs.length; k++) out.push(...(chains.get(`${vs[k - 1]}-${vs[k]}`) ?? []).slice(1));
    return out;
  };
  return { targets, edges, path };
}

// house: walls W wide x D deep from the ground G to the eaves T, ridge at P.
const HOUSE: Shape = (() => {
  const [W, D, G, T, P] = [0.6, 0.36, -0.68, 0.1, 0.66];
  const v: Graph['vertices'] = [];
  const at = (p: V3, kind: Kind = 'corner') => (v.push({ p, kind }), v.length - 1);
  const b = [at([-W, G, D]), at([W, G, D]), at([W, G, -D]), at([-W, G, -D])];
  const t = [at([-W, T, D]), at([W, T, D]), at([W, T, -D]), at([-W, T, -D])];
  const ridge = [at([0, P, D]), at([0, P, -D])];
  // The arched door on the front face.
  const [dw, dTop, dr] = [0.15, -0.36, 0.15];
  const doorL = at([-dw, G, D]);
  const doorR = at([dw, G, D]);
  const arch = [0, 1, 2, 3, 4].map((k) => {
    const ang = Math.PI - (k * Math.PI) / 4;
    return at([dr * Math.cos(ang), dTop + dr * Math.sin(ang), D], k === 0 || k === 4 ? 'corner' : 'edge');
  });
  const e: [number, number][] = [
    // Ground: the front split by the doorway.
    [b[0], doorL], [doorL, doorR], [doorR, b[1]], [b[1], b[2]], [b[2], b[3]], [b[3], b[0]],
    // Eaves.
    [t[0], t[1]], [t[1], t[2]], [t[2], t[3]], [t[3], t[0]],
    // Corners.
    [b[0], t[0]], [b[1], t[1]], [b[2], t[2]], [b[3], t[3]],
    // Gables and ridge.
    [t[0], ridge[0]], [ridge[0], t[1]], [t[3], ridge[1]], [ridge[1], t[2]], [ridge[0], ridge[1]],
    // Door.
    [doorL, arch[0]], [arch[0], arch[1]], [arch[1], arch[2]], [arch[2], arch[3]], [arch[3], arch[4]], [arch[4], doorR],
  ];
  const g = sampleGraph({ vertices: v, edges: e }, ORB_DOT_COUNT);
  return {
    name: 'house',
    solid: true,
    dotScale: 1,
    targets: g.targets,
    edges: g.edges,
    runs: [
      { path: g.path([t[0], ridge[0], ridge[1], t[2]]), closed: false },
      { path: g.path([b[0], b[1], b[2], b[3], b[0]]).slice(0, -1), closed: true },
    ],
  };
})();

// flats: a tower W wide x D deep from G to T, windows on the front and side.
// No front door: at this size it only crowded the bottom corner.
const FLATS: Shape = (() => {
  const [W, D, G, T] = [0.36, 0.28, -0.86, 0.86];
  const v: Graph['vertices'] = [];
  const at = (p: V3, kind: Kind = 'corner') => (v.push({ p, kind }), v.length - 1);
  const b = [at([-W, G, D]), at([W, G, D]), at([W, G, -D]), at([-W, G, -D])];
  const t = [at([-W, T, D]), at([W, T, D]), at([W, T, -D]), at([-W, T, -D])];
  const e: [number, number][] = [
    [b[0], b[1]], [b[1], b[2]], [b[2], b[3]], [b[3], b[0]],
    [t[0], t[1]], [t[1], t[2]], [t[2], t[3]], [t[3], t[0]],
    [b[0], t[0]], [b[1], t[1]], [b[2], t[2]], [b[3], t[3]],
  ];
  const floors = [-0.6, -0.34, -0.08, 0.18, 0.44, 0.7];
  const windows: V3[] = [];
  for (const y of floors) {
    for (const x of [-0.19, 0, 0.19]) windows.push([x, y, D]);
    for (const z of [-0.12, 0.12]) windows.push([W, y, z]);
  }
  const g = sampleGraph({ vertices: v, edges: e, extras: windows }, ORB_DOT_COUNT);
  return {
    name: 'flats',
    solid: true,
    dotScale: 1,
    targets: g.targets,
    edges: g.edges,
    runs: [{ path: g.path([t[0], t[1], t[2], t[3], t[0]]).slice(0, -1), closed: true }],
  };
})();

// --- flat shapes: polylines in the unit square ------------------------------

interface Part { pts: Pt[]; closed?: boolean; strong?: boolean; vertexKind?: Kind }

/** Spreads `total` dots along the parts by length, landing on every vertex. */
function sampleParts(parts: Part[], total: number, first = 0) {
  const segs: { a: Pt; b: Pt; len: number }[] = [];
  for (const p of parts) {
    const n = p.closed ? p.pts.length : p.pts.length - 1;
    for (let s = 0; s < n; s++) {
      const a = p.pts[s];
      const b = p.pts[(s + 1) % p.pts.length];
      segs.push({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }
  }
  // Open parts also need a dot at their far end.
  const n = allocate(segs.map((s) => s.len), total - parts.filter((p) => !p.closed).length, 1);

  const targets: Target[] = [];
  const edges: Edge[] = [];
  const paths: { path: number[]; closed: boolean }[] = [];
  let si = 0;
  for (const p of parts) {
    const start = first + targets.length;
    const segCount = p.closed ? p.pts.length : p.pts.length - 1;
    for (let s = 0; s < segCount; s++, si++) {
      const { a, b } = segs[si];
      for (let k = 0; k < n[si]; k++) {
        targets.push({
          x: a[0] + ((b[0] - a[0]) * k) / n[si],
          y: a[1] + ((b[1] - a[1]) * k) / n[si],
          z: 0,
          kind: k === 0 && p.vertexKind ? p.vertexKind : 'edge',
        });
      }
    }
    if (!p.closed) {
      const last = p.pts[p.pts.length - 1];
      targets.push({ x: last[0], y: last[1], z: 0, kind: p.vertexKind ?? 'edge' });
    }
    const end = first + targets.length;
    const path: number[] = [];
    for (let i = start; i < end; i++) path.push(i);
    for (let i = start; i < end - 1; i++) edges.push({ i, j: i + 1, strong: Boolean(p.strong) });
    if (p.closed) edges.push({ i: end - 1, j: start, strong: Boolean(p.strong) });
    paths.push({ path, closed: Boolean(p.closed) });
  }
  return { targets, edges, paths };
}

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
  // Faint dots scattered inside, standing in for the map's fill.
  const fill: Target[] = [];
  for (let y = 0.17; y < 0.86 && fill.length < 22; y += 0.06) {
    for (let x = 0.27; x < 0.75 && fill.length < 22; x += 0.06) {
      const p: Pt = [x + (hash(x * 31 + y * 17) - 0.5) * 0.025, y + (hash(x * 13 + y * 41) - 0.5) * 0.025];
      if (!inside(p, ZONE_RING)) continue;
      const nearEdge = ZONE_RING.some((a, i) => distToSegment(p, a, ZONE_RING[(i + 1) % ZONE_RING.length]) < 0.035);
      const nearLine = ZONE_STATIONS.slice(1).some((b, i) => distToSegment(p, ZONE_STATIONS[i], b) < 0.04);
      if (!nearEdge && !nearLine) fill.push({ x: p[0], y: p[1], z: 0, kind: 'fill' });
    }
  }
  // The tube line: the four stations, two small dots between each pair.
  const lineDots = ZONE_STATIONS.length + 2 * (ZONE_STATIONS.length - 1);
  const ring = sampleParts([{ pts: ZONE_RING, closed: true }], ORB_DOT_COUNT - lineDots - fill.length);
  const line = sampleParts(
    [{ pts: ZONE_STATIONS, strong: true, vertexKind: 'station' }],
    lineDots,
    ring.targets.length,
  );
  return {
    name: 'zone',
    solid: false,
    // Its outline is the densest of the three, so smaller dots keep it
    // from looking heavier than the others.
    dotScale: 0.8,
    targets: [...ring.targets, ...line.targets, ...fill],
    edges: [...ring.edges, ...line.edges],
    runs: [{ path: line.paths[0].path, closed: false }],
  };
})();

const SHAPES: Shape[] = [HOUSE, FLATS, ZONE];
export const HOUSE_EDGE_COUNT = HOUSE.edges.length;

/** Even directions over a sphere (Fibonacci lattice), one per dot. */
const SPHERE: V3[] = Array.from({ length: ORB_DOT_COUNT }, (_, i) => {
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

/** Spin about the vertical, then tip towards the viewer. Returns screen-ish x, y and depth. */
function turn(x: number, y: number, z: number, yaw: number, tilt: number): V3 {
  const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
  const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  const y1 = y * Math.cos(tilt) - z1 * Math.sin(tilt);
  const z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
  return [x1, y1, z2];
}

const PHASE = { globe: 0.8, build: 1.6, hold: 2.6, unbuild: 1.1 };
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
  corner: { r: 1.25, white: 0.12, a: 1 },
  window: { r: 1.1, white: 0.16, a: 1 },
  fill: { r: 0.75, white: 0.55, a: 0.85 },
  station: { r: 1.7, white: 0, a: 1 },
};

/**
 * One frame, in points, for a square of `size`. `still` drops all motion
 * (Reduce Motion): no turning, no drift, no running dot.
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
  const R = 0.34 * size;

  // Solid shapes sit at a three-quarter angle, seen from a little above,
  // and turn gently to and fro so their depth keeps showing.
  const solidYaw = -0.62 + (still ? 0 : Math.sin(t * 0.5) * 0.3);
  const solidTilt = 0.34;
  const solidScale = 0.45 * size;

  // A finished shape gently breathes; a flat one turns a touch.
  const settled = clamp01((built - 0.9) / 0.1);
  const flatSway = still ? 0 : Math.sin(t * 0.8) * 0.22 * settled;
  const drift = still ? 0 : settled * 0.004 * size;

  const dots: HouseDot[] = [];
  const progress: number[] = [];
  const pos: { x: number; y: number; z: number }[] = [];
  const nearness: number[] = [];

  shape.targets.forEach((tg, i) => {
    const [sx, sy, sz] = turn(...SPHERE[i], yaw, 0.4);
    const globe = { x: 0.5 * size + sx * R, y: 0.52 * size - sy * R, z: sz };

    let home: { x: number; y: number; z: number };
    if (shape.solid) {
      const [hx, hy, hz] = turn(tg.x, tg.y, tg.z, solidYaw, solidTilt);
      home = { x: 0.5 * size + hx * solidScale, y: 0.5 * size - hy * solidScale, z: hz };
    } else {
      const off = tg.x - 0.5;
      home = { x: (0.5 + off * Math.cos(flatSway)) * size, y: tg.y * size, z: off * Math.sin(flatSway) * 2 };
    }
    home.x += Math.sin(t * 1.7 + i * 1.3) * drift;
    home.y += Math.cos(t * 1.3 + i * 0.7) * drift;

    const p = ease(clamp01((built - hash(i) * STAGGER) / (1 - STAGGER)));
    progress.push(p);
    const z = lerp(globe.z, home.z, p);
    pos.push({ x: lerp(globe.x, home.x, p), y: lerp(globe.y, home.y, p), z });

    const near = clamp01((z + 1) / 2); // 0 far .. 1 near
    nearness.push(near);
    const look = LOOK[tg.kind];
    // In a solid, depth reads through size and shade, as on the globe.
    const depthR = shape.solid ? 0.75 + 0.45 * near : 1;
    const depthWhite = shape.solid ? (1 - near) * 0.3 : -0.08 * Math.max(-1, Math.min(1, home.z));
    dots.push({
      ...pos[i],
      r: lerp(rDot * (0.7 + 0.5 * near), rDot * look.r * depthR * shape.dotScale, p),
      white: lerp(0.62 - 0.5 * near, look.white + depthWhite, p),
      a: lerp(0.55 + 0.45 * near, look.a * (shape.solid ? 0.6 + 0.4 * near : 1), p),
    });
  });

  const lines: HouseLine[] = [];

  // The globe's web fades as the dots leave it.
  for (const [i, j] of WEB) {
    const a = 0.16 * (1 - Math.max(progress[i], progress[j])) * (0.5 + 0.5 * nearness[i]);
    if (a < 0.02) continue;
    lines.push({ x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y, white: 0.3, a, w: lineW });
  }

  // The outline draws itself in as both ends of each edge arrive - paler at
  // the back of a solid. The tube line in the zone is drawn stronger, as a
  // line on a map would be.
  for (const { i, j, strong } of shape.edges) {
    const depth = shape.solid ? 0.35 + 0.65 * (nearness[i] + nearness[j]) / 2 : 1;
    const a = (strong ? 0.85 : 0.6) * depth * Math.min(progress[i], progress[j]) ** 3;
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
