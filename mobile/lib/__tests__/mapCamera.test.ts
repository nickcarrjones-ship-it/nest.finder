import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boundsOf, midpoint, openingCamera, zoomToShow } from '../mapCamera';

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

describe('zoomToShow — how far out to sit', () => {
  const viewport = { width: 412, height: 800 };
  const london = { sw: { lng: -0.35, lat: 51.40 }, ne: { lng: 0.05, lat: 51.62 } };

  it('zooms out for a larger region', () => {
    const small = { sw: { lng: -0.15, lat: 51.48 }, ne: { lng: -0.05, lat: 51.53 } };
    assert.ok(zoomToShow(small, viewport) > zoomToShow(london, viewport));
  });

  it('shows LESS of a region as the fraction falls', () => {
    // A smaller fraction on screen means closer in, so a higher zoom.
    assert.ok(zoomToShow(london, viewport, 0.4) > zoomToShow(london, viewport, 0.9));
  });

  it('treats the fraction as AREA, not width', () => {
    // 70% of the area is ~84% of the span. Reading it as width would put
    // the camera a noticeable step further out.
    const asArea = zoomToShow(london, viewport, 0.7);
    const ifItWereWidth = zoomToShow(london, viewport, 0.49); // 0.7 squared
    assert.ok(Math.abs(asArea - ifItWereWidth) > 0.2, 'the two readings differ visibly');
  });

  it('stays within zooms a street map can render', () => {
    const tiny = { sw: { lng: 0, lat: 51.5 }, ne: { lng: 0.0001, lat: 51.5001 } };
    const huge = { sw: { lng: -8, lat: 50 }, ne: { lng: 2, lat: 58 } };
    assert.ok(zoomToShow(tiny, viewport) <= 14);
    assert.ok(zoomToShow(huge, viewport) >= 8);
  });
});

describe('openingCamera — the first thing anyone sees', () => {
  const viewport = { width: 412, height: 800 };
  const region = ring([[-0.3, 51.42], [0.05, 51.42], [0.05, 51.60], [-0.3, 51.60], [-0.3, 51.42]]);

  it('centres between the workplaces, not on the region', () => {
    // The region can sprawl down one rail line; the workplaces cannot.
    const cam = openingCamera([{ lng: -0.019, lat: 51.504 }, { lng: -0.176, lat: 51.516 }], region, viewport);
    assert.ok(cam);
    assert.ok(Math.abs(cam!.center[0] - -0.0975) < 0.001, 'midway between the two offices');
  });

  it('still opens usefully before the region has been computed', () => {
    const cam = openingCamera([{ lng: -0.1, lat: 51.5 }], null, viewport);
    assert.ok(cam);
    assert.equal(cam!.zoom, 10.5, 'a sensible city zoom rather than waiting');
  });

  it('gives nothing when nobody has said where they work', () => {
    // Better the default London view than a confident guess that jumps
    // once the real data arrives.
    assert.equal(openingCamera([], region, viewport), null);
  });
});
