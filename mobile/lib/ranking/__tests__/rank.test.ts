import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BATCH_SIZE, computeShortlist } from '../rank';
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
    lat: 51.5 + i * 0.001, lng: -0.1 + i * 0.001,
    commuteMins: 30 + i, walkBudgetMins: 10, pocketSize: 3,
  }));
}

describe('computeShortlist — batching and resilience', () => {
  it('splits into multiple calls once over the batch size', async () => {
    let calls = 0;
    // Derived from BATCH_SIZE rather than hardcoded: this is a test of
    // splitting, not of whatever the batch size happens to be today.
    await computeShortlist(candidates(BATCH_SIZE * 2 + 20), profile, undefined, undefined,
      async () => { calls++; return '{"ranked":[]}'; }, null);
    assert.equal(calls, 3);
  });

  it('one bad batch does not lose the others', async () => {
    let call = 0;
    const result = await computeShortlist(candidates(BATCH_SIZE * 2), profile, undefined, undefined,
      async () => {
        call++;
        if (call === 1) throw new Error('network blip');
        // Must name an area from THIS batch: the second batch holds
        // Area120 onwards, and parse.ts now drops anything that was not
        // sent, so a name from batch one would be correctly rejected.
        return `{"ranked":[{"neighbourhood":"Area${BATCH_SIZE}","score":8,"reason":"fine","confidence":"high"}]}`;
      }, null);
    assert.equal(result.batchesFailed, 1);
    assert.equal(result.ranked.length, 1);
  });

  it('merges batches sorted by score, highest first', async () => {
    let call = 0;
    const result = await computeShortlist(candidates(BATCH_SIZE + 10), profile, undefined, undefined,
      async () => {
        call++;
        // One real area per batch — batch one starts at Area0, batch two at
        // Area{BATCH_SIZE} — so both survive validation and the merge is
        // genuinely tested rather than the names being waved through.
        const score = call === 1 ? 5 : 9;
        const name = call === 1 ? 'Area0' : `Area${BATCH_SIZE}`;
        return `{"ranked":[{"neighbourhood":"${name}","score":${score},"reason":"r","confidence":"high"}]}`;
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

describe('a model can only name areas we actually asked about', () => {
  it('drops an area that was never in the batch', async () => {
    // Found by an end-to-end simulation (2026-08-28): nothing checked the
    // model's answer against what was sent, so an invented neighbourhood
    // would have become a pin on the map.
    const result = await computeShortlist(candidates(3), profile, undefined, undefined,
      async () => JSON.stringify({ ranked: [
        { neighbourhood: 'Area1', score: 9, reason: 'real', confidence: 'high' },
        { neighbourhood: 'Atlantis', score: 10, reason: 'invented', confidence: 'high' },
      ] }), null);
    const names = result.ranked.map((r) => r.neighbourhood);
    assert.deepEqual(names, ['Area1'], 'the invented one is gone, the real one stays');
  });

  it('ignores a preference bullet mistaken for a place', async () => {
    // The prompt lists preferences as "- " bullets directly above the "- "
    // list of areas. A simulated model read one as an area name.
    const result = await computeShortlist(candidates(3), profile, undefined, undefined,
      async () => JSON.stringify({ ranked: [
        { neighbourhood: 'prefers a buzzy high street', score: 9, reason: 'x', confidence: 'high' },
      ] }), null);
    assert.equal(result.ranked.length, 0);
  });

  it('accepts our spelling even when the model changes the punctuation', async () => {
    const c = [{ neighbourhood: "King's Cross St Pancras", stations: ['a'], lat: 51.5, lng: -0.1,
                 commuteMins: 10, walkBudgetMins: 10, pocketSize: 2 }];
    const result = await computeShortlist(c, profile, undefined, undefined,
      async () => JSON.stringify({ ranked: [
        { neighbourhood: 'kings cross st pancras', score: 8, reason: 'x', confidence: 'high' },
      ] }), null);
    assert.equal(result.ranked[0]?.neighbourhood, "King's Cross St Pancras",
      'restored to our spelling so downstream lookups by name still hit');
  });
});

describe('someone who names nowhere at all', () => {
  const c = candidates(3);

  it('falls back to the model rather than failing', async () => {
    // "I honestly do not know" is a real answer. There is nothing to be
    // similar TO, so every reachable area goes to the model.
    let sent = 0;
    const result = await computeShortlist(c, profile, undefined, undefined,
      async (_s, user) => { sent = user.match(/^- .*commute/gm)?.length ?? 0;
        return JSON.stringify({ ranked: [{ neighbourhood: 'Area0', score: 7, reason: 'x', confidence: 'high' }] }); },
      null);
    assert.equal(result.anchor, null, 'no anchor, so the fallback path');
    assert.equal(sent, c.length, 'and every area is considered, not a shortlist');
    assert.equal(result.ranked.length, 1);
  });

  it('still tells the model what they said they want', async () => {
    // The gap this guards: with no anchor the MODEL is the ranker, and it
    // was never shown the answer to "what are you hoping for?" — collected,
    // stored, and dropped exactly where it mattered most.
    let prompt = '';
    await computeShortlist(c, profile,
      { anchorReason: 'somewhere calm with space for the kids', preferenceTags: ['family_area'] },
      undefined,
      async (_s, user) => { prompt = user; return '{"ranked":[]}'; }, null);
    assert.match(prompt, /space for the kids/, 'their own words reach the model');
    assert.match(prompt, /family area/, 'and so do the priorities');
  });
});
