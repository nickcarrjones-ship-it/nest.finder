import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { suggestedQuestions } from '../agentChat/suggestions';
import type { Profile } from '../types';

const profile = (over: Partial<Profile> = {}): Profile => ({ members: [], ...over });

describe('what the Agent tab offers to be asked', () => {
  it('uses the areas they said they love', () => {
    const out = suggestedQuestions(profile({ areaCards: { Balham: 'love', Peckham: 'love' } }));
    assert.ok(out.some((q) => q.includes('Balham')));
    assert.ok(out.some((q) => q.includes('Peckham')));
  });

  it('falls back to the shortlist when they have loved nothing', () => {
    const out = suggestedQuestions(profile(), ['Tooting', 'Brixton']);
    assert.ok(out.some((q) => q.includes('Tooting')));
  });

  it('asks about their own shortlist when there are no areas at all', () => {
    // These route to the general answer, which reads the profile and the
    // top ten - so they work before anywhere has been named.
    const out = suggestedQuestions(profile());
    assert.ok(out.length > 0);
    assert.ok(out.every((q) => !q.includes('undefined')), out.join(' | '));
  });

  it('never offers a comparison against nothing', () => {
    // One area must not produce "Balham or undefined?".
    const out = suggestedQuestions(profile({ areaCards: { Balham: 'love' } }));
    assert.ok(out.every((q) => !q.includes('undefined')), out.join(' | '));
    assert.ok(!out.some((q) => / or \?/.test(q)));
  });

  it('offers questions the app actually answers well', () => {
    const out = suggestedQuestions(profile({ areaCards: { Balham: 'love', Peckham: 'love' } }));
    // Per-type prices and schools are both measured; a day out is looked
    // up from real venues. None of these is a guess.
    assert.ok(out.some((q) => /flats cost/.test(q)));
    assert.ok(out.some((q) => /schools/.test(q)));
  });

  it('keeps it to a readable number', () => {
    const out = suggestedQuestions(profile({ areaCards: { Balham: 'love', Peckham: 'love', Angel: 'love' } }));
    assert.ok(out.length <= 4, `got ${out.length}`);
  });
});
