import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { joinWords, summariseConversation } from '../conversationSummary';
import type { Profile } from '../types';

const base: Profile = { members: [] };

describe('what the Agent says it remembers', () => {
  it('has nothing to show before anyone has said anything', () => {
    const s = summariseConversation(base);
    assert.equal(s.hasAnything, false);
    assert.deepEqual(s.loves, []);
    assert.deepEqual(s.lines, []);
  });

  it('survives no profile at all', () => {
    assert.equal(summariseConversation(null).hasAnything, false);
  });

  it('separates the areas they love from the ones they ruled out', () => {
    const s = summariseConversation({
      ...base,
      areaCards: { Tooting: 'love', Earlsfield: 'love', Croydon: 'hate' },
    });
    assert.deepEqual(s.loves, ['Earlsfield', 'Tooting']); // sorted, so it reads stably
    assert.deepEqual(s.hates, ['Croydon']);
    assert.equal(s.hasAnything, true);
  });

  it('quotes their reason back in their own words, never paraphrased', () => {
    // This is the sentence the matching leans on hardest, and the one thing
    // on the card they actually wrote. Rewording it would be the app
    // claiming they said something they did not.
    const words = 'the common and being able to walk to a decent pub';
    const s = summariseConversation({ ...base, lifestyle: { anchorReason: words } });
    assert.equal(s.reason, words);
  });

  it('ignores a reason that is only whitespace', () => {
    assert.equal(summariseConversation({ ...base, lifestyle: { anchorReason: '   ' } }).reason, undefined);
  });

  it('reads the three evening fields as one sentence, not three rows', () => {
    const s = summariseConversation({
      ...base,
      lifestyle: { streetVibe: 'quiet', nightsOut: 'rarely', greenSpace: 'essential' },
    });
    const evenings = s.lines.find((l) => l.label === 'Evenings');
    assert.ok(evenings);
    assert.equal(evenings.value, 'somewhere quiet, mostly nights in and green space is essential');
    assert.equal(s.lines.filter((l) => l.label === 'Evenings').length, 1);
  });

  it('reports the river answer the way it was asked', () => {
    assert.equal(
      summariseConversation({ ...base, lifestyle: { riverSide: 'south' } })
        .lines.find((l) => l.label === 'The river')?.value,
      'south of it',
    );
    assert.equal(
      summariseConversation({ ...base, lifestyle: { riverSide: 'either' } })
        .lines.find((l) => l.label === 'The river')?.value,
      'either side',
    );
  });

  it('does not invent a Zone 1 answer that was never given', () => {
    const asked = summariseConversation({ ...base, lifestyle: { zone1Ok: false } });
    assert.equal(asked.lines.find((l) => l.label === 'Zone 1')?.value, 'ruled out');
    const unasked = summariseConversation({ ...base, lifestyle: { streetVibe: 'quiet' } });
    assert.equal(unasked.lines.find((l) => l.label === 'Zone 1'), undefined);
  });

  it('shows what they ruled out', () => {
    const s = summariseConversation({ ...base, lifestyle: { dealbreakers: ['Croydon', 'Barking'] } });
    assert.equal(s.lines.find((l) => l.label === 'Ruled out')?.value, 'Croydon and Barking');
  });

  it('counts a lifestyle answer alone as something worth showing', () => {
    // Someone can finish the taps without naming an area they love.
    assert.equal(summariseConversation({ ...base, lifestyle: { riverSide: 'south' } }).hasAnything, true);
  });
});

describe('lists read the way they would be said aloud', () => {
  it('joins with "and", not a trailing comma', () => {
    assert.equal(joinWords(['Tooting']), 'Tooting');
    assert.equal(joinWords(['Tooting', 'Balham']), 'Tooting and Balham');
    assert.equal(joinWords(['Tooting', 'Balham', 'Nunhead']), 'Tooting, Balham and Nunhead');
    assert.equal(joinWords([]), '');
  });
});
