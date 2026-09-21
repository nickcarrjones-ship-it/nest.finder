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
  it('is three typed and three tapped', () => {
    // "North or south of the river?" was dropped on 2026-09-21 — the app
    // exists to broaden where somebody looks, and that question invited
    // them to narrow it before seeing anything. Zone 1 went the same day,
    // not because it stopped being asked but because it now shares the
    // rule-out screen: same question, one page, one step.
    assert.equal(CHAT_STEPS.length, 3);
    assert.equal(TAP_STEPS.length, 3);
    assert.equal(TOTAL_STEPS, 6);
  });

  it('never asks which side of the river', () => {
    assert.ok(!SETUP_STEPS.some((s) => s.id === 'river'), 'the river question is gone');
  });

  it('has no step of its own for Zone 1 — it rides on the rule-out screen', () => {
    assert.ok(!SETUP_STEPS.some((s) => s.id === 'zone1'));
    assert.ok(SETUP_STEPS.some((s) => s.id === 'ruleOut'));
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

  it('advances by one step per answer, out of the real total', () => {
    // Derived rather than hardcoded, so removing or adding a question
    // cannot leave the bar quietly describing a different survey.
    assert.equal(setupProgress(1, 0), 1 / TOTAL_STEPS);
    assert.equal(setupProgress(3, 0), 3 / TOTAL_STEPS);
    assert.equal(setupProgress(3, 2), 5 / TOTAL_STEPS);
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
    // Derived, not hardcoded: questions have been added and removed twice
    // now, and a literal here just means rewriting this test every time
    // rather than checking anything about how the two halves join up.
    assert.equal(currentStepNumber(CHAT_STEPS.length, 0), CHAT_STEPS.length + 1);
    assert.equal(currentStepNumber(CHAT_STEPS.length, TAP_STEPS.length - 1), TOTAL_STEPS);
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
    // Every fixed step answered, of TOTAL_STEPS + 1 once a clarification
    // is queued — the queued one is counted from the moment it exists.
    assert.equal(setupProgress(3, 4, 1), 7 / (TOTAL_STEPS + 1));
  });

  it('reaches exactly full with the extra answered', () => {
    // Every fixed tap, plus the clarification itself.
    assert.equal(setupProgress(3, TAP_STEPS.length + 1, 1), 1);
    assert.equal(currentStepNumber(3, TAP_STEPS.length + 1, 1), TOTAL_STEPS + 1);
  });

  it('does not reach full while the extra is outstanding', () => {
    assert.ok(setupProgress(3, TAP_STEPS.length, 1) < 1);
  });

  it('still clamps when the counts overshoot', () => {
    assert.equal(setupProgress(99, 99, 2), 1);
    assert.equal(currentStepNumber(99, 99, 2), TOTAL_STEPS + 2);
  });
});
