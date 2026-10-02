/**
 * The thinking orb building homes (Nick, 2026-10-02: "a version of that orb
 * that can sit over the Maloca ... where it forms a shape of a house", then
 * "repeat the process ... a house, then back into an orb, then a multi-story
 * flat ... could it also form a similar shape to the isochrones", then 3D,
 * then "the house needs windows ... balconies ... a larger region like
 * Ealing across to Peckham with a trace of the Thames").
 *
 * It starts as the same spinning dotted globe as the "connecting" orb in
 * Ask. Each dot then flies to its place in a shape, the shape holds for a
 * moment, and the dots fly back to the globe before the next one:
 *
 *   house - 3D: walls, gabled roof and ridge, an arched door echoing the
 *           Maloca mark, square windows on the front and side
 *   flats - a 3D block with a balcony jutting out on every floor and
 *           windows down the side
 *   zone  - a REAL commute zone from the map's own data: everywhere within
 *           34 minutes door to desk of Sloane Square, which stretches from
 *           Ealing to Peckham, with the Thames winding through it and a
 *           bright dot sailing along the river. Flat, as a map is.
 *
 * The 3D shapes are seen from a little above at a three-quarter angle and
 * turn gently. Their far side is hidden, as on a solid object, and edges
 * fade out as they turn away rather than vanishing. Once a shape is built a
 * bright dot runs along it, as the orb's packets run its edges.
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
type Kind = 'edge' | 'corner' | 'detail' | 'river' | 'fill' | 'ghost';

/**
 * Solid shapes are in model space (x right, y up, z towards the viewer,
 * roughly -1..1) and get turned in 3D. Flat ones are in the unit square,
 * as drawn. `faces` says which faces of a solid a dot lies on, so it can
 * be hidden when they all face away.
 */
interface Target { x: number; y: number; z: number; kind: Kind; faces: number[] }
interface Edge { i: number; j: number; strong: boolean; faces: number[] }
interface Shape {
  name: ShapeName;
  /** Outward normals of a solid's faces; empty for a flat shape. */
  normals: V3[];
  targets: Target[];
  edges: Edge[];
  /** Dot paths a bright dot runs along once the shape is built. */
  runs: { path: number[]; closed: boolean }[];
}

/** Every dot goes somewhere in every shape - spare ones fade out. */
export const ORB_DOT_COUNT = 110;

/** Shares `budget` out in proportion to `lengths`, at least `min` each. */
function allocate(lengths: number[], budget: number, min: number): number[] {
  const L = lengths.reduce((s, l) => s + l, 0);
  const want = lengths.map((l) => (L > 0 ? (budget * l) / L : 0));
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
    if (best < 0) break;
    n[best]--; sum--;
  }
  return n;
}

/** Spare dots sit on top of real ones and fade, so every shape uses them all. */
function pad(targets: Target[]): Target[] {
  const out = [...targets];
  for (let k = 0; out.length < ORB_DOT_COUNT; k++) {
    const t = targets[(k * 7) % targets.length];
    out.push({ ...t, kind: 'ghost' });
  }
  return out;
}

// --- solid shapes: a wireframe graph with dots spread along its edges ------

interface GraphEdge { a: number; b: number; faces: number[]; /** Corners only, no dots between. */ bare?: boolean }

function sampleGraph(vertices: { p: V3; kind: Kind }[], gEdges: GraphEdge[], total: number) {
  // A vertex lies on every face its edges do.
  const vFaces = vertices.map(() => new Set<number>());
  for (const e of gEdges) for (const f of e.faces) { vFaces[e.a].add(f); vFaces[e.b].add(f); }
  const targets: Target[] = vertices.map(({ p, kind }, i) => ({ x: p[0], y: p[1], z: p[2], kind, faces: [...vFaces[i]] }));

  const lens = gEdges.map(({ a, b, bare }) => {
    if (bare) return 0;
    const [p, q] = [vertices[a].p, vertices[b].p];
    return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  });
  const n = allocate(lens, Math.max(0, total - vertices.length), 0);
  const edges: Edge[] = [];
  const chains = new Map<string, number[]>();
  gEdges.forEach(({ a, b, faces }, e) => {
    const [p, q] = [vertices[a].p, vertices[b].p];
    const chain = [a];
    for (let k = 1; k <= n[e]; k++) {
      const f = k / (n[e] + 1);
      targets.push({
        x: p[0] + (q[0] - p[0]) * f, y: p[1] + (q[1] - p[1]) * f, z: p[2] + (q[2] - p[2]) * f,
        kind: vertices[a].kind === 'detail' ? 'detail' : 'edge', faces,
      });
      chain.push(targets.length - 1);
    }
    chain.push(b);
    for (let c = 0; c < chain.length - 1; c++) edges.push({ i: chain[c], j: chain[c + 1], strong: false, faces });
    chains.set(`${a}-${b}`, chain);
    chains.set(`${b}-${a}`, [...chain].reverse());
  });
  /** The dots along a walk round the given vertices. */
  const path = (vs: number[]) => {
    const out = [vs[0]];
    for (let k = 1; k < vs.length; k++) out.push(...(chains.get(`${vs[k - 1]}-${vs[k]}`) ?? []).slice(1));
    return out;
  };
  return { targets: pad(targets), edges, path };
}

/** A small square on a face: four corners, joined, no dots between. */
function square(
  at: (p: V3, kind: Kind) => number,
  corners: V3[],
  face: number,
): GraphEdge[] {
  const v = corners.map((c) => at(c, 'detail'));
  return v.map((a, k) => ({ a, b: v[(k + 1) % v.length], faces: [face], bare: true }));
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

// house: a pentagonal prism - walls W wide x D deep from the ground G to
// the eaves T, ridge at P. Faces: front, back, left, right, left roof,
// right roof, ground.
const HOUSE: Shape = (() => {
  const [W, D, G, T, P] = [0.6, 0.36, -0.68, 0.1, 0.66];
  const [FRONT, BACK, LEFT, RIGHT, ROOF_L, ROOF_R, GROUND] = [0, 1, 2, 3, 4, 5, 6];
  const normals: V3[] = [[0, 0, 1], [0, 0, -1], [-1, 0, 0], [1, 0, 0], norm([-(P - T), W, 0]), norm([P - T, W, 0]), [0, -1, 0]];
  const v: { p: V3; kind: Kind }[] = [];
  const at = (p: V3, kind: Kind = 'corner') => (v.push({ p, kind }), v.length - 1);
  const b = [at([-W, G, D]), at([W, G, D]), at([W, G, -D]), at([-W, G, -D])];
  const t = [at([-W, T, D]), at([W, T, D]), at([W, T, -D]), at([-W, T, -D])];
  const r = [at([0, P, D]), at([0, P, -D])];
  // The arched door on the front.
  const [dw, dTop] = [0.15, -0.36];
  const doorL = at([-dw, G, D], 'detail');
  const doorR = at([dw, G, D], 'detail');
  const arch = [0, 1, 2, 3, 4].map((k) => {
    const ang = Math.PI - (k * Math.PI) / 4;
    return at([dw * Math.cos(ang), dTop + dw * Math.sin(ang), D], 'detail');
  });
  const e: GraphEdge[] = [
    // Ground, the front split by the doorway.
    { a: b[0], b: doorL, faces: [FRONT, GROUND] }, { a: doorL, b: doorR, faces: [FRONT, GROUND] },
    { a: doorR, b: b[1], faces: [FRONT, GROUND] }, { a: b[1], b: b[2], faces: [RIGHT, GROUND] },
    { a: b[2], b: b[3], faces: [BACK, GROUND] }, { a: b[3], b: b[0], faces: [LEFT, GROUND] },
    // Wall corners.
    { a: b[0], b: t[0], faces: [FRONT, LEFT] }, { a: b[1], b: t[1], faces: [FRONT, RIGHT] },
    { a: b[2], b: t[2], faces: [BACK, RIGHT] }, { a: b[3], b: t[3], faces: [BACK, LEFT] },
    // Eaves, gables and ridge.
    { a: t[1], b: t[2], faces: [RIGHT, ROOF_R] }, { a: t[3], b: t[0], faces: [LEFT, ROOF_L] },
    { a: t[0], b: r[0], faces: [FRONT, ROOF_L] }, { a: r[0], b: t[1], faces: [FRONT, ROOF_R] },
    { a: t[3], b: r[1], faces: [BACK, ROOF_L] }, { a: r[1], b: t[2], faces: [BACK, ROOF_R] },
    { a: r[0], b: r[1], faces: [ROOF_L, ROOF_R] },
    // Door.
    { a: doorL, b: arch[0], faces: [FRONT] },
    ...arch.slice(1).map((a, k) => ({ a: arch[k], b: a, faces: [FRONT], bare: true })),
    { a: arch[4], b: doorR, faces: [FRONT] },
  ];
  // Windows either side of the door, and one on the side - the side is seen
  // edge-on enough that two looked cramped.
  const s = 0.1;
  for (const x of [-0.38, 0.38]) {
    e.push(...square(at, [[x - s, -0.35, D], [x + s, -0.35, D], [x + s, -0.15, D], [x - s, -0.15, D]], FRONT));
  }
  e.push(...square(at, [[W, -0.35, s], [W, -0.35, -s], [W, -0.15, -s], [W, -0.15, s]], RIGHT));
  const g = sampleGraph(v, e, ORB_DOT_COUNT);
  return {
    name: 'house',
    normals,
    targets: g.targets,
    edges: g.edges,
    runs: [
      { path: g.path([t[0], r[0], r[1], t[2]]), closed: false },
      { path: g.path([b[0], doorL, doorR, b[1], b[2]]), closed: false },
    ],
  };
})();

// flats: a block W wide x D deep from G to T, a balcony jutting out from the
// front on every floor and a window down the side for each.
const FLATS: Shape = (() => {
  const [W, D, G, T] = [0.38, 0.28, -0.86, 0.86];
  const [FRONT, BACK, LEFT, RIGHT, TOP, GROUND] = [0, 1, 2, 3, 4, 5];
  const normals: V3[] = [[0, 0, 1], [0, 0, -1], [-1, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0]];
  const v: { p: V3; kind: Kind }[] = [];
  const at = (p: V3, kind: Kind = 'corner') => (v.push({ p, kind }), v.length - 1);
  const b = [at([-W, G, D]), at([W, G, D]), at([W, G, -D]), at([-W, G, -D])];
  const t = [at([-W, T, D]), at([W, T, D]), at([W, T, -D]), at([-W, T, -D])];
  const e: GraphEdge[] = [
    { a: b[0], b: b[1], faces: [FRONT, GROUND] }, { a: b[1], b: b[2], faces: [RIGHT, GROUND] },
    { a: b[2], b: b[3], faces: [BACK, GROUND] }, { a: b[3], b: b[0], faces: [LEFT, GROUND] },
    { a: t[0], b: t[1], faces: [FRONT, TOP] }, { a: t[1], b: t[2], faces: [RIGHT, TOP] },
    { a: t[2], b: t[3], faces: [BACK, TOP] }, { a: t[3], b: t[0], faces: [LEFT, TOP] },
    { a: b[0], b: t[0], faces: [FRONT, LEFT] }, { a: b[1], b: t[1], faces: [FRONT, RIGHT] },
    { a: b[2], b: t[2], faces: [BACK, RIGHT] }, { a: b[3], b: t[3], faces: [BACK, LEFT] },
  ];
  const [bx, out] = [0.27, 0.16];
  for (const y of [-0.52, -0.22, 0.08, 0.38, 0.68]) {
    // The balcony: out from the wall, along, and back in.
    const p = [at([-bx, y, D], 'detail'), at([-bx, y, D + out], 'detail'), at([bx, y, D + out], 'detail'), at([bx, y, D], 'detail')];
    e.push(
      { a: p[0], b: p[1], faces: [FRONT], bare: true },
      { a: p[1], b: p[2], faces: [FRONT] },
      { a: p[2], b: p[3], faces: [FRONT], bare: true },
    );
    const wy = y + 0.13;
    e.push(...square(at, [[W, wy - 0.07, 0.1], [W, wy - 0.07, -0.1], [W, wy + 0.07, -0.1], [W, wy + 0.07, 0.1]], RIGHT));
  }
  const g = sampleGraph(v, e, ORB_DOT_COUNT);
  return {
    name: 'flats',
    normals,
    targets: g.targets,
    edges: g.edges,
    runs: [{ path: g.path([t[0], t[1], t[2], t[3], t[0]]).slice(0, -1), closed: true }],
  };
})();

// --- flat shape: polylines in the unit square --------------------------------

/**
 * Exactly `total` dots spaced evenly along a polyline. Its corners are only
 * where the simplified outline happened to bend, so no dot is forced onto
 * them - spacing stays even, and the count never runs over.
 */
function samplePolyline(pts: Pt[], total: number, closed: boolean, kind: Kind, first: number) {
  const ring = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let s = 1; s < ring.length; s++) {
    cum.push(cum[s - 1] + Math.hypot(ring[s][0] - ring[s - 1][0], ring[s][1] - ring[s - 1][1]));
  }
  const L = cum[cum.length - 1];
  const targets: Target[] = [];
  let seg = 1;
  for (let k = 0; k < total; k++) {
    const d = closed ? (L * k) / total : (L * k) / Math.max(1, total - 1);
    while (seg < ring.length - 1 && cum[seg] < d) seg++;
    const [a, b] = [ring[seg - 1], ring[seg]];
    const f = (d - cum[seg - 1]) / Math.max(1e-9, cum[seg] - cum[seg - 1]);
    targets.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: 0, kind, faces: [] });
  }
  const path = targets.map((_, i) => first + i);
  const edges: Edge[] = path.slice(1).map((j, k) => ({ i: path[k], j, strong: kind === 'river', faces: [] }));
  if (closed) edges.push({ i: path[path.length - 1], j: path[0], strong: false, faces: [] });
  return { targets, edges, path };
}

// Built from the map's own data (data/isochrones/ + journey-times.json):
// every station within 34 minutes of Sloane Square, each with the walk its
// spare minutes allow, joined up - exactly how the map makes a teal zone.
// The main area smoothed and simplified so that, drawn in dots, it reads
// as an area rather than a coastline (its small outlying pockets are left
// out for the same reason), and the Thames from thames-centreline.json.
// Fitted to the square, north up. Ealing is its western tip, Peckham its
// south-eastern edge.
const ZONE_RING: Pt[] = [
  [0.045, 0.381], [0.073, 0.285], [0.125, 0.321], [0.114, 0.374], [0.15, 0.419], [0.223, 0.423],
  [0.269, 0.341], [0.323, 0.319], [0.341, 0.191], [0.384, 0.186], [0.431, 0.12], [0.522, 0.153],
  [0.562, 0.081], [0.717, 0.08], [0.711, 0.153], [0.747, 0.264], [0.819, 0.314], [0.955, 0.31],
  [0.867, 0.386], [0.891, 0.453], [0.877, 0.507], [0.763, 0.505], [0.728, 0.534], [0.738, 0.582],
  [0.791, 0.586], [0.81, 0.611], [0.728, 0.678], [0.731, 0.788], [0.646, 0.714], [0.608, 0.709],
  [0.497, 0.856], [0.438, 0.912], [0.392, 0.92], [0.321, 0.88], [0.331, 0.807], [0.276, 0.646],
  [0.294, 0.557], [0.234, 0.527], [0.086, 0.527],
];
const THAMES: Pt[] = [
  [0.0, 0.598], [0.023, 0.583], [0.062, 0.532], [0.084, 0.523], [0.12, 0.548], [0.142, 0.595],
  [0.176, 0.607], [0.201, 0.587], [0.213, 0.533], [0.238, 0.512], [0.26, 0.511], [0.28, 0.531],
  [0.287, 0.581], [0.315, 0.62], [0.356, 0.64], [0.399, 0.641], [0.423, 0.624], [0.44, 0.572],
  [0.457, 0.553], [0.596, 0.529], [0.613, 0.502], [0.623, 0.426], [0.654, 0.406], [0.748, 0.419],
  [0.817, 0.448], [0.871, 0.413], [0.902, 0.417], [0.917, 0.435], [0.916, 0.492], [0.933, 0.521],
  [0.969, 0.536], [1.0, 0.524],
];
/** Faint dots inside the area, clear of the edge and the river: the map's fill. */
const ZONE_FILL: Pt[] = [
  [0.42, 0.845], [0.42, 0.77], [0.495, 0.77], [0.345, 0.695], [0.42, 0.695], [0.495, 0.695],
  [0.495, 0.62], [0.57, 0.62], [0.645, 0.62], [0.72, 0.62], [0.345, 0.545], [0.645, 0.545], [0.12,
  0.47], [0.195, 0.47], [0.27, 0.47], [0.345, 0.47], [0.42, 0.47], [0.72, 0.47], [0.345, 0.395],
  [0.42, 0.395], [0.495, 0.395], [0.57, 0.395], [0.795, 0.395], [0.42, 0.32], [0.495, 0.32],
  [0.57, 0.32], [0.645, 0.32], [0.72, 0.32], [0.42, 0.245], [0.495, 0.245], [0.57, 0.245], [0.645,
  0.245], [0.57, 0.17], [0.645, 0.17],
];

const ZONE: Shape = (() => {
  const river = samplePolyline(THAMES, 20, false, 'river', 0);
  const ring = samplePolyline(ZONE_RING, ORB_DOT_COUNT - 20 - ZONE_FILL.length, true, 'edge', 20);
  const fill: Target[] = ZONE_FILL.map(([x, y]) => ({ x, y, z: 0, kind: 'fill', faces: [] }));
  return {
    name: 'zone',
    normals: [],
    targets: pad([...river.targets, ...ring.targets, ...fill]),
    edges: [...river.edges, ...ring.edges],
    runs: [{ path: river.path, closed: false }],
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

/** Spin about the vertical, then tip towards the viewer: screen x, y and depth. */
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
  corner: { r: 1.25, white: 0.1, a: 1 },
  detail: { r: 0.8, white: 0.12, a: 1 },
  river: { r: 0.85, white: 0.02, a: 1 },
  fill: { r: 0.7, white: 0.55, a: 0.85 },
  ghost: { r: 0.6, white: 0.3, a: 0 },
};

const smooth = (lo: number, hi: number, v: number) => {
  const f = clamp01((v - lo) / (hi - lo));
  return f * f * (3 - 2 * f);
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
  const solid = shape.normals.length > 0;
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
  // How much each face looks towards us: 1 facing, 0 turned away.
  const faceVis = shape.normals.map((n) => smooth(-0.04, 0.14, turn(n[0], n[1], n[2], solidYaw, solidTilt)[2]));
  const seen = (faces: number[]) => (faces.length ? Math.max(...faces.map((f) => faceVis[f])) : 1);

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
    if (solid) {
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
    // In a solid, depth reads through size and shade, as on the globe, and
    // whatever is round the back is hidden.
    const depthR = solid ? 0.8 + 0.4 * near : 1;
    const depthWhite = solid ? (1 - near) * 0.22 : -0.08 * Math.max(-1, Math.min(1, home.z));
    const shown = solid ? seen(tg.faces) : 1;
    dots.push({
      ...pos[i],
      r: lerp(rDot * (0.7 + 0.5 * near), rDot * look.r * depthR, p),
      white: lerp(0.62 - 0.5 * near, look.white + depthWhite, p),
      a: lerp(0.55 + 0.45 * near, look.a * shown, p),
    });
  });

  const lines: HouseLine[] = [];

  // The globe's web fades as the dots leave it.
  for (const [i, j] of WEB) {
    const a = 0.16 * (1 - Math.max(progress[i], progress[j])) * (0.5 + 0.5 * nearness[i]);
    if (a < 0.02) continue;
    lines.push({ x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y, white: 0.3, a, w: lineW });
  }

  // The outline draws itself in as both ends of each edge arrive. The
  // Thames is drawn stronger, as a river on a map would be.
  for (const { i, j, strong, faces } of shape.edges) {
    const shown = solid ? seen(faces) : 1;
    const a = (strong ? 0.8 : 0.6) * shown * Math.min(progress[i], progress[j]) ** 3;
    if (a < 0.02) continue;
    lines.push({
      x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y,
      white: strong ? 0 : 0.1, a, w: strong ? lineW * 1.8 : lineW,
    });
  }

  // A bright dot with a short tail runs each path - back and forth along an
  // open one, round and round a closed one.
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
