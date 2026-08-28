import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHOR_SHORTLIST,
  findAnchor,
  resolveAreaName,
  shortlistByAnchor,
} from '../ranking/anchor';
import type { AreaCandidate } from '../ranking/prompt';

describe('resolveAreaName — what people say vs what we measure', () => {
  const known = ['Clapham Common', 'Clapham South', 'Clapham High Street', 'Kew Gardens', 'Angel'];

  it('matches an exact name', () => {
    assert.equal(resolveAreaName('Angel', known), 'Angel');
  });

  it('is case and punctuation insensitive', () => {
    assert.equal(resolveAreaName('  clapham   SOUTH ', known), 'Clapham South');
  });

  it('resolves what someone actually says to what we hold', () => {
    // The whole reason this exists: the Agent hears "Clapham", but every
    // dataset is keyed by station. Without this the anchor silently fails
    // and everyone drops to the expensive model-led path unnoticed.
    const resolved = resolveAreaName('Clapham', known);
    assert.ok(resolved?.startsWith('Clapham'), 'lands somewhere in Clapham');
  });

  it('picks the most prominent when a name is ambiguous', () => {
    // "Clapham" matches Common, South and High Street. Preferring the
    // shortest NAME picked Clapham South — the quietest of the three, and an
    // arbitrary answer. Prominence (how much is around it) picks the busy
    // bit, which is what someone naming a whole district means.
    assert.equal(resolveAreaName('Clapham', known), 'Clapham High Street');
  });

  it('will not match a fragment of a word', () => {
    assert.equal(resolveAreaName('Kew', ['Kewstoke Road', 'Kew Gardens']), 'Kew Gardens');
    assert.equal(resolveAreaName('Ang', known), null, 'a prefix of a word is not a match');
  });

  it('returns null rather than guessing', () => {
    assert.equal(resolveAreaName('Paris', known), null);
    assert.equal(resolveAreaName('   ', known), null);
  });
});

describe('findAnchor — the area they love that we can measure', () => {
  const known = ['Clapham Common', 'Peckham Rye'];

  it('takes the first loved area that resolves', () => {
    assert.equal(findAnchor({ Clapham: 'love', 'Peckham Rye': 'love' }, known), 'Clapham Common');
  });

  it('ignores areas they said they hate', () => {
    assert.equal(findAnchor({ Clapham: 'hate' }, known), null);
  });

  it('skips a loved area we hold no data for', () => {
    assert.equal(findAnchor({ Narnia: 'love', Clapham: 'love' }, known), 'Clapham Common');
  });

  it('returns null when nobody named anywhere — the new-to-London case', () => {
    assert.equal(findAnchor(undefined, known), null);
    assert.equal(findAnchor({}, known), null);
  });
});

describe('shortlistByAnchor — data picks the shortlist, the model only explains it', () => {
  /** Real area names, so the similarity engine has genuine data to work on. */
  const names = [
    'Clapham High Street', 'Kennington', 'Herne Hill', 'Stoke Newington',
    'High Barnet', 'Richmond', 'Hampstead', 'Peckham Rye', 'Greenwich',
    'Wandsworth Road', 'Brixton', 'Deptford Bridge', 'Southwark', 'Chiswick Park',
    'Turnham Green', 'Acton Town', 'Wimbledon', 'Ealing Broadway', 'Putney Bridge',
    'Shoreditch High Street',
  ];
  const candidates: AreaCandidate[] = names.map((n, i) => ({
    neighbourhood: n,
    stations: [n],
    lat: 51.4 + i * 0.01,
    lng: -0.2 + i * 0.01,
    commuteMins: 30,
    walkBudgetMins: 10,
    pocketSize: 3,
  }));

  it('returns nothing when there is no anchor, so the caller falls back', () => {
    assert.equal(shortlistByAnchor(candidates, {}, undefined), null);
    assert.equal(shortlistByAnchor(candidates, undefined, undefined), null);
  });

  it('narrows a long candidate list to a shortlist', () => {
    const result = shortlistByAnchor(candidates, { Clapham: 'love' }, undefined);
    assert.ok(result, 'an anchor was found');
    assert.ok(result!.anchor.startsWith('Clapham'));
    assert.ok(result!.candidates.length <= ANCHOR_SHORTLIST);
    assert.ok(result!.candidates.length > 0);
    assert.ok(
      result!.candidates.length < candidates.length,
      'the point is to send the model fewer areas',
    );
  });

  it('never suggests an area they said they hate', () => {
    const result = shortlistByAnchor(
      candidates,
      { Clapham: 'love', Richmond: 'hate', 'High Barnet': 'hate' },
      undefined,
    );
    assert.ok(result);
    const picked = result!.candidates.map((c) => c.neighbourhood);
    assert.ok(!picked.includes('Richmond'), 'a stated rejection outranks any measurement');
    assert.ok(!picked.includes('High Barnet'));
  });

  it('never suggests the anchor back to them', () => {
    const result = shortlistByAnchor(candidates, { Clapham: 'love' }, undefined);
    assert.ok(result);
    assert.ok(
      !result!.candidates.some((c) => c.neighbourhood === result!.anchor),
      'telling someone to consider the area they just named is useless',
    );
  });

  it('lets what they like about the area change the shortlist', () => {
    // Two people both say "Clapham" and mean opposite things. If this makes
    // no difference, question two of the conversation is pointless.
    const bars = shortlistByAnchor(candidates, { Clapham: 'love' }, 'the bars and going out at night');
    const quiet = shortlistByAnchor(candidates, { Clapham: 'love' }, 'quiet residential streets and green space');
    assert.ok(bars && quiet);
    const a = bars!.candidates.map((c) => c.neighbourhood).join();
    const b = quiet!.candidates.map((c) => c.neighbourhood).join();
    assert.notEqual(a, b, 'the reason must steer the result');
  });
});

describe('several anchors — "both" and "either" are real answers', () => {
  const names = [
    'Clapham High Street', 'Kennington', 'Herne Hill', 'Stoke Newington',
    'High Barnet', 'Richmond', 'Hampstead', 'Peckham Rye', 'Greenwich',
    'Wandsworth Road', 'Brixton', 'Deptford Bridge', 'Southwark', 'Chiswick Park',
    'Turnham Green', 'Acton Town', 'Wimbledon', 'Ealing Broadway', 'Putney Bridge',
    'Shoreditch High Street', 'Hampstead Heath', 'Belsize Park', 'Kentish Town',
  ];
  const candidates: AreaCandidate[] = names.map((n, i) => ({
    neighbourhood: n, stations: [n],
    lat: 51.4 + i * 0.01, lng: -0.2 + i * 0.01,
    commuteMins: 30, walkBudgetMins: 10, pocketSize: 3,
  }));

  it('keeps every area they named, not just the first', () => {
    const result = shortlistByAnchor(
      candidates, { 'Clapham Common': 'love', Hampstead: 'love' }, undefined,
    );
    assert.ok(result);
    assert.deepEqual(result!.anchors, ['Clapham Common', 'Hampstead']);
    assert.equal(result!.anchor, 'Clapham Common', 'the first stays primary');
  });

  it('says which of their areas each suggestion resembles', () => {
    const result = shortlistByAnchor(
      candidates, { 'Clapham Common': 'love', Hampstead: 'love' }, undefined,
    );
    assert.ok(result);
    for (const c of result!.candidates) {
      const from = result!.matchedAnchor[c.neighbourhood];
      assert.ok(result!.anchors.includes(from), `${c.neighbourhood} traces to a named area`);
    }
  });

  it('returns places like EITHER, not a blend resembling neither', () => {
    // The midpoint of two unalike areas is somewhere the person likes less
    // than either. With both named, suggestions should trace back to both.
    const result = shortlistByAnchor(
      candidates, { 'Clapham Common': 'love', Hampstead: 'love' }, undefined,
    );
    assert.ok(result);
    const sources = new Set(Object.values(result!.matchedAnchor));
    assert.ok(sources.size > 1, 'both anchors contribute suggestions');
  });

  it('never suggests any area they named back to them', () => {
    const result = shortlistByAnchor(
      candidates, { 'Clapham Common': 'love', Hampstead: 'love' }, undefined,
    );
    assert.ok(result);
    const picked = result!.candidates.map((c) => c.neighbourhood);
    assert.ok(!picked.includes('Clapham Common'));
    assert.ok(!picked.includes('Hampstead'));
  });

  it('still honours a rejection when several areas are loved', () => {
    const result = shortlistByAnchor(
      candidates, { 'Clapham Common': 'love', Hampstead: 'love', Richmond: 'hate' }, undefined,
    );
    assert.ok(result);
    assert.ok(!result!.candidates.some((c) => c.neighbourhood === 'Richmond'));
  });
});
