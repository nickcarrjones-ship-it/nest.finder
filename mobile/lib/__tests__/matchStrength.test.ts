import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchStrength, STRENGTH_LABEL } from '../ranking/matchStrength';

describe('match strength — a word instead of a percentage', () => {
  it('bands a score', () => {
    assert.equal(matchStrength(0.71), 'strong');
    assert.equal(matchStrength(0.65), 'strong');
    assert.equal(matchStrength(0.6), 'potential');
    assert.equal(matchStrength(0.55), 'potential');
    assert.equal(matchStrength(0.4), 'loose');
  });

  it('calls a real run’s scores what they are', () => {
    // The spread from an actual profile: everything here has already
    // survived the commute filter and the similarity ranking, so 0.60 is a
    // good match in this population rather than a mediocre one. Shown as
    // "60%" it read like a failing grade, which is the whole reason the
    // percentage came off (Nick, 2026-09-01).
    const real = [0.71, 0.65, 0.62, 0.6, 0.6, 0.59, 0.59, 0.58, 0.58, 0.57];
    const bands = real.map(matchStrength);
    assert.equal(bands.filter((b) => b === 'strong').length, 2);
    assert.equal(bands.filter((b) => b === 'potential').length, 8);
    assert.equal(bands.filter((b) => b === 'loose').length, 0, 'nothing on a real list reads as weak');
  });

  it('has a label for every band', () => {
    for (const band of ['strong', 'potential', 'loose'] as const) {
      assert.ok(STRENGTH_LABEL[band].length > 0);
    }
  });
});
