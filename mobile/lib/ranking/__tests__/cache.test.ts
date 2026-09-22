import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankingFingerprint, isCacheValid } from '../cache';
import type { Lifestyle, Profile } from '../../types';

const PROFILE: Profile = {
  members: [{ id: 'm0', name: 'Nick', workId: 'holborn', workLabel: 'Holborn', offWalk: 5 }],
  maxCommuteMins: 40,
};

describe('the ranking cache key', () => {
  // Nick, 2026-09-22: "I've loaded the app up for a second time today and
  // the Maloca agent is cooking. If the agent's already run, why does it
  // need to cook?" The key was JSON.stringify, which writes keys in
  // INSERTION order — so a lifestyle built during a conversation and the
  // same lifestyle loaded back through sanitiseLifestyle (which rebuilds
  // it in a fixed order of its own) produced two different strings for
  // identical preferences, and every cold start paid for a re-rank.
  it('does not depend on the order a lifestyle was built in', () => {
    const asExtracted = { nightsOut: 'regular', greenSpace: 'essential' } as Lifestyle;
    const asReloaded = { greenSpace: 'essential', nightsOut: 'regular' } as Lifestyle;
    assert.equal(
      rankingFingerprint(PROFILE, asExtracted, {}, ['Balham']),
      rankingFingerprint(PROFILE, asReloaded, {}, ['Balham']),
    );
  });

  it('does not depend on the order areas were named in', () => {
    assert.equal(
      rankingFingerprint(PROFILE, undefined, { Balham: 'love', Tooting: 'hate' }, ['Balham']),
      rankingFingerprint(PROFILE, undefined, { Tooting: 'hate', Balham: 'love' }, ['Balham']),
    );
  });

  it('does not depend on the order the reachable areas came out in', () => {
    assert.equal(
      rankingFingerprint(PROFILE, undefined, {}, ['Balham', 'Tooting Bec']),
      rankingFingerprint(PROFILE, undefined, {}, ['Tooting Bec', 'Balham']),
    );
  });

  it('treats a missing field and an explicitly undefined one as the same', () => {
    // JSON.stringify drops undefined keys, so the stable version must too
    // or the two would disagree about identical preferences.
    assert.equal(
      rankingFingerprint(PROFILE, { greenSpace: 'essential' } as Lifestyle, {}, ['Balham']),
      rankingFingerprint(
        PROFILE,
        { greenSpace: 'essential', zone1Ok: undefined } as Lifestyle,
        {},
        ['Balham'],
      ),
    );
  });

  it('still changes when the preferences actually change', () => {
    const a = rankingFingerprint(PROFILE, { greenSpace: 'essential' } as Lifestyle, {}, ['Balham']);
    const b = rankingFingerprint(PROFILE, { greenSpace: 'unimportant' } as Lifestyle, {}, ['Balham']);
    assert.notEqual(a, b);
  });

  it('still changes when the reachable set changes', () => {
    const a = rankingFingerprint(PROFILE, undefined, {}, ['Balham']);
    const b = rankingFingerprint(PROFILE, undefined, {}, ['Balham', 'Tooting Bec']);
    assert.notEqual(a, b);
  });

  it('still changes when the commute limit changes', () => {
    const slower: Profile = { ...PROFILE, maxCommuteMins: 60 };
    assert.notEqual(
      rankingFingerprint(PROFILE, undefined, {}, ['Balham']),
      rankingFingerprint(slower, undefined, {}, ['Balham']),
    );
  });

  it('matches a cache entry written with the same preferences', () => {
    const fp = rankingFingerprint(PROFILE, undefined, {}, ['Balham']);
    assert.ok(isCacheValid({ fingerprint: fp, ranked: [], computedAt: '', evidence: {}, anchors: [] }, fp));
    assert.ok(!isCacheValid(null, fp));
  });
});
