import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gapRow } from '../dataGaps';

/**
 * Only the row shape is tested here, and deliberately so: the write itself
 * is one push() call, while the SHAPE is the thing carrying a promise — that
 * this can never become a channel for question text or a user id.
 * database.rules.json enforces the same limits server-side; these keep the
 * client honest before it gets there.
 */
describe('what gets sent when the Agent cannot answer', () => {
  it('carries the area, the gaps, and nothing else', () => {
    const row = gapRow('Angel', ['crime', 'schools near this area'], true)!;
    assert.deepEqual(Object.keys(row).sort(), ['area', 'fellBack', 'missing']);
    assert.equal(row.area, 'Angel');
    assert.deepEqual(row.missing, ['crime', 'schools near this area']);
    assert.equal(row.fellBack, true);
  });

  it('has no field that could hold a question or a person', () => {
    // The finding is "eleven questions hit an area with no crime data".
    // Which eleven, and how they phrased it, adds nothing and would turn a
    // counter into personal data needing a lawful basis.
    const raw = JSON.stringify(gapRow('Angel', ['crime'], true));
    assert.equal(/uid|user|question|text|said|name/i.test(raw), false);
  });

  it('still sends a row when nothing was missing — that is the denominator', () => {
    // Without clean answers counted, a rising gap count could just mean the
    // Agent is being used more.
    const row = gapRow('Angel', [], false)!;
    assert.deepEqual(row.missing, []);
    assert.equal(row.fellBack, false);
  });

  it('refuses a row with no area', () => {
    assert.equal(gapRow('   ', ['crime'], false), null);
    assert.equal(gapRow('', [], false), null);
  });

  it('trims to the limits the database rules enforce', () => {
    const row = gapRow('A'.repeat(200), ['B'.repeat(200)], false)!;
    assert.equal(row.area.length, 80);
    assert.equal(row.missing[0].length, 60);
  });

  it('caps how many gaps one question can report', () => {
    const many = Array.from({ length: 40 }, (_, i) => `gap${i}`);
    assert.equal(gapRow('Angel', many, false)!.missing.length, 12);
  });

  it('drops empty entries rather than storing blanks', () => {
    const row = gapRow('Angel', ['crime', '  ', ''], false)!;
    assert.deepEqual(row.missing, ['crime']);
  });
});
