import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boundsOf, framingBounds, midpoint } from '../mapCamera';

const ring = (pts: [number, number][]): GeoJSON.MultiPolygon => ({
  type: 'MultiPolygon',
  coordinates: [[pts]],
});

describe('midpoint — the point between the workplaces', () => {
  it('sits between two workplaces', () => {
    // Canary Wharf and Paddington: the midpoint is central London, not
    // either office.
    const mid = midpoint([{ lng: -0.019, lat: 51.504 }, { lng: -0.176, lat: 51.516 }]);
    assert.ok(mid);
    assert.ok(mid!.lng > -0.176 && mid!.lng < -0.019);
    assert.ok(mid!.lat > 51.5 && mid!.lat < 51.52);
  });

  it('is the workplace itself when someone lives alone', () => {
    const mid = midpoint([{ lng: -0.1, lat: 51.5 }]);
    assert.deepEqual(mid, { lng: -0.1, lat: 51.5 });
  });

  it('returns null rather than a default when nobody has said where they work', () => {
    assert.equal(midpoint([]), null);
  });
});

describe('boundsOf — the corners of the reachable region', () => {
  it('finds the extremes across several separate pockets', () => {
    const region: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [[[-0.2, 51.4], [-0.1, 51.4], [-0.1, 51.5], [-0.2, 51.5], [-0.2, 51.4]]],
        [[[0.0, 51.6], [0.1, 51.6], [0.1, 51.7], [0.0, 51.7], [0.0, 51.6]]],
      ],
    };
    assert.deepEqual(boundsOf(region), {
      sw: { lng: -0.2, lat: 51.4 },
      ne: { lng: 0.1, lat: 51.7 },
    });
  });

  it('ignores holes, which cannot extend the bounds', () => {
    const withHole: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [[
        [[-0.2, 51.4], [-0.1, 51.4], [-0.1, 51.5], [-0.2, 51.5], [-0.2, 51.4]],
        [[-0.18, 51.42], [-0.12, 51.42], [-0.12, 51.48], [-0.18, 51.48], [-0.18, 51.42]],
      ]],
    };
    assert.deepEqual(boundsOf(withHole)!.sw, { lng: -0.2, lat: 51.4 });
  });

  it('returns null for nothing, rather than an empty box at zero', () => {
    assert.equal(boundsOf(null), null);
    assert.equal(boundsOf({ type: 'MultiPolygon', coordinates: [] }), null);
  });
});

describe('framingBounds — the box MapLibre is asked to fit', () => {
  const region = ring([[-0.30, 51.40], [0.10, 51.40], [0.10, 51.60], [-0.30, 51.60], [-0.30, 51.40]]);
  const work = [{ lng: -0.019, lat: 51.504 }, { lng: -0.176, lat: 51.516 }];

  it('centres on the workplaces, not on the region', () => {
    // The region can sprawl down one rail line; the workplaces cannot.
    const b = framingBounds(work, region);
    assert.ok(b);
    const midLng = (b!.sw.lng + b!.ne.lng) / 2;
    assert.ok(Math.abs(midLng - -0.0975) < 0.0001, 'midway between the two offices');
  });

  it('is SMALLER than the region, so the region overflows it', () => {
    // Fitting the region exactly would show all of it. Showing 70% means
    // fitting a box that the region spills out of.
    const b = framingBounds(work, region)!;
    const full = boundsOf(region)!;
    assert.ok(b.ne.lng - b.sw.lng < full.ne.lng - full.sw.lng);
  });

  it('treats the fraction as AREA — 70% of area is 84% of the span', () => {
    const b = framingBounds(work, region, 0.7)!;
    const full = boundsOf(region)!;
    const spanRatio = (b.ne.lng - b.sw.lng) / (full.ne.lng - full.sw.lng);
    assert.ok(Math.abs(spanRatio - Math.sqrt(0.7)) < 0.001, `span ratio was ${spanRatio}`);
  });

  it('shows more of the region as the fraction rises', () => {
    const small = framingBounds(work, region, 0.4)!;
    const large = framingBounds(work, region, 0.9)!;
    assert.ok(large.ne.lng - large.sw.lng > small.ne.lng - small.sw.lng);
  });

  it('gives nothing when there is no region or nobody has said where they work', () => {
    // Better the default view than a confident guess that jumps later.
    assert.equal(framingBounds(work, null), null);
    assert.equal(framingBounds([], region), null);
  });
});
