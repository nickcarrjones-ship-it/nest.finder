import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRankingResponse } from '../parse';

describe('parseRankingResponse — the model will not always behave', () => {
  it('parses a clean response', () => {
    const r = parseRankingResponse(
      '{"ranked":[{"neighbourhood":"Brixton","score":9,"reason":"fast and lively","confidence":"high"}]}',
    );
    assert.equal(r.ranked.length, 1);
    assert.equal(r.ranked[0].neighbourhood, 'Brixton');
    assert.equal(r.recovered, false);
  });

  it('recovers JSON wrapped in prose or a code fence', () => {
    const r = parseRankingResponse(
      'Here is the ranking:\n```json\n{"ranked":[{"neighbourhood":"Peckham","score":7,"reason":"good value","confidence":"high"}]}\n```\nHope this helps!',
    );
    assert.equal(r.ranked.length, 1);
    assert.equal(r.recovered, true);
  });

  it('returns empty rather than throwing on garbage', () => {
    const r = parseRankingResponse('not json at all');
    assert.deepEqual(r.ranked, []);
  });

  it('returns empty on truncated JSON (the known max_tokens failure mode)', () => {
    const r = parseRankingResponse('{"ranked":[{"neighbourhood":"Brixton","score":9,"reas');
    assert.deepEqual(r.ranked, []);
  });

  it('drops individual malformed entries instead of failing the whole batch', () => {
    const r = parseRankingResponse(JSON.stringify({
      ranked: [
        { neighbourhood: 'Brixton', score: 9, reason: 'good', confidence: 'high' },
        { neighbourhood: 'Peckham', score: 'not a number', reason: 'bad score' },
        { score: 5, reason: 'missing neighbourhood' },
        { neighbourhood: 'Dalston', reason: 'missing score' },
      ],
    }));
    assert.equal(r.ranked.length, 1);
    assert.equal(r.ranked[0].neighbourhood, 'Brixton');
  });

  it('clamps an out-of-range score rather than trusting the model', () => {
    const r = parseRankingResponse(
      '{"ranked":[{"neighbourhood":"X","score":15,"reason":"y","confidence":"high"}]}',
    );
    assert.equal(r.ranked[0].score, 10);
  });

  it('defaults confidence to high only when explicitly not "low"', () => {
    const r = parseRankingResponse(
      '{"ranked":[{"neighbourhood":"X","score":5,"reason":"y"}]}',
    );
    assert.equal(r.ranked[0].confidence, 'high');
  });
});
