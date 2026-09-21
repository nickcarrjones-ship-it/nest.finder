import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyNotAPlaceFilter, isNotAPlace, notAPlaceNames } from '../notAPlace';
import type { AreaCandidate } from '../prompt';

function candidate(neighbourhood: string, stations = [neighbourhood]): AreaCandidate {
  return {
    neighbourhood,
    stations,
    lat: 51.5,
    lng: -0.1,
    commuteMins: 30,
    walkBudgetMins: 10,
    pocketSize: stations.length,
  };
}

describe('stations that are a road, not a place', () => {
  it('drops the ones Nick named', () => {
    assert.ok(isNotAPlace(candidate('Haydons Road')));
    assert.ok(isNotAPlace(candidate('Rayners Lane')));
    assert.ok(isNotAPlace(candidate('Blackhorse Road')));
  });

  it('keeps the road-named ones a Londoner would actually say', () => {
    // The whole reason this is a list and not a rule: "ends in Road" would
    // take these too, and all of them are real answers.
    for (const name of ['Holloway Road', 'Old Street', 'Turnpike Lane', 'Goldhawk Road', 'Gloucester Road']) {
      assert.ok(!isNotAPlace(candidate(name)), `${name} should survive`);
    }
  });

  it('judges the NAME, not the stations underneath it', () => {
    // A grouped candidate takes its ward name, so the objection — the name
    // — no longer applies and the area should come back.
    assert.ok(!isNotAPlace(candidate('Wimbledon', ['Wimbledon', 'Haydons Road'])));
  });

  it('removes them from a candidate list', () => {
    const out = applyNotAPlaceFilter([candidate('Haydons Road'), candidate('Balham')]);
    assert.deepEqual(out.map((c) => c.neighbourhood), ['Balham']);
  });

  it('hands back everything rather than nothing at all', () => {
    // Same safeguard as the commercial-core filter: this is the app's own
    // judgement, and an empty map reads as broken.
    const only = [candidate('Haydons Road')];
    assert.deepEqual(applyNotAPlaceFilter(only), only);
  });

  it('is the nine Nick struck, and no more', () => {
    assert.equal(notAPlaceNames().length, 9);
  });
});
