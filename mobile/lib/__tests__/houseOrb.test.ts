import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ORB_DOT_COUNT, HOUSE_EDGE_COUNT, HOUSE_LOOP_SECONDS, builtAt, globeAt, houseFrame, shapeAt } from '../houseOrb';

const SHAPE = HOUSE_LOOP_SECONDS / 2;
/** Comfortably inside each shape's hold, when it is fully built. */
const HELD = 4.5;
const [MAP, HOUSE] = [HELD, SHAPE + HELD];
const inSquare = (t: number) =>
  houseFrame(128, t, 'loop', true).dots.every((d) => d.x >= 0 && d.x <= 128 && d.y >= 0 && d.y <= 128);

describe('house orb', () => {
  it('starts as a globe with no outline drawn', () => {
    const f = houseFrame(128, 0, 'once');
    assert.equal(f.dots.length, ORB_DOT_COUNT);
    assert.ok(f.lines.every((l) => l.white === 0.3), 'only the globe web');
  });

  it('goes map, then house, back to the globe between each', () => {
    assert.equal(shapeAt(MAP, 'loop'), 'zone');
    assert.equal(shapeAt(HOUSE, 'loop'), 'house');
    assert.equal(shapeAt(HOUSE_LOOP_SECONDS + MAP, 'loop'), 'zone');
    for (const start of [0, SHAPE]) {
      assert.ok(builtAt(start + 0.01, 'loop') === 0, 'each shape starts from the globe');
      assert.equal(builtAt(start + HELD, 'loop'), 1);
      assert.equal(builtAt(start + SHAPE - 0.001, 'loop') < 0.01, true, 'and goes back to it');
    }
    assert.equal(builtAt(60, 'once'), 1, 'shown once, it stays built');
  });

  it('moves the globe differently before each shape', () => {
    assert.equal(globeAt(0.5, 'loop'), 'connecting');
    assert.equal(globeAt(SHAPE + 0.5, 'loop'), 'solving');
    // Coming apart, the globe already moves the way the next one will.
    assert.equal(globeAt(SHAPE - 0.3, 'loop'), 'solving');
    assert.equal(globeAt(HOUSE_LOOP_SECONDS - 0.3, 'loop'), 'connecting');
  });

  it('builds a solid-looking house: the back hidden, a solid line where roof meets wall', () => {
    const f = houseFrame(128, 10, 'once', true);
    const outline = f.lines.filter((l) => l.white === 0.1);
    assert.ok(outline.length < HOUSE_EDGE_COUNT, 'some edges are round the back');
    assert.ok(outline.length > HOUSE_EDGE_COUNT / 3, 'most of it shows');
    assert.ok(f.lines.some((l) => l.white === 0), 'the roof line');
  });

  it('builds the house in 3D, the map flat', () => {
    const depth = (t: number) => {
      const zs = houseFrame(128, t, 'loop', true).dots.map((d) => d.z);
      return Math.max(...zs) - Math.min(...zs);
    };
    assert.ok(depth(HOUSE) > 0.5, 'house has depth');
    assert.ok(depth(MAP) < 0.01, 'the map is flat');
  });

  it('keeps every shape inside the square', () => {
    assert.ok(inSquare(MAP) && inSquare(HOUSE));
  });

  it('draws the Thames through the map as one strong line', () => {
    const f = houseFrame(128, MAP, 'loop', true);
    assert.equal(f.lines.filter((l) => l.white === 0).length, 19, '20 dots along the river');
  });

  it('names real places on the map, and only there', () => {
    const names = (houseFrame(128, MAP, 'loop', true).labels ?? []).map((l) => l.text);
    assert.deepEqual(names, ['Hampstead', 'Islington', 'Ealing', 'Tooting', 'Peckham']);
    assert.equal((houseFrame(128, HOUSE, 'loop', true).labels ?? []).length, 0);
    assert.equal((houseFrame(128, 0.5, 'loop', true).labels ?? []).length, 0, 'not on the globe');
  });

  it('adds no running dot when motion is reduced', () => {
    assert.ok(houseFrame(128, 10, 'once', true).dots.every((d) => d.z !== 2));
    assert.ok(houseFrame(128, 10, 'once', false).dots.some((d) => d.z === 2));
  });
});
