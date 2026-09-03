import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankAreas, scoreTiers, TIER_VALUE, DISAGREEMENT } from '../verdictRank';
import type { Tier, Verdict } from '../verdicts';
import type { Member } from '../types';

const member = (id: string, name: string): Member => ({
  id,
  name,
  workId: 'w',
  workLabel: 'Work',
});

const NICK = member('p1', 'Nick');
const HARRIET = member('p2', 'Harriet');
const ROSIE = member('p3', 'Rosie');
const SAM = member('p4', 'Sam');

const said = (area: string, memberId: string, tier: Tier): Verdict => ({
  area,
  memberId,
  tier,
  reasons: [],
  at: 1_700_000_000_000,
});

/** The net score for one household's set of tiers, in household order. */
const net = (...tiers: Tier[]) => scoreTiers(tiers.map((t) => TIER_VALUE[t])).net;

describe("Nick's worked examples — a two-person household", () => {
  // These five are the specification, transcribed from what he asked for
  // on 2026-09-02. If the constant is ever retuned, these must still hold.
  it('both loved it comes above one loved it, one maybe', () => {
    assert.ok(net('loved_it', 'loved_it') > net('loved_it', 'maybe'));
  });

  it('one loved it, one maybe comes above two maybes', () => {
    assert.ok(net('loved_it', 'maybe') > net('maybe', 'maybe'));
  });

  it('CRUCIALLY: two maybes come above one loved it, one not for us', () => {
    // The case that rules out plain averaging — both mean zero, and the
    // split has to lose. A household does not move somewhere one of them
    // has ruled out, however much the other loved it.
    assert.equal(net('maybe', 'maybe'), 0);
    assert.equal(net('loved_it', 'not_for_us'), -DISAGREEMENT);
    assert.ok(net('maybe', 'maybe') > net('loved_it', 'not_for_us'));
  });

  it('one loved it, one not for us comes above two not for us', () => {
    assert.ok(net('loved_it', 'not_for_us') > net('not_for_us', 'not_for_us'));
  });

  it('produces the whole order in one pass', () => {
    const order = [
      net('loved_it', 'loved_it'),
      net('loved_it', 'maybe'),
      net('maybe', 'maybe'),
      net('loved_it', 'not_for_us'),
      net('not_for_us', 'not_for_us'),
    ];
    const sorted = [...order].sort((a, b) => b - a);
    assert.deepEqual(order, sorted);
  });

  it('runs between +1 and −1 at the extremes', () => {
    assert.equal(net('loved_it', 'loved_it'), 1);
    assert.equal(net('not_for_us', 'not_for_us'), -1);
  });
});

describe('bigger households', () => {
  it('weighs everyone the same — a third voice moves the score', () => {
    assert.ok(net('loved_it', 'loved_it', 'loved_it') > net('loved_it', 'loved_it', 'maybe'));
  });

  it('punishes one holdout in four less than an even split', () => {
    // The reason this uses a deviation rather than max-minus-min: both of
    // these have the same highest and lowest answer, so a range would call
    // them identical disagreement. One dissenter in four is not half the
    // house.
    const oneHoldout = net('loved_it', 'loved_it', 'loved_it', 'not_for_us');
    const evenSplit = net('loved_it', 'loved_it', 'not_for_us', 'not_for_us');
    assert.ok(oneHoldout > evenSplit);
  });

  it('still puts a unanimous shrug above a house that is split', () => {
    assert.ok(net('maybe', 'maybe', 'maybe') > net('loved_it', 'maybe', 'not_for_us'));
  });

  it('a five-person household ranks the same way as two', () => {
    const all = net('loved_it', 'loved_it', 'loved_it', 'loved_it', 'loved_it');
    const mostly = net('loved_it', 'loved_it', 'loved_it', 'loved_it', 'maybe');
    const shrug = net('maybe', 'maybe', 'maybe', 'maybe', 'maybe');
    const split = net('loved_it', 'loved_it', 'not_for_us', 'not_for_us', 'not_for_us');
    assert.ok(all > mostly);
    assert.ok(mostly > shrug);
    assert.ok(shrug > split);
  });

  it('one person on their own is just their own answer', () => {
    assert.equal(net('loved_it'), 1);
    assert.equal(net('maybe'), 0);
    assert.equal(net('not_for_us'), -1);
  });
});

describe('ranking the areas a household has been to', () => {
  const members = [NICK, HARRIET];

  it('orders areas by what the household made of them', () => {
    const verdicts = [
      said('Nunhead', 'p1', 'maybe'),
      said('Nunhead', 'p2', 'maybe'),
      said('Tooting Bec', 'p1', 'loved_it'),
      said('Tooting Bec', 'p2', 'loved_it'),
      said('Barking', 'p1', 'loved_it'),
      said('Barking', 'p2', 'not_for_us'),
    ];
    const ranked = rankAreas(verdicts, members);
    assert.deepEqual(ranked.map((r) => r.area), ['Tooting Bec', 'Nunhead', 'Barking']);
  });

  it('leaves out areas nobody has been to', () => {
    const ranked = rankAreas([said('Nunhead', 'p1', 'maybe')], members);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].area, 'Nunhead');
  });

  it('ranks a half-scored area, and says who is still to weigh in', () => {
    const ranked = rankAreas([said('Nunhead', 'p1', 'loved_it')], members);
    assert.equal(ranked[0].net, 1);
    assert.deepEqual(ranked[0].awaiting, ['Harriet']);
    assert.deepEqual(ranked[0].byMember.map((m) => m.name), ['Nick']);
  });

  it('keeps both answers on the card rather than only the score', () => {
    const ranked = rankAreas(
      [said('Barking', 'p1', 'loved_it'), said('Barking', 'p2', 'not_for_us')],
      members,
    );
    assert.deepEqual(ranked[0].byMember, [
      { memberId: 'p1', name: 'Nick', tier: 'loved_it' },
      { memberId: 'p2', name: 'Harriet', tier: 'not_for_us' },
    ]);
    assert.deepEqual(ranked[0].awaiting, []);
  });

  it('shows people in household order, not the order they answered in', () => {
    const ranked = rankAreas(
      [
        { ...said('Nunhead', 'p2', 'maybe'), at: 1 },
        { ...said('Nunhead', 'p1', 'loved_it'), at: 2 },
      ],
      members,
    );
    assert.deepEqual(ranked[0].byMember.map((m) => m.name), ['Nick', 'Harriet']);
  });

  it('breaks a tie on how much of the household has spoken', () => {
    const verdicts = [
      said('Nunhead', 'p1', 'loved_it'),
      said('Peckham Rye', 'p1', 'loved_it'),
      said('Peckham Rye', 'p2', 'loved_it'),
    ];
    // Both net 1; the one both of them rated is the firmer answer.
    const ranked = rankAreas(verdicts, members);
    assert.deepEqual(ranked.map((r) => r.area), ['Peckham Rye', 'Nunhead']);
  });

  it('still counts a verdict from someone since removed from the household', () => {
    const ranked = rankAreas(
      [said('Nunhead', 'p1', 'loved_it'), said('Nunhead', 'gone', 'not_for_us')],
      members,
    );
    assert.equal(ranked[0].byMember.length, 2);
    assert.ok(ranked[0].net < 1);
  });

  it('handles a four-person household end to end', () => {
    const four = [NICK, HARRIET, ROSIE, SAM];
    const verdicts = [
      said('Walthamstow', 'p1', 'loved_it'),
      said('Walthamstow', 'p2', 'loved_it'),
      said('Walthamstow', 'p3', 'maybe'),
      said('Walthamstow', 'p4', 'maybe'),
      said('Croydon', 'p1', 'loved_it'),
      said('Croydon', 'p2', 'loved_it'),
      said('Croydon', 'p3', 'not_for_us'),
      said('Croydon', 'p4', 'not_for_us'),
    ];
    const ranked = rankAreas(verdicts, four);
    assert.deepEqual(ranked.map((r) => r.area), ['Walthamstow', 'Croydon']);
  });

  it('returns nothing at all before anyone has said anything', () => {
    assert.deepEqual(rankAreas([], members), []);
  });
});
