import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shortlistBrief } from '../agentChat/shortlistBrief';
import type { Profile } from '../types';

const profile = (over: Partial<Profile> = {}): Profile => ({
  members: [{ id: 'm0', name: 'Nick', workId: 'canary_wharf', workLabel: 'Canary Wharf', offWalk: 5 }],
  maxCommuteMins: 45,
  ...over,
});

const jt = { Balham: { canary_wharf: 35 }, Brixton: { canary_wharf: 30 } };

/**
 * These questions used to get NOTHING — the only answering path needed a
 * resolved area name, so a question about their own shortlist fell through
 * to the extractor, whose reply is discarded (audit, 2026-09-08). Six of
 * fourteen realistic questions landed there.
 */
describe('the brief for a question that names no area', () => {
  it('lists the shortlist in rank order with the figures to rank on', () => {
    const text = shortlistBrief({ profile: profile(), areas: ['Balham', 'Brixton'], journeyTimes: jt });
    assert.match(text, /1\. Balham/);
    assert.match(text, /2\. Brixton/);
    // "Which is cheapest?" needs prices; "which is closest?" needs commutes.
    assert.match(text, /median £/);
    assert.match(text, /min commute/);
  });

  it('carries what they said they want, so "which suits us" is answerable', () => {
    const text = shortlistBrief({
      profile: profile({ lifestyle: { riverSide: 'south' }, areaCards: { Tooting: 'love' } }),
      areas: ['Balham'],
    });
    assert.match(text, /Areas they love: Tooting/);
    assert.match(text, /The river: south of it/);
  });

  it('carries the budget, so "can we afford anywhere" is answerable', () => {
    const text = shortlistBrief({
      profile: profile({
        propertyCriteria: {
          channel: 'buy', minPrice: 150_000, maxPrice: 700_000,
          minBeds: 2, maxBeds: 3, minBaths: 1, maxBaths: 2,
          tenures: [], features: [], setAt: 1,
        },
      }),
      areas: ['Balham'],
    });
    assert.match(text, /Looking to buy: £150,000–£700,000/);
  });

  it('says the list is empty rather than inventing one', () => {
    const text = shortlistBrief({ profile: profile(), areas: [] });
    assert.match(text, /SHORTLIST IS EMPTY/);
    assert.equal(/1\. /.test(text), false);
  });

  it('caps how many areas travel', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Area${i}`);
    const text = shortlistBrief({ profile: profile(), areas: many });
    assert.match(text, /THEIR SHORTLIST \(10 of 30\)/);
  });

  it('omits a figure it does not hold rather than guessing a zero', () => {
    // No journey times supplied — no commute claimed.
    const text = shortlistBrief({ profile: profile(), areas: ['Balham'] });
    assert.equal(/min commute/.test(text), false);
  });
});
