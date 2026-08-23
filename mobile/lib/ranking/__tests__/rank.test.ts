import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeShortlist } from '../rank';
import { rankingFingerprint } from '../cache';
import type { AreaCandidate } from '../prompt';
import type { Profile } from '../../types';

const profile: Profile = {
  maxCommuteMins: 50,
  members: [{ id: 'a', name: 'A', workId: 'cw', workLabel: 'Canary Wharf', offWalk: 5 }],
};

function candidates(n: number): AreaCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    neighbourhood: `Area${i}`, stations: [`Area${i}`],
    commuteMins: 30 + i, walkBudgetMins: 10, pocketSize: 3,
  }));
}

describe('computeShortlist — batching and resilience', () => {
  it('splits into multiple calls once over the batch size', async () => {
    let calls = 0;
    await computeShortlist(candidates(120), profile, undefined, undefined,
      async () => { calls++; return '{"ranked":[]}'; }, null);
    assert.equal(calls, 3); // 50 + 50 + 20
  });

  it('one bad batch does not lose the others', async () => {
    let call = 0;
    const result = await computeShortlist(candidates(100), profile, undefined, undefined,
      async () => {
        call++;
        if (call === 1) throw new Error('network blip');
        return '{"ranked":[{"neighbourhood":"Area60","score":8,"reason":"fine","confidence":"high"}]}';
      }, null);
    assert.equal(result.batchesFailed, 1);
    assert.equal(result.ranked.length, 1);
  });

  it('merges batches sorted by score, highest first', async () => {
    let call = 0;
    const result = await computeShortlist(candidates(60), profile, undefined, undefined,
      async () => {
        call++;
        const score = call === 1 ? 5 : 9;
        return `{"ranked":[{"neighbourhood":"X${call}","score":${score},"reason":"r","confidence":"high"}]}`;
      }, null);
    assert.equal(result.ranked[0].score, 9);
  });

  it('serves from cache without calling the model at all', async () => {
    let calls = 0;
    const c = candidates(5);
    const fp = rankingFingerprint(profile, undefined, undefined, c.map((x) => x.neighbourhood));
    const result = await computeShortlist(c, profile, undefined, undefined,
      async () => { calls++; return '{"ranked":[]}'; },
      { fingerprint: fp, ranked: [{ neighbourhood: 'Cached', score: 7, reason: 'r', confidence: 'high' }], computedAt: 'x' });
    assert.equal(calls, 0);
    assert.equal(result.fromCache, true);
    assert.equal(result.ranked[0].neighbourhood, 'Cached');
  });

  it('a stale cache (different reachable set) is not used', async () => {
    let calls = 0;
    await computeShortlist(candidates(5), profile, undefined, undefined,
      async () => { calls++; return '{"ranked":[]}'; },
      { fingerprint: 'stale-fingerprint', ranked: [], computedAt: 'x' });
    assert.equal(calls, 1);
  });
});

describe('rankingFingerprint — what should trigger a re-rank', () => {
  it('is identical regardless of area order', () => {
    const a = rankingFingerprint(profile, undefined, undefined, ['Brixton', 'Peckham']);
    const b = rankingFingerprint(profile, undefined, undefined, ['Peckham', 'Brixton']);
    assert.equal(a, b);
  });

  it('changes when the reachable set changes', () => {
    const a = rankingFingerprint(profile, undefined, undefined, ['Brixton']);
    const b = rankingFingerprint(profile, undefined, undefined, ['Brixton', 'Peckham']);
    assert.notEqual(a, b);
  });

  it('changes when lifestyle preferences change', () => {
    const a = rankingFingerprint(profile, { greenSpace: 'essential' }, undefined, ['Brixton']);
    const b = rankingFingerprint(profile, { greenSpace: 'unimportant' }, undefined, ['Brixton']);
    assert.notEqual(a, b);
  });

  it('changes when a work walk changes, since that shifts everyone\'s budget', () => {
    const p2: Profile = { ...profile, members: [{ ...profile.members[0], offWalk: 20 }] };
    assert.notEqual(
      rankingFingerprint(profile, undefined, undefined, ['Brixton']),
      rankingFingerprint(p2, undefined, undefined, ['Brixton']),
    );
  });
});
