import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asksForAnOuting, composeOuting, type PlannedStop } from '../agentChat/outing';

const stop = (name: string, reason: string, address: string | null = null): PlannedStop => ({
  plan: { query: 'q', because: 'cafe_culture', reason },
  place: { id: 'p', name, address, lat: null, lng: null },
});

describe('spotting a request for something to do', () => {
  it('catches the ways people actually ask', () => {
    for (const said of [
      'plan a chill sunday in Queens Park',
      'plan me a day in Balham',
      'what should we do in Peckham?',
      'things to do in Hackney',
      'where can we eat in Brixton?',
      'where should I get coffee around Angel',
      "what's there to do in Deptford",
      'give me an itinerary for Clapham',
    ]) {
      assert.equal(asksForAnOuting(said), true, `missed: ${said}`);
    }
  });

  it('leaves factual questions alone', () => {
    // A false positive is worse than a miss: someone who asked what an
    // area is LIKE gets a list of cafés instead of an answer.
    for (const said of [
      'is Balham busy on a Sunday?',
      'what about Queens Park?',
      'how long is the commute from Peckham',
      'can we afford Clapham',
      'what are the schools like in Angel',
      'is it a quiet area at the weekend',
      'we are moving in March',
    ]) {
      assert.equal(asksForAnOuting(said), false, `false positive: ${said}`);
    }
  });
});

describe('the itinerary as somebody reads it', () => {
  it('names each place and why it is on the list', () => {
    const text = composeOuting('Queens Park', [
      stop('Milk Beach', 'You said the cafés matter — this is the one to try first.', '1 Lonsdale Rd'),
      stop('Queens Park', 'The green space you said you wanted within walking distance.'),
    ]);
    assert.match(text, /Queens Park/);
    assert.match(text, /Milk Beach — 1 Lonsdale Rd/);
    assert.match(text, /cafés matter/);
    // The reason is the point — a list without it is just a search result.
    assert.match(text, /green space you said you wanted/);
  });

  it('says so plainly when there was nothing to suggest', () => {
    const text = composeOuting('Nowhere', []);
    assert.match(text, /couldn't find enough/);
    // Still ends with something useful rather than an apology.
    assert.match(text, /worth a wander/i);
  });

  it('omits the dash when a place has no address', () => {
    const text = composeOuting('Balham', [stop('The Bedford', 'A local rather than a destination.')]);
    assert.ok(!text.includes('The Bedford —'), 'no trailing dash without an address');
  });
});
