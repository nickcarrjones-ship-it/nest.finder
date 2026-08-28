import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_SCHEMA_VERSION, migrateProfile, sanitiseLifestyle } from '../profileMigration';
import type { Profile } from '../types';

/** A real profile as the web app wrote it — taken from live Firebase data. */
const webEra = {
  members: [{ id: 'm0', name: 'Nick', workId: 'canary_wharf', workLabel: 'Canary Wharf', offWalk: 5, gym: 'thirdspace', email: 'n@example.com' }],
  maxCommuteMins: 60,
  sharedCommuteLimit: true,
  walkHomeKm: 1,
  lifestyle: {
    greenSpace: 'nice',
    streetVibe: 'quiet',
    nightsOut: 'occasional',
    schoolsPriority: 'notrelevant',
    safetyPriority: 'veryimportant',
    dealbreakers: ['nightlife'],
    freeText: 'quiet street, close to good coffee',
  },
  areaCards: { Bermondsey: 'hate', Clapham: 'love' },
  // Web-only fields mobile never reads but must not destroy.
  maxPrice: 750000,
  beds: 2,
  hasRunInitialAi: true,
} as unknown as Profile;

describe('migrateProfile — the web app wrote a model this build outgrew', () => {
  it('keeps the facts and drops the preference layer', () => {
    const out = migrateProfile(webEra);
    assert.deepEqual(out.members, webEra.members, 'who lives there and where they work is still true');
    assert.equal(out.maxCommuteMins, 60);
    assert.equal(out.walkHomeKm, 1);
    assert.equal(out.lifestyle, undefined, 'half of it was silently ignored');
    assert.equal(out.areaCards, undefined, 'and it said Bermondsey was a hate long after he said otherwise');
  });

  it('preserves web-only fields it does not understand', () => {
    // syncProfileToFirebase writes the whole object back, so dropping these
    // would delete them from the account of anyone still using the web app.
    const out = migrateProfile(webEra) as unknown as Record<string, unknown>;
    assert.equal(out.maxPrice, 750000);
    assert.equal(out.beds, 2);
    assert.equal(out.hasRunInitialAi, true);
  });

  it('stamps the version so it only ever happens once', () => {
    const out = migrateProfile(webEra);
    assert.equal(out.schemaVersion, PROFILE_SCHEMA_VERSION);
  });

  it('leaves an already-migrated profile alone', () => {
    const current: Profile = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      members: webEra.members,
      maxCommuteMins: 45,
      lifestyle: { streetVibe: 'quiet', zone1Ok: false, riverSide: 'south' },
      areaCards: { Nunhead: 'love' },
    };
    const out = migrateProfile(current);
    assert.deepEqual(out.lifestyle, current.lifestyle);
    assert.deepEqual(out.areaCards, current.areaCards);
    assert.equal(out.maxCommuteMins, 45);
  });

  it('cleans values a current profile should never have held', () => {
    const odd: Profile = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      members: webEra.members,
      lifestyle: { streetVibe: 'quiet', nightsOut: 'occasional' as never },
      areaCards: { Peckham: 'love', Deptford: '' as never, '': 'hate' as never },
    };
    const out = migrateProfile(odd);
    assert.deepEqual(out.lifestyle, { streetVibe: 'quiet' });
    assert.deepEqual(out.areaCards, { Peckham: 'love' });
  });
});

describe('sanitiseLifestyle — every value the web app could write', () => {
  it('drops the whole legacy vocabulary', () => {
    // Recovered from the deleted setup.html; none of these mean anything here.
    const legacyOnly = {
      greenSpace: 'dontmind',
      nightsOut: 'occasional',
      schoolsPriority: 'notrelevant',
      safetyPriority: 'somewhat',
    } as never;
    assert.equal(sanitiseLifestyle(legacyOnly), undefined);
  });

  it('keeps streetVibe, the one field whose vocabulary matched', () => {
    assert.deepEqual(sanitiseLifestyle({ streetVibe: 'village' }), { streetVibe: 'village' });
  });

  it('keeps the fields this build added', () => {
    const out = sanitiseLifestyle({ zone1Ok: false, riverSide: 'south', socialCircle: 'E' });
    assert.deepEqual(out, { zone1Ok: false, riverSide: 'south', socialCircle: 'E' });
  });

  it('returns undefined rather than an empty object, so nothing reads as "answered"', () => {
    assert.equal(sanitiseLifestyle({}), undefined);
    assert.equal(sanitiseLifestyle(undefined), undefined);
    assert.equal(sanitiseLifestyle({ dealbreakers: [], freeText: '  ' }), undefined);
  });
});

describe('anchorReason survives a profile load', () => {
  it('is kept, because stripping it silently discards question two', () => {
    // The bug this guards: anchorReason was parsed from the conversation,
    // present in the schema and read by the ranking, but nothing stored it
    // and the sanitiser would have stripped it anyway. So "what is it about
    // there that you like?" was asked, answered and thrown away.
    const out = sanitiseLifestyle({
      streetVibe: 'buzzy',
      anchorReason: '  the Common and the coffee shops  ',
    });
    assert.equal(out?.anchorReason, 'the Common and the coffee shops');
  });

  it('ignores an empty one rather than storing a blank', () => {
    assert.equal(sanitiseLifestyle({ anchorReason: '   ' }), undefined);
  });
});
