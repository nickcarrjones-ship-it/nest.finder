import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assess,
  describeCoverage,
  formatScore,
  isValidMustHave,
  makeMustHave,
  moveMustHave,
  rankByScore,
  weightsFor,
  type Checks,
  type MustHave,
} from '../mustHaves';

/** A list in priority order, named so the assertions read like the brief:
 *  "no renovation" is their number one, "double garden" their last. */
function list(...texts: string[]): MustHave[] {
  return texts.map((text, i) => ({ id: `m${i}`, text, createdAt: 1_000 + i }));
}

const FIVE = list('no renovation', 'garden', 'off-street parking', 'period features', 'double garage');

describe('the order is the weighting', () => {
  it('makes the top of a list of five worth five times the bottom', () => {
    assert.deepEqual(weightsFor(5), [5, 4, 3, 2, 1]);
  });

  it('gives a single must-have all of the weight', () => {
    assert.deepEqual(weightsFor(1), [1]);
  });

  it('scores the top must-have above the bottom one, on its own', () => {
    // Nick's own example: "perfectly to taste, no renovation needed" has to
    // move the score more than "double garden" does.
    const topOnly = assess(FIVE, { m0: true, m1: false, m2: false, m3: false, m4: false });
    const bottomOnly = assess(FIVE, { m0: false, m1: false, m2: false, m3: false, m4: true });
    assert.ok(
      (topOnly.score as number) > (bottomOnly.score as number),
      `top ${topOnly.score} should beat bottom ${bottomOnly.score}`,
    );
    assert.equal(topOnly.score, 3.3); // 5 of 15
    assert.equal(bottomOnly.score, 0.7); // 1 of 15
  });

  it('moves the score when a must-have is promoted, without re-answering anything', () => {
    const checks: Checks = { m0: false, m1: false, m2: false, m3: false, m4: true };
    const before = assess(FIVE, checks);
    const promoted = moveMustHave(FIVE, 'm4', -1); // double garage up one place
    const after = assess(promoted, checks);
    assert.ok((after.score as number) > (before.score as number));
  });
});

describe('everything met, nothing met', () => {
  it('gives a straight 10 when every answered must-have is met', () => {
    assert.equal(assess(FIVE, { m0: true, m1: true, m2: true, m3: true, m4: true }).score, 10);
  });

  it('gives 0 when every answered must-have is missed', () => {
    assert.equal(assess(FIVE, { m0: false, m1: false, m2: false, m3: false, m4: false }).score, 0);
  });

  it('tells 0 apart from not-scored-yet', () => {
    // These are opposite findings — "it has none of what we wanted" and "we
    // haven't looked" — and must never sort together.
    assert.equal(assess(FIVE, { m0: false }).score, 0);
    assert.equal(assess(FIVE, {}).score, null);
    assert.equal(assess(FIVE, null).score, null);
  });
});

describe('an unanswered must-have is not a failure', () => {
  it('scores over what was answered, not over the whole list', () => {
    // Two answered, the top one met: 5 of 5+4.
    const a = assess(FIVE, { m0: true, m1: false });
    assert.equal(a.answered, 2);
    assert.equal(a.score, 5.6);
  });

  it('says so out loud when too little has been answered to mean much', () => {
    const thin = assess(FIVE, { m0: true });
    assert.equal(thin.score, 10);
    assert.equal(thin.provisional, true, 'one of five answered must read as provisional');
  });

  it('stops calling it provisional once half the list is answered', () => {
    const fuller = assess(FIVE, { m0: true, m1: true, m2: false });
    assert.equal(fuller.provisional, false);
  });

  it('ignores a must-have added after the viewing rather than failing it', () => {
    const checks: Checks = { m0: true, m1: true };
    const before = assess(list('no renovation', 'garden'), checks);
    const after = assess(list('no renovation', 'garden', 'a new idea'), checks);
    assert.equal(before.score, 10);
    assert.equal(after.score, 10, 'a new must-have must not retroactively mark a property down');
    assert.equal(after.answered, 2);
    assert.equal(after.total, 3);
  });

  it('ignores an answer left behind by a deleted must-have', () => {
    const a = assess(list('no renovation'), { m0: true, m_deleted: false });
    assert.equal(a.score, 10);
    assert.equal(a.answered, 1);
  });

  it('treats a non-boolean as unanswered rather than trusting it', () => {
    const a = assess(FIVE, { m0: 'yes' as unknown as boolean, m1: true });
    assert.equal(a.answered, 1);
  });
});

describe('ranking the properties they have seen', () => {
  const seen = (id: string, checks: Checks | null, viewingAt = 1_000) => ({ id, viewingAt, checks });

  it('puts the best score first', () => {
    const ranked = rankByScore(
      [
        seen('mediocre', { m0: false, m1: true, m2: true }),
        seen('great', { m0: true, m1: true, m2: true }),
      ],
      FIVE,
    );
    assert.deepEqual(ranked.map((r) => r.id), ['great', 'mediocre']);
  });

  it('sends the unscored to the bottom, not the top', () => {
    // An unscored property is an unanswered question, not a bad property —
    // but this list exists to say which was best.
    const ranked = rankByScore(
      [seen('unscored', null), seen('poor', { m0: false, m1: false, m2: false })],
      FIVE,
    );
    assert.deepEqual(ranked.map((r) => r.id), ['poor', 'unscored']);
  });

  it('breaks a tie towards the one they know more about', () => {
    const ranked = rankByScore(
      [seen('thin', { m0: true }), seen('thorough', { m0: true, m1: true, m2: true })],
      FIVE,
    );
    assert.deepEqual(ranked.map((r) => r.id), ['thorough', 'thin']);
  });

  it('falls back to most recently seen when scores and coverage match', () => {
    const ranked = rankByScore(
      [seen('older', { m0: true }, 1_000), seen('newer', { m0: true }, 9_000)],
      FIVE,
    );
    assert.deepEqual(ranked.map((r) => r.id), ['newer', 'older']);
  });

  it('leaves the array it was given alone', () => {
    const input = [seen('a', { m0: false }), seen('b', { m0: true })];
    rankByScore(input, FIVE);
    assert.deepEqual(input.map((r) => r.id), ['a', 'b']);
  });
});

describe('reordering', () => {
  it('swaps with the neighbour above', () => {
    assert.deepEqual(moveMustHave(FIVE, 'm2', -1).map((m) => m.id), ['m0', 'm2', 'm1', 'm3', 'm4']);
  });

  it('swaps with the neighbour below', () => {
    assert.deepEqual(moveMustHave(FIVE, 'm0', 1).map((m) => m.id), ['m1', 'm0', 'm2', 'm3', 'm4']);
  });

  it('returns the same array when nothing can move, so nothing re-syncs', () => {
    // Reference equality, deliberately: a stray tap on a disabled arrow
    // must not write an identical list back to Firebase.
    assert.equal(moveMustHave(FIVE, 'm0', -1), FIVE);
    assert.equal(moveMustHave(FIVE, 'm4', 1), FIVE);
    assert.equal(moveMustHave(FIVE, 'nope', -1), FIVE);
  });
});

describe('reading the score', () => {
  it('drops a decimal that adds nothing', () => {
    assert.equal(formatScore(10), '10');
    assert.equal(formatScore(0), '0');
    assert.equal(formatScore(8.4), '8.4');
  });

  it('has nothing to say about a score that does not exist', () => {
    assert.equal(formatScore(null), null);
  });

  it('describes coverage as a sentence', () => {
    assert.equal(describeCoverage(assess(FIVE, {})), 'Not checked off yet');
    assert.equal(describeCoverage(assess(FIVE, { m0: true, m1: false })), '2 of 5 checked');
    assert.equal(
      describeCoverage(assess(FIVE, { m0: true, m1: true, m2: true, m3: true, m4: true })),
      'All 5 checked',
    );
  });

  it('says nothing at all when the household has no must-haves', () => {
    assert.equal(describeCoverage(assess([], {})), null);
  });
});

describe('the must-haves themselves', () => {
  it('trims what was typed and writes it in capitals', () => {
    assert.equal(makeMustHave('  double garden  ').text, 'DOUBLE GARDEN');
  });

  it('gives each one an id of its own', () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeMustHave('x').id));
    assert.equal(ids.size, 50);
  });

  it('refuses a blank one, and anything that is not one at all', () => {
    assert.equal(isValidMustHave({ id: 'a', text: '   ', createdAt: 1 }), false);
    assert.equal(isValidMustHave({ id: '', text: 'x', createdAt: 1 }), false);
    assert.equal(isValidMustHave(null), false);
    assert.equal(isValidMustHave('garden'), false);
    assert.equal(isValidMustHave({ id: 'a', text: 'x', createdAt: 1 }), true);
  });
});

describe('a household with no must-haves', () => {
  it('has no score rather than a perfect one', () => {
    // Nothing to fail means nothing to pass. Scoring this 10 would put
    // every unassessed property at the top of the list.
    const a = assess([], {});
    assert.equal(a.score, null);
    assert.equal(a.total, 0);
    assert.equal(a.provisional, false);
  });
});
