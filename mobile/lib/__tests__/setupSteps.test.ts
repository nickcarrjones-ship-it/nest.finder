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
    assert.equal(TAP_STEPS.length, 5);
    assert.equal(TOTAL_STEPS, 8);
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
    assert.equal(setupProgress(3, 5), 1);
  });

  it('advances by one eighth per answer', () => {
    assert.equal(setupProgress(1, 0), 1 / 8);
    assert.equal(setupProgress(3, 0), 3 / 8);
    assert.equal(setupProgress(3, 2), 5 / 8);
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
    assert.equal(currentStepNumber(3, 5), TOTAL_STEPS);
    assert.equal(currentStepNumber(99, 99), TOTAL_STEPS);
  });
});

describe('deferred clarifications lengthen the run', () => {
  // "Which Clapham?" is only asked when someone names an ambiguous area,
  // so eight is the floor, not the number.
  it('counts an extra tap into the total', () => {
    // 3 typed + 5 fixed taps answered, of 9 total once one clarification
    // is queued — eight ninths, not eight eighths.
    assert.equal(setupProgress(3, 5, 1), 8 / 9);
  });

  it('reaches exactly full with the extra answered', () => {
    assert.equal(setupProgress(3, 6, 1), 1);
    assert.equal(currentStepNumber(3, 6, 1), 9);
  });

  it('does not reach full while the extra is outstanding', () => {
    assert.ok(setupProgress(3, 5, 1) < 1);
  });

  it('still clamps when the counts overshoot', () => {
    assert.equal(setupProgress(99, 99, 2), 1);
    assert.equal(currentStepNumber(99, 99, 2), 10);
  });
});
