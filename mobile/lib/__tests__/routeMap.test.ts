import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRouteMap, routeMapFrame, ROUTE_TIMES } from '../routeMap';
import type { PersonRoute, Route } from '../routes';

// Earlsfield to Canary Wharf and to Holborn, as TfL gave them on
// 2026-10-02, thinned to a few points a leg.
const R = {"nick": {"mins": 42, "legs": [{"mode": "national-rail", "line": "South Western Railway", "from": "Earlsfield Rail Station", "to": "London Waterloo Rail Station", "mins": 15, "path": [[51.4423, -0.1876], [51.4646, -0.17], [51.4777, -0.1403], [51.4861, -0.1225], [51.4919, -0.1192], [51.5018, -0.1147], [51.5023, -0.1143]]}, {"mode": "tube", "line": "Jubilee", "from": "Waterloo Underground Station", "to": "Canary Wharf Underground Station", "mins": 10, "path": [[51.5034, -0.1131], [51.5044, -0.094], [51.5044, -0.084], [51.4975, -0.0664], [51.4984, -0.046], [51.5044, -0.0245], [51.5036, -0.0186]]}, {"mode": "walking", "line": "", "from": "Canary Wharf Underground Station", "to": "Canary Wharf Rail Station", "mins": 9, "path": [[51.5036, -0.0185], [51.5038, -0.0185], [51.5039, -0.0197], [51.5053, -0.0194], [51.5062, -0.0188], [51.5063, -0.0188]]}]}, "harriet": {"mins": 30, "legs": [{"mode": "national-rail", "line": "South Western Railway", "from": "Earlsfield Rail Station", "to": "London Waterloo Rail Station", "mins": 16, "path": [[51.4423, -0.1876], [51.4646, -0.17], [51.4777, -0.1403], [51.4861, -0.1225], [51.4919, -0.1192], [51.5018, -0.1147], [51.5023, -0.1143]]}, {"mode": "walking", "line": "", "from": "London Waterloo Rail Station", "to": "Waterloo Station / Tenison Way", "mins": 5, "path": [[51.5023, -0.1144], [51.5033, -0.1133], [51.5035, -0.1122], [51.5038, -0.1129], [51.5041, -0.114], [51.5045, -0.1134]]}, {"mode": "bus", "line": "59", "from": "Waterloo Station / Tenison Way", "to": "Holborn Station", "mins": 9, "path": [[51.5044, -0.1134], [51.5054, -0.1141], [51.5106, -0.1188], [51.5116, -0.119], [51.5132, -0.1175], [51.5171, -0.1202]]}]}} as unknown as Record<'nick' | 'harriet', Route>;
const people: PersonRoute[] = [
  { name: 'Nick', office: 'Canary Wharf', route: R.nick },
  { name: 'Harriet', office: 'Holborn', route: R.harriet },
];
const THAMES: [number, number][] = [[-0.2, 51.47], [-0.15, 51.48], [-0.12, 51.5], [-0.1, 51.508], [-0.05, 51.5], [0, 51.49]];
const W = 312;
const H = 160;
const layout = layoutRouteMap('Earlsfield', people, THAMES, W, H);

describe('route map', () => {
  it('rings the start, the change at Waterloo and each office - once each', () => {
    const names = layout.labels.map((l) => l.text).sort();
    assert.deepEqual(names, ['Canary Wharf', 'Earlsfield', 'Holborn', 'Waterloo']);
  });

  it('tags each office with who works there', () => {
    assert.deepEqual(layout.pills.map((p) => p.text).sort(), ['HARRIET', 'NICK']);
  });

  it('keeps every name on the card and clear of every other', () => {
    const boxes = [...layout.labels.map((l) => l.box), ...layout.pills.map((p) => p.box)];
    for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H, JSON.stringify(b));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const clash = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!clash, `${i} and ${j} overlap`);
      }
    }
  });

  it('starts blank, draws in, then settles with the trains stopped', () => {
    const start = routeMapFrame(layout, 0);
    assert.equal(start.segments.filter((s) => s.w > 3).length, 0, 'no route yet');
    const running = routeMapFrame(layout, 6);
    assert.ok(running.dots.some((d) => d.r > 3), 'trains running');
    assert.equal(running.pills.length, 2);
    const settled = routeMapFrame(layout, ROUTE_TIMES.settle + 2);
    assert.ok(settled.segments.some((s) => s.color === '#A0A5A9'), 'the Jubilee line');
    assert.ok(settled.segments.some((s) => s.color === '#DC241F'), 'the 59 bus');
    assert.ok(!settled.dots.some((d) => d.r > 3), 'trains stopped');
  });

  it('shows the finished map straight away when motion is reduced', () => {
    const f = routeMapFrame(layout, 0, true);
    assert.ok(f.segments.some((s) => s.color === '#3C4248'));
    assert.equal(f.labels.length, 4);
  });
});
