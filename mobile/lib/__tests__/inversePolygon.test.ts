import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { invertRegion, outerRings, regionFeature } from '../inversePolygon';

const square = [[-0.1, 51.5], [-0.09, 51.5], [-0.09, 51.51], [-0.1, 51.51], [-0.1, 51.5]];

describe('invertRegion — dimming everything outside the reachable area', () => {
  it('wraps the world and punches the region out as a hole', () => {
    const p = invertRegion([square]);
    assert.equal(p.type, 'Polygon');
    assert.equal(p.coordinates.length, 2);           // world + one hole
    assert.deepEqual(p.coordinates[1], square);
  });

  it('covers the whole map, so nothing outside is left unshaded', () => {
    const [world] = invertRegion([square]).coordinates;
    const lngs = world.map((p) => p[0]);
    const lats = world.map((p) => p[1]);
    assert.ok(Math.min(...lngs) <= -180 && Math.max(...lngs) >= 180);
    assert.ok(Math.min(...lats) <= -85 && Math.max(...lats) >= 85);
  });

  it('keeps several separate pockets as separate holes', () => {
    const other = square.map(([x, y]) => [x + 1, y + 1]);
    assert.equal(invertRegion([square, other]).coordinates.length, 3);
  });

  it('discards degenerate rings rather than emitting invalid holes', () => {
    const p = invertRegion([square, [[0, 0], [1, 1]]]);
    assert.equal(p.coordinates.length, 2);
  });

  it('with no reachable area, shades the entire map', () => {
    assert.equal(invertRegion([]).coordinates.length, 1);
  });
});

describe('outerRings — reading polygon-clipping output', () => {
  it('takes the shell of each polygon and ignores its holes', () => {
    const hole = square.map(([x, y]) => [x + 0.002, y + 0.002]);
    assert.deepEqual(outerRings([[square, hole]]), [square]);
  });

  it('survives empty or malformed input', () => {
    assert.deepEqual(outerRings([] as never), []);
    assert.deepEqual(outerRings(undefined as never), []);
  });
});

describe('regionFeature — the boundary line', () => {
  it('turns rings into a MultiPolygon the map can stroke', () => {
    const f = regionFeature([square]);
    assert.equal(f.type, 'MultiPolygon');
    assert.deepEqual(f.coordinates, [[square]]);
  });
});
