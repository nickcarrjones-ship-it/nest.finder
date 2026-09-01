import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { placeLabel, nearestTo, areaCoords, distanceKm } from '../ranking/placeLabels';
import { normaliseName } from '../ranking/normaliseName';
import { allAreaNames } from '../similarity/features';

describe('place labels — where the map writes a name', () => {
  it('finds the point the basemap draws a name from', () => {
    const clapham = placeLabel('Clapham');
    assert.ok(clapham, 'Clapham is labelled');
    // Clapham Old Town, which is where London writes it.
    assert.ok(Math.abs(clapham.lat - 51.4614) < 0.01);
    assert.ok(Math.abs(clapham.lng - -0.1386) < 0.01);
  });

  it('normalises the way the resolver does', () => {
    // These two must agree exactly or a name finds a label in one place and
    // not the other, which shows up as a pin in the wrong place rather than
    // as an error — the reason normaliseName is its own module.
    assert.deepEqual(placeLabel('  CLAPHAM  '), placeLabel('Clapham'));
    assert.equal(normaliseName("St John's Wood"), 'st johns wood');
  });

  it('holds nothing for somewhere outside London', () => {
    assert.equal(placeLabel('Manchester'), null);
    assert.equal(placeLabel('Amsterdam'), null);
  });

  it('is a whole-name lookup, never a fuzzy one', () => {
    // Deliberately strict: the resolver layers its own string matching on
    // top, and a label that matched loosely would quietly outrank it.
    assert.equal(placeLabel('Clapham Comm'), null);
  });

  describe('nearestTo', () => {
    it('picks the closest of the names it is given', () => {
      const clapham = placeLabel('Clapham')!;
      const near = nearestTo(clapham, ['Clapham Common', 'Clapham South', 'Brixton']);
      assert.equal(near?.name, 'Clapham Common');
      assert.ok(near!.km < 0.2, 'and reports how close');
    });

    it('returns null when it can place none of them', () => {
      const clapham = placeLabel('Clapham')!;
      assert.equal(nearestTo(clapham, ['Nowhere At All']), null);
    });

    it('skips names it cannot place rather than dropping the lot', () => {
      const clapham = placeLabel('Clapham')!;
      assert.equal(nearestTo(clapham, ['Nowhere At All', 'Brixton'])?.name, 'Brixton');
    });
  });

  it('only holds labels we could actually anchor', () => {
    // The build drops anything further than 2.5km from a station, because
    // the extract reaches ~20km past the last place we have journey times
    // for. A label out there would resolve to whatever was least far away,
    // which is a confident wrong answer rather than an honest miss.
    const known = allAreaNames();
    for (const name of ['Muswell Hill', 'Crouch End', 'Telegraph Hill', 'Wandsworth']) {
      const label = placeLabel(name);
      assert.ok(label, `${name} is labelled`);
      const near = nearestTo(label, known);
      assert.ok(near && near.km <= 2.5, `${name} is within reach of a station`);
    }
  });

  it('places areas from the same table the region is drawn from', () => {
    const at = areaCoords('Brixton');
    assert.ok(at);
    assert.ok(distanceKm(at, placeLabel('Brixton')!) < 0.2, 'and they agree');
    assert.equal(areaCoords('Nowhere At All'), null);
  });
});
