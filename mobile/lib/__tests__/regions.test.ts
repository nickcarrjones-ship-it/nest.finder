import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REGION_AREAS, MAX_REGION_PICKS, isRegionName, regionOptions, regionsInText } from '../regions';
import { resolveAreaName } from '../ranking/anchor';

describe('a part of town instead of a place (Max: "South East")', () => {
  it('hears a region however it is said', () => {
    assert.deepEqual(regionsInText('South East')?.keys, ['southEast']);
    assert.deepEqual(regionsInText('south-east london probably')?.keys, ['southEast']);
    assert.deepEqual(regionsInText('somewhere in the north west')?.keys, ['northWest']);
    assert.deepEqual(regionsInText('North London')?.keys, ['north']);
    assert.deepEqual(regionsInText('anywhere south of the river')?.keys, ['south']);
    assert.deepEqual(regionsInText('SE London')?.keys, ['southEast']);
    assert.deepEqual(regionsInText('the east end')?.keys, ['east']);
    assert.deepEqual(regionsInText('central london ideally')?.keys, ['central']);
    assert.deepEqual(regionsInText('south east or south west')?.keys, ['southEast', 'southWest']);
  });

  it('quotes their own words back', () => {
    assert.equal(regionsInText('South East')?.said, 'South East');
    assert.equal(regionsInText('somewhere south-east London')?.said, 'south-east London');
  });

  it('never mistakes a place name for a region', () => {
    for (const said of [
      'East Dulwich', 'West Hampstead and Clapham', 'South Kensington', 'North Greenwich',
      'East Finchley or West Norwood', 'Southfields', 'Westminster', 'I love Clapham Common',
    ]) {
      assert.equal(regionsInText(said), null, said);
    }
  });

  it('still asks when a region comes with a place', () => {
    assert.deepEqual(regionsInText('East Dulwich, or anywhere south east')?.keys, ['southEast']);
  });

  it('does not take where they are moving FROM as a region', () => {
    assert.equal(regionsInText("we're moving down from up north"), null);
    assert.equal(regionsInText('coming from the north'), null);
  });

  it('offers only places the app can actually match', () => {
    for (const [key, names] of Object.entries(REGION_AREAS)) {
      assert.ok(names.length >= 10, key);
      assert.equal(new Set(names).size, names.length, `${key} says a name twice`);
      for (const n of names) assert.ok(resolveAreaName(n), `${key}: ${n} resolves to nothing`);
    }
  });

  it('mixes two regions rather than listing one then the other', () => {
    const both = regionOptions(['southEast', 'southWest']);
    assert.equal(both[0], 'Peckham');
    assert.equal(both[1], 'Clapham Common');
    assert.ok(both.length <= 16);
    assert.equal(new Set(both).size, both.length);
  });

  it('lets them pick three', () => {
    assert.equal(MAX_REGION_PICKS, 3);
  });

  it('knows a region the model wrote down as if it were a place', () => {
    for (const n of ['South East London', 'south-east', 'North London', 'The East End', 'SE London', 'central London']) {
      assert.ok(isRegionName(n), n);
    }
    for (const n of ['East Dulwich', 'Peckham', 'West Hampstead', 'Southfields']) {
      assert.ok(!isRegionName(n), n);
    }
  });
});
