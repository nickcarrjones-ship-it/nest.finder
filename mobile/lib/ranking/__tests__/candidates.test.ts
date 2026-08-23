import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAreaCandidates, identityStationsOnly, type IdentityMap } from '../candidates';
import type { AreaBudget } from '../../walkBudget';

function budget(name: string, journey: number, walkBudget: number): AreaBudget {
  return {
    area: { name, lat: 0, lng: 0 },
    budget: walkBudget,
    limitedBy: 0,
    journeys: [journey],
  };
}

describe('computeAreaCandidates — grouping stations into real places', () => {
  it('several stations in one neighbourhood become one candidate', () => {
    const identities: IdentityMap = {
      'Clapham North': 'Clapham', 'Clapham High Street': 'Clapham', 'Clapham Common': 'Clapham',
    };
    const out = computeAreaCandidates([
      budget('Clapham North', 30, 10),
      budget('Clapham High Street', 32, 8),
      budget('Clapham Common', 28, 12),
    ], identities);
    assert.equal(out.length, 1);
    assert.equal(out[0].neighbourhood, 'Clapham');
    assert.equal(out[0].pocketSize, 3);
  });

  it('the grouped candidate uses the FASTEST station\'s commute time', () => {
    const identities: IdentityMap = { A: 'Place', B: 'Place' };
    const out = computeAreaCandidates([budget('A', 40, 5), budget('B', 25, 15)], identities);
    assert.equal(out[0].commuteMins, 25);
    assert.equal(out[0].walkBudgetMins, 15);
  });

  it('a station with no mapping keeps its own name rather than vanishing', () => {
    const out = computeAreaCandidates([budget('Mystery Station', 20, 10)], {});
    assert.equal(out[0].neighbourhood, 'Mystery Station');
  });

  it('lists every contributing station, for showing "3 stations here" later', () => {
    const identities: IdentityMap = { A: 'Place', B: 'Place' };
    const out = computeAreaCandidates([budget('A', 20, 10), budget('B', 22, 8)], identities);
    assert.deepEqual(out[0].stations.sort(), ['A', 'B']);
  });

  it('sorts candidates fastest commute first', () => {
    const out = computeAreaCandidates(
      [budget('Slow', 45, 3), budget('Fast', 20, 12)], {},
    );
    assert.deepEqual(out.map((c) => c.neighbourhood), ['Fast', 'Slow']);
  });
});

describe('identityStationsOnly — the placeholder before real neighbourhoods exist', () => {
  it('maps every station to itself', () => {
    const m = identityStationsOnly(['Brixton', 'Clapham North']);
    assert.equal(m['Brixton'], 'Brixton');
    assert.equal(m['Clapham North'], 'Clapham North');
  });
});
