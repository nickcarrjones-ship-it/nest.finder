import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { commuteMinsNeededFor, roundUpToCommuteOption } from '../commuteSettings';
import type { JourneyTimes, Member } from '../types';

const members: Member[] = [
  { id: 'm0', name: 'A', workId: 'canary_wharf', workLabel: 'Canary Wharf', offWalk: 5 },
  { id: 'm1', name: 'B', workId: 'holborn', workLabel: 'Holborn', offWalk: 10 },
];

const journeyTimes: JourneyTimes = {
  Epping: { canary_wharf: 40, holborn: 41 },
  Balham: { canary_wharf: 25, holborn: 20 },
  Unmeasured: { canary_wharf: 30 }, // holborn missing
};

describe('commuteMinsNeededFor', () => {
  it('is the slowest member to the slowest loved area, plus that member\'s walk buffer', () => {
    // Epping: max(40, 41) + max(5, 10) = 51
    assert.equal(commuteMinsNeededFor(['Epping'], members, journeyTimes), 51);
  });

  it('takes the worst case across several loved areas', () => {
    assert.equal(commuteMinsNeededFor(['Balham', 'Epping'], members, journeyTimes), 51);
  });

  it('skips an area missing a member\'s journey time rather than guessing', () => {
    assert.equal(commuteMinsNeededFor(['Unmeasured'], members, journeyTimes), undefined);
  });

  it('returns undefined when nothing is loved', () => {
    assert.equal(commuteMinsNeededFor([], members, journeyTimes), undefined);
  });
});

describe('roundUpToCommuteOption', () => {
  it('rounds up to the nearest offered option', () => {
    assert.equal(roundUpToCommuteOption(51), 55);
    assert.equal(roundUpToCommuteOption(30), 30);
  });

  it('caps at the highest option rather than going unbounded', () => {
    assert.equal(roundUpToCommuteOption(90), 60);
  });
});
