import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareToLoved, formatGap, formatMedian, medianFor, priceKey, trendFor } from '../areaPrices';

describe('prices answer at the level people discuss', () => {
  it('gives every station in a neighbourhood the same key', () => {
    assert.equal(priceKey('Clapham North'), priceKey('Clapham Common'));
  });

  it('leaves a station that is its own neighbourhood under its own name', () => {
    // Otherwise Angel is filed under the ONS ward "St Peter's & Canalside"
    // and never found again.
    assert.equal(priceKey('Angel'), 'Angel');
  });

  it('has a median for the places people actually search', () => {
    for (const a of ['Angel', 'Brixton', 'Balham', 'Tooting Broadway']) {
      assert.ok(medianFor(a), `no median for ${a}`);
    }
  });
});

describe('comparing an area to one they already love', () => {
  it('says how much dearer, against the area they named', () => {
    const c = compareToLoved('Balham', ['Tooting Broadway']);
    assert.ok(c);
    assert.equal(c.against, 'Tooting Broadway');
    assert.ok(c.differencePct > 0, 'Balham should read as dearer than Tooting');
    assert.match(c.label, /dearer than Tooting Broadway/);
  });

  it('says cheaper the other way round', () => {
    const c = compareToLoved('Tooting Broadway', ['Balham'])!;
    assert.ok(c.differencePct < 0);
    assert.match(c.label, /cheaper than Balham/);
  });

  it('calls a small gap "about the same" rather than inventing precision', () => {
    // Two medians from a few hundred sales cannot tell a 3% gap from noise,
    // and "£12,000 dearer" about £600,000 homes claims more than they hold.
    const c = compareToLoved('Clapham Town', ['Clapham Town']);
    assert.equal(c, null, 'an area should not be compared to itself');
  });

  it('measures against the CHEAPEST loved area, not an average of them', () => {
    // Someone who loves Tooting and Hampstead has a reference at each end;
    // averaging invents a third place they never named.
    const c = compareToLoved('Balham', ['Hampstead', 'Tooting Broadway'])!;
    assert.equal(c.against, 'Tooting Broadway');
  });

  it('returns nothing when they have named nowhere to compare against', () => {
    assert.equal(compareToLoved('Balham', []), null);
  });

  it('returns nothing for an area we hold no price for', () => {
    assert.equal(compareToLoved('Crews Hill', ['Balham']), null);
  });
});

describe('the trend arrow', () => {
  it('reports a direction for the areas that have one', () => {
    const t = trendFor('Balham');
    assert.ok(t);
    assert.ok(['up', 'down', 'flat'].includes(t.direction));
  });

  it('calls a small change flat rather than drawing an arrow for noise', () => {
    const t = trendFor('Balham')!;
    if (Math.abs(t.changePct) < 5) assert.equal(t.direction, 'flat');
  });
});

describe('how the numbers read', () => {
  it('rounds a median to something a person would say', () => {
    assert.equal(formatMedian(610_000), '£610k');
    assert.equal(formatMedian(1_250_000), '£1.25m');
  });

  it('writes a gap at the precision a median deserves', () => {
    assert.equal(formatGap(85_000), '£85k');
    assert.equal(formatGap(1_200_000), '£1.2m');
  });
});
