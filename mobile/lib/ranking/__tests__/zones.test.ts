import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyZone1Filter, isZone1 } from '../zones';
import type { AreaCandidate } from '../prompt';

function candidate(neighbourhood: string, stations: string[]): AreaCandidate {
  return { neighbourhood, stations, lat: 51.5, lng: -0.1, commuteMins: 30, walkBudgetMins: 8, pocketSize: 3 };
}

const central = candidate('City of London', ['Barbican', 'Moorgate']);
const outer = candidate('Nunhead', ['Nunhead']);
const straddling = candidate('Bermondsey & Borough', ['Bermondsey', 'Borough']);

describe('Zone 1 filtering', () => {
  it('recognises a neighbourhood by any of its stations', () => {
    assert.equal(isZone1(central), true);
    assert.equal(isZone1(outer), false);
    // Borough is Zone 1 even though Bermondsey is not — someone who ruled
    // Zone 1 out should not be sent here.
    assert.equal(isZone1(straddling), true);
  });

  it('drops Zone 1 areas only when they have said no', () => {
    const all = [central, outer, straddling];
    assert.deepEqual(applyZone1Filter(all, { zone1Ok: false }), [outer]);
    assert.deepEqual(applyZone1Filter(all, { zone1Ok: true }), all);
  });

  it('filters nothing when the question was never answered', () => {
    const all = [central, outer];
    assert.deepEqual(applyZone1Filter(all, undefined), all);
    assert.deepEqual(applyZone1Filter(all, {}), all);
    assert.deepEqual(applyZone1Filter(all, { streetVibe: 'quiet' }), all);
  });

  it('keeps everything rather than returning an empty map', () => {
    // A commute that only reaches central London: honouring the filter would
    // leave no picks at all, which reads as broken rather than respectful.
    const onlyCentral = [central, straddling];
    assert.deepEqual(applyZone1Filter(onlyCentral, { zone1Ok: false }), onlyCentral);
  });
});
