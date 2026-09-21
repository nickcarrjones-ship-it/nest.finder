import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_SCHEMA_VERSION,
  migrateProfile,
  sanitiseLifestyle,
  sanitisePropertyCriteria,
  safeAreaName,
} from '../profileMigration';
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

describe('property criteria surviving the round trip through Firebase', () => {
  const full = {
    channel: 'buy' as const,
    minPrice: 300_000, maxPrice: 750_000,
    minBeds: 2, maxBeds: 3,
    minBaths: 1, maxBaths: 2,
    tenures: ['freehold' as const], features: ['garden' as const],
    setAt: 1_700_000_000_000,
  };

  it('puts back the arrays Firebase drops when they are empty', () => {
    // The actual crash (Nick, 2026-09-07): the Realtime Database does not
    // store empty arrays, so criteria saved with no tenure and no must-have
    // came back with both keys missing, and the sheet — which is mounted
    // inside every area card — died on `.includes` of undefined the next
    // time an area card was opened.
    const fromFirebase = { ...full } as Record<string, unknown>;
    delete fromFirebase.tenures;
    delete fromFirebase.features;

    const out = sanitisePropertyCriteria(fromFirebase as never)!;
    assert.deepEqual(out.tenures, []);
    assert.deepEqual(out.features, []);
  });

  it('keeps what was actually chosen', () => {
    const out = sanitisePropertyCriteria(full)!;
    assert.deepEqual(out.tenures, ['freehold']);
    assert.deepEqual(out.features, ['garden']);
    assert.equal(out.maxPrice, 750_000);
  });

  it('drops values this build would not understand', () => {
    const out = sanitisePropertyCriteria({
      ...full, tenures: ['freehold', 'commonhold'], features: ['garden', 'helipad'],
    } as never)!;
    assert.deepEqual(out.tenures, ['freehold']);
    assert.deepEqual(out.features, ['garden']);
  });

  it('refuses criteria with no channel — there is no price scale without one', () => {
    const { channel, ...noChannel } = full;
    assert.equal(sanitisePropertyCriteria(noChannel as never), undefined);
    assert.equal(sanitisePropertyCriteria(undefined), undefined);
  });

  it('unpicks a min above its max, which would match nothing', () => {
    const out = sanitisePropertyCriteria({ ...full, minPrice: 900_000, maxPrice: 400_000 })!;
    assert.equal(out.minPrice, 400_000);
    assert.equal(out.maxPrice, 900_000);
  });

  it('survives garbage in the numeric fields', () => {
    const out = sanitisePropertyCriteria({
      ...full, minBeds: null, maxBeds: 'three', minPrice: NaN,
    } as never)!;
    assert.ok(Number.isFinite(out.minBeds));
    assert.ok(Number.isFinite(out.maxBeds));
    assert.ok(Number.isFinite(out.minPrice));
  });

  it('carries criteria through a whole profile migration', () => {
    const p = migrateProfile({ members: [], propertyCriteria: full } as never);
    assert.deepEqual(p.propertyCriteria?.tenures, ['freehold']);
  });
});

describe('area names have to survive being a database key', () => {
  // The Realtime Database forbids . $ # [ ] / and control characters in a
  // key. areaCards is keyed by place name, so one of these does not store
  // oddly — it throws on write, and syncProfileToFirebase swallows that by
  // design, so the profile silently stops saving for good.
  it('strips every character the database refuses', () => {
    assert.equal(safeAreaName('St. Albans'), 'St Albans');
    assert.equal(safeAreaName('Kings Cross St. Pancras'), 'Kings Cross St Pancras');
    assert.equal(safeAreaName('anywhere in east London.'), 'anywhere in east London');
    assert.equal(safeAreaName('Hammersmith/Fulham'), 'Hammersmith Fulham');
    assert.equal(safeAreaName('a$b#c[d]e'), 'a b c d e');
  });

  it('leaves a normal London name exactly alone', () => {
    for (const name of ["Shepherd's Bush", 'Harrow & Wealdstone', 'Canary Wharf', 'Earl’s Court']) {
      assert.equal(safeAreaName(name), name);
    }
  });

  it('collapses the whitespace it creates, and trims', () => {
    assert.equal(safeAreaName('  Clapham . Common  '), 'Clapham Common');
  });

  it('gives back nothing for a name that was only punctuation', () => {
    assert.equal(safeAreaName('...'), '');
    assert.equal(safeAreaName('   '), '');
  });
});
