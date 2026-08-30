import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NEGATIVE_REASONS,
  POSITIVE_REASONS,
  reasonsFor,
  reasonById,
  shouldAskWhy,
  isLearnable,
  isValidScore,
  isValidVerdict,
  verdictWeight,
  verdictsForArea,
  verdictKey,
  sanitiseAreaKey,
  BASIS_WEIGHT,
  type Verdict,
} from '../verdicts';
import { DIMENSIONS } from '../similarity/features';

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  area: 'Peckham Rye',
  memberId: 'p1',
  score: 8,
  basis: 'been',
  reasons: [],
  at: 1_700_000_000_000,
  ...over,
});

describe('the reason vocabulary points at data we actually hold', () => {
  // The whole point of the chips is that a reason can later move a
  // weight. A typo in a target would produce a chip that looks learnable
  // and silently teaches nothing — invisible without this test.
  it('every target is a real similarity dimension, or an admitted gap', () => {
    const known = new Set<string>([...DIMENSIONS, 'commute', 'none']);
    for (const reason of [...NEGATIVE_REASONS, ...POSITIVE_REASONS]) {
      for (const target of reason.targets) {
        assert.ok(known.has(target), `${reason.id} points at unknown target "${target}"`);
      }
    }
  });

  it('is honest that safety and price are unmeasured', () => {
    assert.equal(isLearnable(reasonById('feltUnsafe')!), false);
    assert.equal(isLearnable(reasonById('tooExpensive')!), false);
  });

  it('keeps them on offer anyway, so people can say the true thing', () => {
    const ids = reasonsFor(0).map((r) => r.id);
    assert.ok(ids.includes('feltUnsafe'));
    assert.ok(ids.includes('tooExpensive'));
  });

  it('has no duplicate ids across the two polarities', () => {
    const ids = [...NEGATIVE_REASONS, ...POSITIVE_REASONS].map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('asking why only at the extremes', () => {
  it('asks nothing through the middle of the scale', () => {
    for (const score of [3, 4, 5, 6, 7, 8]) {
      assert.equal(shouldAskWhy(score), false, `asked at ${score}`);
      assert.deepEqual(reasonsFor(score), []);
    }
  });

  it('asks at both ends', () => {
    for (const score of [0, 1, 2, 9, 10]) {
      assert.equal(shouldAskWhy(score), true, `did not ask at ${score}`);
      assert.ok(reasonsFor(score).length > 0);
    }
  });

  it('offers the negatives low and the positives high', () => {
    assert.equal(reasonsFor(1)[0].polarity, 'negative');
    assert.equal(reasonsFor(10)[0].polarity, 'positive');
  });
});

describe('a guess is not a visit', () => {
  it('weighs a guess well below someone who actually went', () => {
    assert.ok(verdictWeight(verdict({ basis: 'guess' })) < verdictWeight(verdict({ basis: 'been' })));
    assert.ok(verdictWeight(verdict({ basis: 'known' })) < verdictWeight(verdict({ basis: 'been' })));
  });

  it('still records it rather than throwing it away', () => {
    assert.ok(BASIS_WEIGHT.guess > 0);
  });
});

describe('zero is an opinion, not a missing value', () => {
  // The bug this scale invites: treating 0 as falsy and losing the
  // strongest verdict anyone can give.
  it('accepts 0 as a valid score', () => {
    assert.equal(isValidScore(0), true);
    assert.equal(isValidVerdict(verdict({ score: 0 })), true);
  });

  it('rejects a score that never got set', () => {
    assert.equal(isValidScore(null), false);
    assert.equal(isValidScore(undefined), false);
    assert.equal(isValidVerdict(verdict({ score: null as unknown as number })), false);
  });

  it('rejects off-scale and non-integer scores', () => {
    for (const bad of [-1, 11, 7.5, '8']) {
      assert.equal(isValidScore(bad), false, `accepted ${String(bad)}`);
    }
  });
});

describe('storage keys survive real London place names', () => {
  it('leaves an apostrophe alone — Firebase permits it', () => {
    assert.equal(sanitiseAreaKey("Shepherd's Bush"), "Shepherd's Bush");
  });

  it('replaces the characters Firebase forbids', () => {
    assert.equal(sanitiseAreaKey('St. John/s #Wood'), 'St_ John_s _Wood');
  });

  it('keys a verdict by area and person together', () => {
    assert.notEqual(verdictKey('Nunhead', 'p1'), verdictKey('Nunhead', 'p2'));
  });
});

describe('two people, one area', () => {
  it('keeps both opinions rather than averaging them away', () => {
    const all = [
      verdict({ memberId: 'p1', score: 4, at: 2 }),
      verdict({ memberId: 'p2', score: 8, at: 1 }),
      verdict({ area: 'Nunhead', memberId: 'p1', score: 9, at: 3 }),
    ];
    const rye = verdictsForArea(all, 'Peckham Rye');
    assert.equal(rye.length, 2);
    // Oldest first, so a card can show how an opinion moved.
    assert.deepEqual(rye.map((v) => v.score), [8, 4]);
  });
});

describe('what reaches storage', () => {
  it('rejects a verdict with no area or no person', () => {
    assert.equal(isValidVerdict(verdict({ area: '' })), false);
    assert.equal(isValidVerdict(verdict({ memberId: '' })), false);
  });

  it('rejects an unknown basis', () => {
    assert.equal(isValidVerdict(verdict({ basis: 'maybe' as never })), false);
  });

  it('accepts the minimum honest answer — a score and nothing else', () => {
    assert.equal(isValidVerdict(verdict({ reasons: [], note: undefined })), true);
  });
});
