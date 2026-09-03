import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NEGATIVE_REASONS,
  POSITIVE_REASONS,
  reasonsFor,
  reasonById,
  shouldAskWhy,
  isLearnable,
  isValidTier,
  isValidVerdict,
  verdictsForArea,
  verdictKey,
  sanitiseAreaKey,
  TIER_LABEL,
  TIER_SHORT,
  type Verdict,
} from '../verdicts';
import { DIMENSIONS } from '../similarity/features';

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  area: 'Peckham Rye',
  memberId: 'p1',
  tier: 'loved_it',
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
    const ids = reasonsFor('not_for_us').map((r) => r.id);
    assert.ok(ids.includes('feltUnsafe'));
    assert.ok(ids.includes('tooExpensive'));
  });

  it('has no duplicate ids across the two polarities', () => {
    const ids = [...NEGATIVE_REASONS, ...POSITIVE_REASONS].map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('asking why only at the extremes', () => {
  it('asks nothing of a shrug', () => {
    assert.equal(shouldAskWhy('maybe'), false);
    assert.deepEqual(reasonsFor('maybe'), []);
  });

  it('asks at both ends', () => {
    for (const tier of ['not_for_us', 'loved_it'] as const) {
      assert.equal(shouldAskWhy(tier), true, `did not ask at ${tier}`);
      assert.ok(reasonsFor(tier).length > 0);
    }
  });

  it('offers the negatives low and the positives high', () => {
    assert.equal(reasonsFor('not_for_us')[0].polarity, 'negative');
    assert.equal(reasonsFor('loved_it')[0].polarity, 'positive');
  });
});

describe('the three tiers', () => {
  it('recognises exactly the three, and nothing else', () => {
    for (const tier of ['not_for_us', 'maybe', 'loved_it']) {
      assert.equal(isValidTier(tier), true, `rejected ${tier}`);
    }
    // 8 is what the old 0-10 scale wrote. It must not sneak through as a
    // tier — see the migration note on isValidVerdict.
    for (const bad of [8, 0, null, undefined, '', 'lovedIt', 'been']) {
      assert.equal(isValidTier(bad), false, `accepted ${String(bad)}`);
    }
  });

  it('carries the arrows in the pill label and drops them when read back', () => {
    assert.ok(TIER_LABEL.not_for_us.includes('←'));
    assert.ok(TIER_LABEL.loved_it.includes('→'));
    assert.equal(TIER_SHORT.not_for_us, 'Not for us');
    assert.equal(TIER_SHORT.loved_it, 'Loved it');
  });
});

describe('verdicts written under the old 0-10 scale', () => {
  // They are dropped rather than converted: a 6/10 does not reliably mean
  // "maybe", and guessing would put words in someone's mouth.
  it('rejects a verdict carrying a score and no tier', () => {
    const legacy = { area: 'Nunhead', memberId: 'p1', score: 8, basis: 'been', reasons: [], at: 1 };
    assert.equal(isValidVerdict(legacy), false);
  });

  it('rejects a tier that never got set', () => {
    assert.equal(isValidVerdict(verdict({ tier: null as unknown as 'maybe' })), false);
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
      verdict({ memberId: 'p1', tier: 'not_for_us', at: 2 }),
      verdict({ memberId: 'p2', tier: 'loved_it', at: 1 }),
      verdict({ area: 'Nunhead', memberId: 'p1', tier: 'loved_it', at: 3 }),
    ];
    const rye = verdictsForArea(all, 'Peckham Rye');
    assert.equal(rye.length, 2);
    // Oldest first, so a card can show how an opinion moved.
    assert.deepEqual(rye.map((v) => v.tier), ['loved_it', 'not_for_us']);
  });
});

describe('what reaches storage', () => {
  it('rejects a verdict with no area or no person', () => {
    assert.equal(isValidVerdict(verdict({ area: '' })), false);
    assert.equal(isValidVerdict(verdict({ memberId: '' })), false);
  });

  it('rejects an unknown tier', () => {
    assert.equal(isValidVerdict(verdict({ tier: 'lovedit' as never })), false);
  });

  it('accepts the minimum honest answer — a tier and nothing else', () => {
    assert.equal(isValidVerdict(verdict({ reasons: [], note: undefined })), true);
  });
});
