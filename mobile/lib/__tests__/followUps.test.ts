import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { followUpQuestions, intentOf } from '../agentChat/followUps';
import { rankingAsked, asksForTheRest } from '../areaRanking';
import { asksForARoute } from '../routes';
import { friendTopic } from '../agentChat/friend';
import { areasAskedAbout } from '../agentChat/areaBrief';
import { asksForAnOuting } from '../agentChat/outing';

const ctx = { areas: ['Balham', 'Clapham Common', 'Peckham Rye'], asked: [], schools: true };

describe('follow-up questions after every answer (Nick: tailored, from our data)', () => {
  it('moves sideways from an area answer: route, prices, a comparison', () => {
    const out = followUpQuestions({ kind: 'area', area: 'Balham' }, ctx);
    assert.equal(out.length, 3);
    assert.ok(out.every((q) => q.includes('Balham')), out.join(' | '));
    assert.ok(out.some((q) => asksForARoute(q)));
    assert.ok(out.some((q) => /Balham or Clapham Common/.test(q)));
  });

  it('never suggests what they already asked, however they worded it', () => {
    const out = followUpQuestions({ kind: 'area', area: 'Balham' }, { ...ctx, asked: ['how do we get to work from Balham'] });
    assert.ok(!out.some((q) => asksForARoute(q)), out.join(' | '));
  });

  it('after a ranking: the rest, a day in the winner, another ranking', () => {
    const out = followUpQuestions({ kind: 'ranking', theme: 'nightlife', winner: 'Clapham Common', more: true }, ctx);
    assert.equal(out[0], 'Show me the rest of the order');
    assert.equal(out[1], 'Plan an evening in Clapham Common');
    const noMore = followUpQuestions({ kind: 'ranking', theme: 'nightlife', winner: 'Clapham Common', more: false }, ctx);
    assert.ok(!noMore.includes('Show me the rest of the order'));
  });

  it('leaves out schools for a household that said they do not matter', () => {
    const out = followUpQuestions({ kind: 'day', area: 'Balham' }, { ...ctx, asked: [route('Balham'), 'flats in Balham cost?', 'plan a saturday in clapham common'], schools: false });
    assert.ok(!out.some((q) => /school/i.test(q)), out.join(' | '));
    const families = followUpQuestions({ kind: 'ranking', theme: 'quiet', winner: null, more: false }, { ...ctx, schools: false });
    assert.ok(!families.some((q) => /family/i.test(q)), families.join(' | '));
  });

  it('after a comparison, ranks all their areas on the same thing', () => {
    const out = followUpQuestions({ kind: 'compare', areas: ['Balham', 'Peckham Rye'], topic: 'cafe' }, ctx);
    assert.equal(rankingAsked(out[0]), 'cafes');
  });

  it('suggests nothing when there was nothing to follow', () => {
    assert.deepEqual(followUpQuestions({ kind: 'none' }, ctx), []);
  });
});

function route(a: string) { return `What's our route to work from ${a}?`; }

describe('every suggestion lands on the answer it is meant for', () => {
  it('ranking questions are read as rankings, on the right theme', () => {
    const themes = ['nightlife', 'food', 'cafes', 'quiet', 'busy', 'young', 'families', 'safety', 'commute'] as const;
    for (const t of themes) {
      const q = followUpQuestions({ kind: 'ranking', theme: t, winner: null, more: false }, { ...ctx, areas: [] });
      for (const s of q) assert.ok(rankingAsked(s), `${t}: "${s}" is not read as a ranking`);
    }
    assert.ok(asksForTheRest('Show me the rest of the order'));
  });

  it('places, comparisons and days go where they should', () => {
    assert.equal(friendTopic("Where's good for brunch in Balham?"), 'cafe');
    assert.equal(friendTopic("What's the food like in Balham?"), 'food');
    assert.equal(friendTopic('What are the pubs like in Balham?'), 'drink');
    assert.equal(areasAskedAbout('Balham or Clapham Common for pubs?').length, 2);
    assert.ok(asksForAnOuting('Plan a Saturday in Balham'));
    assert.ok(asksForAnOuting('Plan an evening in Balham'));
    assert.equal(intentOf(route('Balham')), intentOf('how do we get to work from Balham'));
  });
});
