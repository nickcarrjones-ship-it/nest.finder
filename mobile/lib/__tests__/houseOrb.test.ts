import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ORB_DOT_COUNT, HOUSE_EDGE_COUNT, HOUSE_LOOP_SECONDS, builtAt, houseFrame, shapeAt } from '../houseOrb';

const SHAPE = HOUSE_LOOP_SECONDS / 3;

describe('house orb', () => {
  it('starts as a globe with no outline drawn', () => {
    const f = houseFrame(128, 0, 'once');
    assert.equal(f.dots.length, ORB_DOT_COUNT);
    assert.ok(f.lines.every((l) => l.white === 0.3), 'only the globe web');
  });

  it('ends as a finished house with every outline edge drawn', () => {
    const f = houseFrame(128, 10, 'once', true);
    const outline = f.lines.filter((l) => l.white === 0.1);
    assert.equal(outline.length, HOUSE_EDGE_COUNT);
    // Inside the square, with the roof peak at the top.
    assert.ok(f.dots.every((d) => d.x >= 0 && d.x <= 128 && d.y >= 0 && d.y <= 128));
    assert.ok(Math.abs(Math.min(...f.dots.map((d) => d.y)) - 0.16 * 128) < 0.5);
  });

  it('loops house, flats, zone, going back to the globe between each', () => {
    assert.equal(shapeAt(3, 'loop'), 'house');
    assert.equal(shapeAt(SHAPE + 3, 'loop'), 'flats');
    assert.equal(shapeAt(2 * SHAPE + 3, 'loop'), 'zone');
    assert.equal(shapeAt(HOUSE_LOOP_SECONDS + 3, 'loop'), 'house');
    for (const start of [0, SHAPE, 2 * SHAPE]) {
      assert.equal(builtAt(start, 'loop'), 0, 'each shape starts from the globe');
      assert.equal(builtAt(start + 3, 'loop'), 1);
      assert.equal(builtAt(start + SHAPE - 0.001, 'loop') < 0.01, true, 'and goes back to it');
    }
    assert.equal(builtAt(60, 'once'), 1, 'shown once, it stays built');
  });

  it('uses every dot in every shape, all inside the square', () => {
    for (const at of [3, SHAPE + 3, 2 * SHAPE + 3]) {
      const f = houseFrame(128, at, 'loop', true);
      assert.equal(f.dots.length, ORB_DOT_COUNT);
      assert.ok(f.dots.every((d) => d.x >= 0 && d.x <= 128 && d.y >= 0 && d.y <= 128));
    }
  });

  it('draws the zone tube line strong, between its four stations', () => {
    const f = houseFrame(128, 2 * SHAPE + 3, 'loop', true);
    assert.equal(f.lines.filter((l) => l.white === 0).length, 3);
  });

  it('adds no running dot when motion is reduced', () => {
    assert.equal(houseFrame(128, 10, 'once', true).dots.length, ORB_DOT_COUNT);
    assert.ok(houseFrame(128, 10, 'once', false).dots.length > ORB_DOT_COUNT);
  });
});
