import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_DOT_COUNT, HOUSE_EDGE_COUNT, HOUSE_LOOP_SECONDS, builtAt, houseFrame } from '../houseOrb';

describe('house orb', () => {
  it('starts as a globe with no house outline drawn', () => {
    const f = houseFrame(128, 0, 'once');
    assert.equal(f.dots.length, HOUSE_DOT_COUNT);
    assert.ok(f.lines.every((l) => l.white !== 0.1), 'no outline edges yet');
  });

  it('ends as a finished house with every outline edge drawn', () => {
    const f = houseFrame(128, 10, 'once', true);
    const outline = f.lines.filter((l) => l.white === 0.1);
    assert.equal(outline.length, HOUSE_EDGE_COUNT);
    // Inside the square, with the roof peak at the top.
    assert.ok(f.dots.every((d) => d.x >= 0 && d.x <= 128 && d.y >= 0 && d.y <= 128));
    assert.ok(Math.abs(Math.min(...f.dots.map((d) => d.y)) - 0.16 * 128) < 0.5);
  });

  it('stays built when shown once, and goes round again when looping', () => {
    assert.equal(builtAt(60, 'once'), 1);
    assert.equal(builtAt(0, 'loop'), 0);
    assert.equal(builtAt(HOUSE_LOOP_SECONDS + 0.1, 'loop'), 0);
    assert.equal(builtAt(3, 'loop'), 1);
  });

  it('adds no running dot when motion is reduced', () => {
    assert.equal(houseFrame(128, 10, 'once', true).dots.length, HOUSE_DOT_COUNT);
    assert.ok(houseFrame(128, 10, 'once', false).dots.length > HOUSE_DOT_COUNT);
  });
});
