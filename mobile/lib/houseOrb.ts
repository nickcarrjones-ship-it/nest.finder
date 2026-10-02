/**
 * A house drawn in the thinking-orb style (Nick, 2026-10-02: "a version of
 * that orb that can sit over the Maloca ... where it forms a shape of a
 * house").
 *
 * It starts as the same spinning dotted globe as the "connecting" orb in
 * Ask, then each dot flies to its place on a house outline - pitched roof,
 * walls, and an arched door that echoes the arches of the Maloca mark. Once
 * built, the house turns gently side to side and a bright dot runs along
 * the roof and walls, as the orb's packets run its edges.
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
 * once - builds the house and keeps it (a screen people read).
 * loop - builds it, holds it, lets it go back to a globe, and repeats (a
 *        wait of unknown length).
 */
export type HouseTimeline = 'once' | 'loop';

type Pt = [number, number];

// The outline in a unit square. The roof is a chevron sitting just clear of
// the walls, as in a line-drawn house icon, so the dots never crowd where
// the two would meet.
const ROOF: Pt[] = [[0.12, 0.54], [0.5, 0.16], [0.88, 0.54]];
const WALLS: Pt[] = [[0.22, 0.5], [0.22, 0.86], [0.78, 0.86], [0.78, 0.5]];
const DOOR: Pt[] = (() => {
  const cx = 0.5;
  const top = 0.72;
  const r = 0.07;
  const arch: Pt[] = [];
  for (let k = 0; k <= 4; k++) {
    const ang = Math.PI - (k * Math.PI) / 4;
    arch.push([cx + r * Math.cos(ang), top - r * Math.sin(ang)]);
  }
  return [[cx - r, 0.86], ...arch, [cx + r, 0.86]];
})();

const SPACING = 0.058;

interface Target { x: number; y: number; corner: boolean }

/** Evenly spaced points along a polyline, always landing on its corners. */
function resample(poly: Pt[]): Target[] {
  const out: Target[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / SPACING));
    for (let k = 0; k < n; k++) {
      out.push({ x: ax + ((bx - ax) * k) / n, y: ay + ((by - ay) * k) / n, corner: k === 0 });
    }
  }
  const [lx, ly] = poly[poly.length - 1];
  out.push({ x: lx, y: ly, corner: true });
  return out;
}

const PARTS = [ROOF, WALLS, DOOR].map(resample);
const TARGETS: Target[] = PARTS.flat();
export const HOUSE_DOT_COUNT = TARGETS.length;

/** Pairs of dot indices joined by the outline, part by part. */
const OUTLINE: [number, number][] = [];
{
  let base = 0;
  for (const part of PARTS) {
    for (let i = 0; i < part.length - 1; i++) OUTLINE.push([base + i, base + i + 1]);
    base += part.length;
  }
}
export const HOUSE_EDGE_COUNT = OUTLINE.length;

/** Even directions over a sphere (Fibonacci lattice), one per dot. */
const SPHERE: [number, number, number][] = TARGETS.map((_, i) => {
  const n = TARGETS.length;
  const y = 1 - (2 * (i + 0.5)) / n;
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

/** Deterministic 0-1 per dot, so each one sets off at its own moment. */
function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

const LOOP = { globe: 0.8, build: 1.6, hold: 2.2, unbuild: 1.1 };
export const HOUSE_LOOP_SECONDS = LOOP.globe + LOOP.build + LOOP.hold + LOOP.unbuild;

/** How built the house is at time t: 0 is the globe, 1 the finished house. */
export function builtAt(t: number, timeline: HouseTimeline): number {
  if (timeline === 'once') return clamp01((t - 0.5) / LOOP.build);
  const u = ((t % HOUSE_LOOP_SECONDS) + HOUSE_LOOP_SECONDS) % HOUSE_LOOP_SECONDS;
  if (u < LOOP.globe) return 0;
  if (u < LOOP.globe + LOOP.build) return (u - LOOP.globe) / LOOP.build;
  if (u < LOOP.globe + LOOP.build + LOOP.hold) return 1;
  return 1 - (u - LOOP.globe - LOOP.build - LOOP.hold) / LOOP.unbuild;
}

const STAGGER = 0.4;

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

  // The finished house turns a little side to side and gently breathes.
  const settled = clamp01((built - 0.9) / 0.1);
  const sway = still ? 0 : Math.sin(t * 0.8) * 0.22 * settled;

  const dots: HouseDot[] = [];
  const progress: number[] = [];
  const pos: { x: number; y: number; z: number }[] = [];

  TARGETS.forEach((tg, i) => {
    const [sx, sy, sz] = SPHERE[i];
    const x1 = sx * Math.cos(yaw) + sz * Math.sin(yaw);
    const z1 = -sx * Math.sin(yaw) + sz * Math.cos(yaw);
    const y1 = sy * Math.cos(tilt) - z1 * Math.sin(tilt);
    const z2 = sy * Math.sin(tilt) + z1 * Math.cos(tilt);
    const globe = { x: gx + x1 * R, y: gy - y1 * R, z: z2 };

    const hxOff = tg.x - 0.5;
    const drift = still ? 0 : settled * 0.004 * size;
    const house = {
      x: (0.5 + hxOff * Math.cos(sway)) * size + Math.sin(t * 1.7 + i * 1.3) * drift,
      y: tg.y * size + Math.cos(t * 1.3 + i * 0.7) * drift,
      z: hxOff * Math.sin(sway) * 2,
    };

    const p = ease(clamp01((built - hash(i) * STAGGER) / (1 - STAGGER)));
    progress.push(p);
    const x = lerp(globe.x, house.x, p);
    const y = lerp(globe.y, house.y, p);
    const z = lerp(globe.z, house.z, p);
    pos.push({ x, y, z });

    const near = (z + 1) / 2; // 0 far .. 1 near
    const globeWhite = 0.62 - 0.5 * near;
    const houseWhite = 0.14 - 0.08 * Math.max(-1, Math.min(1, house.z));
    const corner = tg.corner ? 1.25 : 1;
    dots.push({
      x,
      y,
      z,
      r: lerp(rDot * (0.7 + 0.5 * near), rDot * corner, p),
      white: lerp(globeWhite, houseWhite, p),
      a: lerp(0.55 + 0.45 * near, 1, p),
    });
  });

  const lines: HouseLine[] = [];

  // The globe's web fades as the dots leave it.
  for (const [i, j] of WEB) {
    const a = 0.16 * (1 - Math.max(progress[i], progress[j])) * (0.5 + 0.5 * (pos[i].z + 1) / 2);
    if (a < 0.02) continue;
    lines.push({ x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y, white: 0.3, a, w: lineW });
  }

  // The outline draws itself in as both ends of each edge arrive.
  for (const [i, j] of OUTLINE) {
    const a = 0.55 * Math.min(progress[i], progress[j]) ** 3;
    if (a < 0.02) continue;
    lines.push({ x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y, white: 0.1, a, w: lineW });
  }

  // A bright dot running the roof and another the walls, with a short tail.
  if (!still && settled > 0) {
    let base = 0;
    PARTS.slice(0, 2).forEach((part, pi) => {
      for (let tail = 0; tail < 3; tail++) {
        const u = (((t * 0.32 + pi * 0.5 - tail * 0.025) % 1) + 1) % 1;
        const f = u * (part.length - 1);
        const a0 = base + Math.floor(f);
        const b0 = Math.min(base + part.length - 1, a0 + 1);
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
      base += part.length;
    });
  }

  dots.sort((a, b) => a.z - b.z);
  return { dots: dots.filter((d) => (d.a ?? 1) >= 0.02), lines };
}
