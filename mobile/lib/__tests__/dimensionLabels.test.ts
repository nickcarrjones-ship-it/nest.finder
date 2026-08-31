import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSION_LABELS, labelFor, traitsSentence } from '../similarity/dimensionLabels';
import { DIMENSIONS } from '../similarity/features';

describe('every dimension can be said out loud', () => {
  // The type is Record<Dimension, string>, so a missing one fails the
  // build — this covers the other direction and the quality of the phrase.
  it('has a phrase for every dimension the engine compares', () => {
    for (const d of DIMENSIONS) {
      assert.equal(typeof DIMENSION_LABELS[d], 'string', `${d} has no phrase`);
      assert.ok(DIMENSION_LABELS[d].length > 3, `${d}'s phrase is too short to read`);
    }
  });

  it('never quotes the raw busyness figure', () => {
    // TfL's percentageOfBaseLine has no published definition, so an
    // absolute value would be dishonest — comparisons are all it supports.
    for (const d of ['peak', 'satNight', 'weekdayMorning'] as const) {
      assert.ok(!/%|percent|baseline/i.test(DIMENSION_LABELS[d]), `${d} implies a raw figure`);
    }
  });

  it('returns null for something that is not a dimension', () => {
    assert.equal(labelFor('vibes'), null);
  });
});

describe('reading the shared traits back', () => {
  it('joins three into a sentence a person would say', () => {
    const got = traitsSentence(['majorParkHa', 'cafeShare', 'satNight']);
    assert.equal(
      got,
      'a big park within walking distance, how many cafés there are and how busy they get on a Saturday night',
    );
  });

  it('does not put a comma in a pair', () => {
    assert.equal(traitsSentence(['majorParkHa', 'cafeShare']).includes(','), false);
  });

  it('caps at three — beyond that it is a readout, not a reason', () => {
    const got = traitsSentence(['majorParkHa', 'cafeShare', 'satNight', 'houseShare', 'venues']);
    assert.equal(got.includes('how much of the housing is houses'), false);
  });

  it('drops a key it has no words for rather than printing it raw', () => {
    assert.equal(traitsSentence(['majorParkHa', 'notADimension']), 'a big park within walking distance');
  });

  it('is empty when there is nothing to say', () => {
    assert.equal(traitsSentence([]), '');
  });
});
