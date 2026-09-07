import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiverFilter, isOnSide, riverSideOf } from '../river';
import type { AreaCandidate } from '../prompt';

const area = (neighbourhood: string, stations: string[]): AreaCandidate => ({
  neighbourhood,
  stations,
  lat: 51.5,
  lng: -0.1,
  commuteMins: 30,
  walkBudgetMins: 10,
  pocketSize: 1,
});

describe('which bank an area is on', () => {
  // Places whose side is not a matter of opinion. If the generated data ever
  // drifts, these are the canaries.
  it('knows the obvious ones', () => {
    assert.equal(riverSideOf('Greenwich'), 'south');
    assert.equal(riverSideOf('Camden Town'), 'north');
    assert.equal(riverSideOf('Brixton'), 'south');
    assert.equal(riverSideOf('Islington'), undefined); // not a station in our data
  });

  it('gets the Isle of Dogs right, which a latitude cutoff cannot', () => {
    // Canary Wharf is NORTH of the river despite sitting further south than
    // much of the south bank. This is the case that rules out comparing
    // latitudes and forces real geometry.
    assert.equal(riverSideOf('Canary Wharf'), 'north');
    assert.equal(riverSideOf('Greenwich'), 'south');
  });

  it('gets the Richmond loop right, where the river runs north-south', () => {
    assert.equal(riverSideOf('Richmond'), 'south');
    assert.equal(riverSideOf('Kew Gardens'), 'south');
    // North bank of the same stretch — genuinely Middlesex side.
    assert.equal(riverSideOf('Isleworth'), 'north');
    assert.equal(riverSideOf('Brentford'), 'north');
    // And the ones a Londoner calls south whatever the geometry says.
    assert.equal(riverSideOf('Twickenham'), 'south');
    assert.equal(riverSideOf('Teddington'), 'south');
  });
});

describe('filtering to the side they asked for', () => {
  const north = area('Camden Town', ['Camden Town']);
  const south = area('Brixton', ['Brixton']);
  const all = [north, south];

  it('drops the far bank when they said south', () => {
    assert.deepEqual(applyRiverFilter(all, { riverSide: 'south' }), [south]);
  });

  it('drops the far bank when they said north', () => {
    assert.deepEqual(applyRiverFilter(all, { riverSide: 'north' }), [north]);
  });

  it('filters nothing when they are happy either side', () => {
    assert.deepEqual(applyRiverFilter(all, { riverSide: 'either' }), all);
  });

  it('filters nothing when the question was never asked', () => {
    assert.deepEqual(applyRiverFilter(all, undefined), all);
    assert.deepEqual(applyRiverFilter(all, {}), all);
    assert.deepEqual(applyRiverFilter(all, { streetVibe: 'quiet' }), all);
  });

  it('keeps a neighbourhood that straddles the river', () => {
    // Somewhere with stations on both banks genuinely offers a home on the
    // side they wanted, so it survives either answer.
    const straddles = area('Riverside', ['Canary Wharf', 'Greenwich']);
    assert.deepEqual(applyRiverFilter([straddles], { riverSide: 'south' }), [straddles]);
    assert.deepEqual(applyRiverFilter([straddles], { riverSide: 'north' }), [straddles]);
  });

  it('keeps an area we hold no river data for, rather than guessing', () => {
    const unknown = area('Nowhere', ['Not A Station']);
    assert.deepEqual(applyRiverFilter([unknown], { riverSide: 'south' }), [unknown]);
    assert.equal(isOnSide(unknown, 'south'), true);
  });

  it('hands back everything rather than nothing when the commute only reaches the far bank', () => {
    // A respected preference that empties the map reads as a broken app.
    assert.deepEqual(applyRiverFilter([north], { riverSide: 'south' }), [north]);
  });
});
