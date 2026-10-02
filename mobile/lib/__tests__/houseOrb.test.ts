import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ORB_DOT_COUNT, HOUSE_EDGE_COUNT, HOUSE_LOOP_SECONDS, builtAt, houseFrame, shapeAt } from '../houseOrb';

const SHAPE = HOUSE_LOOP_SECONDS / 3;
const inSquare = (t: number) =>
  houseFrame(128, t, 'loop', true).dots.every((d) => d.x >= 0 && d.x <= 128 && d.y >= 0 && d.y <= 128);

describe('house orb', () => {
  it('starts as a globe with no outline drawn', () => {
    const f = houseFrame(128, 0, 'once');
    assert.equal(f.dots.length, ORB_DOT_COUNT);
    assert.ok(f.lines.every((l) => l.white === 0.3), 'only the globe web');
  });

  it('builds a solid-looking house: the back is hidden, the front drawn', () => {
    const outline = houseFrame(128, 10, 'once', true).lines.filter((l) => l.white === 0.1);
    assert.ok(outline.length < HOUSE_EDGE_COUNT, 'some edges are round the back');
    assert.ok(outline.length > HOUSE_EDGE_COUNT / 2, 'most of it shows');
  });

  it('builds the house and flats in 3D, the zone flat', () => {
    const depth = (t: number) => {
      const zs = houseFrame(128, t, 'loop', true).dots.map((d) => d.z);
      return Math.max(...zs) - Math.min(...zs);
    };
    assert.ok(depth(3) > 0.5, 'house has depth');
    assert.ok(depth(SHAPE + 3) > 0.5, 'so do the flats');
    assert.ok(depth(2 * SHAPE + 3) < 0.01, 'the zone is a map');
  });

  it('loops house, flats, zone, going back to the globe between each', () => {
    assert.equal(shapeAt(3, 'loop'), 'house');
    assert.equal(shapeAt(SHAPE + 3, 'loop'), 'flats');
    assert.equal(shapeAt(2 * SHAPE + 3, 'loop'), 'zone');
    assert.equal(shapeAt(HOUSE_LOOP_SECONDS + 3, 'loop'), 'house');
    for (const start of [0, SHAPE, 2 * SHAPE]) {
      assert.ok(builtAt(start + 0.01, 'loop') === 0, 'each shape starts from the globe');
      assert.equal(builtAt(start + 3, 'loop'), 1);
      assert.equal(builtAt(start + SHAPE - 0.001, 'loop') < 0.01, true, 'and goes back to it');
    }
    assert.equal(builtAt(60, 'once'), 1, 'shown once, it stays built');
  });

  it('keeps every shape inside the square', () => {
    assert.ok(inSquare(3) && inSquare(SHAPE + 3) && inSquare(2 * SHAPE + 3));
  });

  it('draws the Thames through the zone as one strong line', () => {
    const f = houseFrame(128, 2 * SHAPE + 3, 'loop', true);
    assert.equal(f.lines.filter((l) => l.white === 0).length, 19, '20 dots along the river');
  });

  it('adds no running dot when motion is reduced', () => {
    assert.ok(houseFrame(128, 10, 'once', true).dots.every((d) => d.z !== 2));
    assert.ok(houseFrame(128, 10, 'once', false).dots.some((d) => d.z === 2));
  });
});
