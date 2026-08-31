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

describe('migrateProfile — cleaning a profile on the way in', () => {
  it('keeps the facts untouched', () => {
    const out = migrateProfile(webEra);
    assert.deepEqual(out.members, webEra.members, 'who lives there and where they work is still true');
    assert.equal(out.maxCommuteMins, 60);
    assert.equal(out.walkHomeKm, 1);
  });

  /**
   * It no longer drops the preference layer of an unversioned profile.
   *
   * That branch existed for web-era profiles and was removed on 2026-08-31,
   * once every stored profile had been migrated by hand and the web app
   * retired. It was doing far more harm than good: only this file ever SET
   * the version, and only on read, so a profile the mobile app created was
   * born unversioned and had every answer its owner gave deleted on the
   * next load.
   *
   * What survives is the per-value filtering, which is the part that
   * actually protects the ranking — a web-era value the engine cannot read
   * is still dropped, one field at a time, rather than the whole layer.
   */
  it('filters unreadable values instead of discarding everything', () => {
    const out = migrateProfile(webEra);
    // nightsOut: "occasional" is not in this build's vocabulary.
    assert.equal(out.lifestyle?.nightsOut, undefined);
    // streetVibe: "quiet" is, so it survives.
    assert.equal(out.lifestyle?.streetVibe, 'quiet');
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

describe('the preference tags that steer the search', () => {
  // They were dropped on every load because sanitiseLifestyle rebuilds the
  // lifestyle from an allow-list and they were not on it. Losing them
  // silently downgraded every anchored search to keyword fallback.
  it('survives a load', () => {
    const got = sanitiseLifestyle({ preferenceTags: ['quiet', 'period_property'] } as never);
    assert.deepEqual(got?.preferenceTags, ['quiet', 'period_property']);
  });

  it('drops a tag the engine does not know', () => {
    const got = sanitiseLifestyle({ preferenceTags: ['quiet', 'notarealtag'] } as never);
    assert.deepEqual(got?.preferenceTags, ['quiet']);
  });

  it('omits the field entirely when nothing survives', () => {
    const got = sanitiseLifestyle({ preferenceTags: ['notarealtag'], zone1Ok: false } as never);
    assert.equal(got?.preferenceTags, undefined);
    assert.equal(got?.zone1Ok, false);
  });
});

describe('a profile written by this build is never mistaken for a web one', () => {
  // The loop that deleted Nick's answers: mobile created a profile with no
  // schemaVersion, wrote it, and the next load classified it as web-era and
  // stripped its lifestyle and areaCards.
  it('keeps preferences once the version is stamped', () => {
    const stamped = migrateProfile({
      schemaVersion: PROFILE_SCHEMA_VERSION,
      members: [{ id: 'a', name: 'Nick', workId: 'cw', workLabel: 'Canary Wharf', offWalk: 5 }],
      areaCards: { 'Canary Wharf': 'hate', 'Clapham Common': 'love' },
      lifestyle: { zone1Ok: false },
    });
    assert.deepEqual(stamped.areaCards, { 'Canary Wharf': 'hate', 'Clapham Common': 'love' });
    assert.equal(stamped.lifestyle?.zone1Ok, false);
  });

  it('stamps the version on anything that arrives without one', () => {
    const out = migrateProfile({
      members: [{ id: 'a', name: 'You', workId: 'bps', workLabel: 'Battersea', offWalk: 5 }],
    });
    assert.equal(out.schemaVersion, PROFILE_SCHEMA_VERSION);
  });
});
