import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toneFor } from '../ratingTone';

describe('ratingTone — colouring a judgement written as prose', () => {
  it('reads the legacy grades', () => {
    assert.equal(toneFor('Outstanding'), 'good');
    assert.equal(toneFor('Good'), 'good');
    assert.equal(toneFor('Requires improvement'), 'mixed');
    assert.equal(toneFor('Inadequate'), 'concern');
  });

  it('reads the report-card categories', () => {
    assert.equal(toneFor('Exceptional'), 'good');
    assert.equal(toneFor('Strong standard'), 'good');
    assert.equal(toneFor('Expected standard'), 'good');
    assert.equal(toneFor('Needs attention'), 'mixed');
    assert.equal(toneFor('Urgent improvement'), 'concern');
    assert.equal(toneFor('Met'), 'good');
    assert.equal(toneFor('Not met'), 'concern');
  });

  it('reads the ungraded free text, including a caveat inside a positive sentence', () => {
    assert.equal(toneFor('School remains Good'), 'good');
    assert.equal(toneFor('School remains Outstanding'), 'good');
    assert.equal(toneFor('Improved significantly'), 'good');
    assert.equal(toneFor('Standards maintained'), 'good');
    // The case this was built for: "remains Good" alone would read as
    // good, but the sentence carries a real caveat that must win.
    assert.equal(toneFor('School remains Good (Concerns) - S5 Next'), 'mixed');
    assert.equal(toneFor('School remains Outstanding (Concerns) - S5 Next'), 'mixed');
    assert.equal(toneFor('Some aspects not as strong'), 'mixed');
  });

  it('is case-insensitive', () => {
    assert.equal(toneFor('INADEQUATE'), 'concern');
    assert.equal(toneFor('good'), 'good');
  });
});
