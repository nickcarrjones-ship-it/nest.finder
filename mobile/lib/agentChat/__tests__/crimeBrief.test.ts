import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAreaBrief, briefForPrompt } from '../areaBrief';

/**
 * Crime reaches the Agent as comparisons, never a verdict, and the West End
 * and City get totals only (Nick, 2026-09-30).
 */
describe('crime in the area brief', () => {
  it('gives a residential area rates and a London comparison', () => {
    const text = briefForPrompt(buildAreaBrief('Balham', null));
    assert.match(text, /Crime \(police\.uk/);
    assert.match(text, /per 1,000 homes/);
    assert.match(text, /of London areas/);
    assert.match(text, /never call anywhere "safe"/);
  });

  it('gives a commercial centre totals only, flagged as not comparable', () => {
    const text = briefForPrompt(buildAreaBrief('Oxford Circus', null));
    assert.match(text, /COMMERCIAL CENTRE/);
    assert.doesNotMatch(text, /per 1,000 homes/);
    assert.doesNotMatch(text, /of London areas/);
  });

  it('no longer lists crime as missing where we have it', () => {
    assert.ok(!buildAreaBrief('Balham', null).missing.includes('crime here'));
  });
});
