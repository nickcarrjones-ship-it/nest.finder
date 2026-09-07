import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeChange } from '../pendingChange';
import type { Profile } from '../types';

const profile = (over: Partial<Profile> = {}): Profile => ({ members: [], ...over });

describe('only genuinely new things are worth confirming', () => {
  // The model restates its WHOLE understanding every turn — it is told to,
  // so nothing gets dropped. If the card showed all of that as a proposed
  // change, people would learn to dismiss it unread, and the one time it
  // mattered they would dismiss that too.
  it('says nothing when the model just restated what we already knew', () => {
    const current = profile({
      areaCards: { Tooting: 'love' },
      lifestyle: { streetVibe: 'quiet', riverSide: 'south' },
    });
    assert.equal(
      describeChange(current, { streetVibe: 'quiet', riverSide: 'south' }, { Tooting: 'love' }),
      null,
    );
  });

  it('picks out only the new area from a restated list', () => {
    const current = profile({ areaCards: { Tooting: 'love', Earlsfield: 'love' } });
    const change = describeChange(current, {}, { Tooting: 'love', Earlsfield: 'love', Fulham: 'love' })!;
    assert.deepEqual(Object.keys(change.areaCards), ['Fulham']);
    assert.deepEqual(change.described, ['Add Fulham to the areas you like']);
  });

  it('notices an area changing from loved to ruled out', () => {
    const change = describeChange(profile({ areaCards: { Fulham: 'love' } }), {}, { Fulham: 'hate' })!;
    assert.equal(change.areaCards.Fulham, 'hate');
    assert.deepEqual(change.described, ['Rule out Fulham']);
  });
});

describe('what the card says', () => {
  it('describes a change in words a person would use', () => {
    const change = describeChange(profile(), {
      streetVibe: 'quiet', riverSide: 'south', zone1Ok: false,
    }, {})!;
    assert.deepEqual(change.described, [
      "You're after somewhere quiet",
      'South of the river',
      'Rule out Zone 1',
    ]);
  });

  it('quotes a new reason rather than describing it', () => {
    const change = describeChange(profile(), { anchorReason: 'the common and the pubs' }, {})!;
    assert.ok(change.described[0].includes('the common and the pubs'));
  });

  it('adds new dealbreakers to the existing ones rather than replacing them', () => {
    const current = profile({ lifestyle: { dealbreakers: ['Croydon'] } });
    const change = describeChange(current, { dealbreakers: ['Croydon', 'Barking'] }, {})!;
    assert.deepEqual(change.lifestyle.dealbreakers, ['Croydon', 'Barking']);
    assert.deepEqual(change.described, ['Rule out Barking']);
  });

  it('never lists preference tags as their own line', () => {
    // They are the machine-readable form of the reason — showing them would
    // be the same change described twice, once in words nobody uses.
    const change = describeChange(profile(), {
      anchorReason: 'green and quiet', preferenceTags: ['quiet', 'green'],
    }, {})!;
    assert.equal(change.described.length, 1);
    assert.deepEqual(change.lifestyle.preferenceTags, ['quiet', 'green']);
  });

  it('carries the change itself, not just the description', () => {
    // What the card shows and what gets written must be the same thing.
    const change = describeChange(profile(), { riverSide: 'north' }, { Hackney: 'love' })!;
    assert.equal(change.lifestyle.riverSide, 'north');
    assert.equal(change.areaCards.Hackney, 'love');
  });
});

describe('an empty conversation turn', () => {
  it('proposes nothing when the model extracted nothing', () => {
    assert.equal(describeChange(profile(), {}, {}), null);
  });

  it('works against a profile that does not exist yet', () => {
    const change = describeChange(null, { riverSide: 'south' }, {})!;
    assert.deepEqual(change.described, ['South of the river']);
  });
});
