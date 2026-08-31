import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeMembers,
  describeWorkplaces,
  isWorthKeeping,
  profilesDiffer,
} from '../profileChoice';
import type { Profile } from '../types';

const profile = (over: Partial<Profile> = {}): Profile => ({
  members: [
    { id: 'a', name: 'Nick', workId: 'canary_wharf', workLabel: 'Canary Wharf', offWalk: 5 },
    { id: 'b', name: 'Harriet', workId: 'holborn', workLabel: 'Holborn', offWalk: 5 },
  ],
  ...over,
});

describe('when to ask which profile they meant', () => {
  // The exact failure: a saved single dummy person at Canary Wharf silently
  // replaced a real two-person household that had just been entered.
  it('spots a saved household that is not the one just entered', () => {
    const saved = profile({
      members: [{ id: 'm0', name: 'A', workId: 'canary_wharf', workLabel: 'Canary Wharf', offWalk: 5 }],
    });
    assert.equal(profilesDiffer(saved, profile()), true);
  });

  it('stays quiet when they are the same household', () => {
    assert.equal(profilesDiffer(profile(), profile()), false);
  });

  it('ignores the order people were entered in', () => {
    const reversed = profile({ members: [...profile().members].reverse() });
    assert.equal(profilesDiffer(profile(), reversed), false);
  });

  it('notices a changed workplace, not just a changed name', () => {
    const moved = profile({
      members: [
        { id: 'a', name: 'Nick', workId: 'kings_cross', workLabel: "King's Cross", offWalk: 5 },
        { id: 'b', name: 'Harriet', workId: 'holborn', workLabel: 'Holborn', offWalk: 5 },
      ],
    });
    assert.equal(profilesDiffer(profile(), moved), true);
  });

  it('does not ask about a preference that legitimately drifts', () => {
    // Commute minutes and lifestyle change between sessions on purpose;
    // asking about them would turn a rare question into a nag.
    const slower = profile({ maxCommuteMins: 70, lifestyle: { streetVibe: 'quiet' } });
    assert.equal(profilesDiffer(profile(), slower), false);
  });
});

describe('what counts as worth keeping', () => {
  it('never offers to keep the seeded demo couple', () => {
    assert.equal(isWorthKeeping(profile({ isDemo: true })), false);
  });

  it('keeps a real household', () => {
    assert.equal(isWorthKeeping(profile()), true);
  });

  it('does not offer an empty one', () => {
    assert.equal(isWorthKeeping(profile({ members: [] })), false);
  });
});

describe('describing each option so they can tell them apart', () => {
  it('names one person, two, and more', () => {
    assert.equal(describeMembers(profile({ members: [profile().members[0]] })), 'Nick');
    assert.equal(describeMembers(profile()), 'Nick and Harriet');
    assert.equal(
      describeMembers(
        profile({
          members: [
            ...profile().members,
            { id: 'c', name: 'Sam', workId: 'angel', workLabel: 'Angel', offWalk: 5 },
          ],
        }),
      ),
      'Nick, Harriet and Sam',
    );
  });

  it('lists the workplaces, without repeating a shared one', () => {
    assert.equal(describeWorkplaces(profile()), 'Canary Wharf and Holborn');
    const together = profile({
      members: profile().members.map((m) => ({ ...m, workId: 'holborn', workLabel: 'Holborn' })),
    });
    assert.equal(describeWorkplaces(together), 'Holborn');
  });

  it('says so rather than rendering blank when nothing is set', () => {
    assert.equal(describeMembers(profile({ members: [] })), 'Nobody named yet');
    assert.equal(describeWorkplaces(profile({ members: [] })), 'No workplaces set');
  });
});
