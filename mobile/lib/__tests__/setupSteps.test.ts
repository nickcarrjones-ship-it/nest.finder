import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_STEPS,
  TAP_STEPS,
  SETUP_STEPS,
  TOTAL_STEPS,
  setupProgress,
  currentStepNumber,
} from '../setupSteps';

describe('the setup spine', () => {
  it('is three typed and four tapped', () => {
    assert.equal(CHAT_STEPS.length, 3);
    assert.equal(TAP_STEPS.length, 4);
    assert.equal(TOTAL_STEPS, 7);
  });

  it('has no duplicate ids — the progress line keys off them', () => {
    const ids = SETUP_STEPS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('asks for the anchor first', () => {
    // Everything downstream is "somewhere like the place you named", so
    // this cannot drift down the list without changing the product.
    assert.equal(CHAT_STEPS[0].id, 'anchor');
    assert.equal(CHAT_STEPS[1].id, 'anchorReason');
  });
});

describe('progress the line can show', () => {
  it('starts empty and ends full', () => {
    assert.equal(setupProgress(0, 0), 0);
    assert.equal(setupProgress(3, 4), 1);
  });

  it('advances by one seventh per answer', () => {
    assert.equal(setupProgress(1, 0), 1 / 7);
    assert.equal(setupProgress(3, 0), 3 / 7);
    assert.equal(setupProgress(3, 2), 5 / 7);
  });

  // The model and the app drift: the model has declared the conversation
  // over while the answer count still read short, and vice versa. A bar
  // past 100% is worse than one that sits at it.
  it('never overflows when the model and the count disagree', () => {
    assert.equal(setupProgress(99, 99), 1);
    assert.equal(setupProgress(5, 0), CHAT_STEPS.length / TOTAL_STEPS);
  });

  it('never goes backwards past empty', () => {
    assert.equal(setupProgress(-3, 0), 0);
  });
});

describe('the step number shown to the user', () => {
  it('is 1-based — nobody is on step zero', () => {
    assert.equal(currentStepNumber(0, 0), 1);
  });

  it('counts the taps on from the conversation', () => {
    assert.equal(currentStepNumber(3, 0), 4);
    assert.equal(currentStepNumber(3, 3), 7);
  });

  it('stops at the last step rather than promising an eighth', () => {
    assert.equal(currentStepNumber(3, 4), TOTAL_STEPS);
    assert.equal(currentStepNumber(99, 99), TOTAL_STEPS);
  });
});
