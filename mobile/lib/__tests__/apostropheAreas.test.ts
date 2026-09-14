import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { areasAskedAbout } from '../agentChat/areaBrief';

/**
 * London is full of possessives, and the data spells them inconsistently.
 *
 * "Queens Park", "St Johns Wood" and "Regents Park" are stored without an
 * apostrophe; "Shepherd's Bush" and "Earl's Court" are stored with one.
 * The matcher compared raw lowercase text against raw lowercase names, so
 * it broke in BOTH directions depending on which spelling a person
 * happened to use — and a miss was total silence, indistinguishable from
 * the app being broken (Nick, 2026-09-14).
 *
 * Both sides now go through normaliseName, which is what that helper was
 * written for; this was the one place that did not use it.
 */
describe('areas with an apostrophe in the name', () => {
  it('resolves when the person types the apostrophe and the data omits it', () => {
    for (const [said, expected] of [
      ["Plan me a chill Sunday in Queen's Park", 'Queens Park'],
      ["tell me about St John's Wood", 'St Johns Wood'],
      ["what about Regent's Park?", 'Regents Park'],
    ] as const) {
      const found = areasAskedAbout(said);
      assert.ok(found.includes(expected), `${said} -> ${JSON.stringify(found)}`);
    }
  });

  it('resolves when the data has the apostrophe and the person does not', () => {
    for (const [said, expected] of [
      ['what about Shepherds Bush?', "Shepherd's Bush"],
      ['is Earls Court expensive?', "Earl's Court"],
    ] as const) {
      const found = areasAskedAbout(said);
      assert.ok(found.includes(expected), `${said} -> ${JSON.stringify(found)}`);
    }
  });

  it('handles the curly apostrophe a phone keyboard inserts', () => {
    // iOS substitutes ’ for ' as you type, so the version that reaches us
    // is usually not the one on the key.
    assert.ok(areasAskedAbout('what about Queen’s Park?').includes('Queens Park'));
  });

  it('still resolves an ordinary name with no apostrophe anywhere', () => {
    assert.deepEqual(areasAskedAbout('what about Balham?'), ['Balham']);
  });

  it('documents a SEPARATE gap: a shortened multi-word name still misses', () => {
    /**
     * Not an apostrophe problem, and not fixed here — "Kings Cross" fails
     * with or without one, because the area is stored as "Kings Cross St
     * Pancras" and "kings" is a deliberate stop word (it appears in too
     * many London names to match on alone).
     *
     * Asserted rather than left unsaid so the limit is visible, and so
     * whoever fixes it finds a test already pointing at the behaviour.
     */
    assert.deepEqual(areasAskedAbout("what's King's Cross like?"), []);
    assert.deepEqual(areasAskedAbout('what about Kings Cross St Pancras?'), [
      'Kings Cross St Pancras',
    ]);
  });
});
