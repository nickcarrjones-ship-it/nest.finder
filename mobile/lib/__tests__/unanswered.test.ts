import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scrubQuestion, unansweredRow, MAX_QUESTION_LENGTH } from '../unanswered';
import { weaveReply, IMPROVING_NOTE } from '../agentChat/parse';

/**
 * The scrubber is the promise: question text is kept, but never the thing
 * that says whose question it was or where they live.
 */
describe('scrubbing an unanswered question', () => {
  it('keeps an ordinary question as it was asked', () => {
    assert.equal(scrubQuestion('Is Peckham safe at night?'), 'Is Peckham safe at night?');
  });

  it('removes a street address', () => {
    const out = scrubQuestion('What is the crime like near 12 Elm Road in Balham?');
    assert.ok(!out.includes('12 Elm Road'), out);
    assert.ok(out.includes('[address]'));
    assert.ok(out.includes('Balham'));
  });

  it('removes flat numbers', () => {
    assert.ok(!scrubQuestion('we saw flat 3b yesterday').includes('3b'));
  });

  it('removes full and partial postcodes', () => {
    const out = scrubQuestion('Does SW4 7AB flood? What about SE15?');
    assert.ok(!/SW4|7AB|SE15/i.test(out), out);
  });

  it('removes emails and phone numbers', () => {
    const out = scrubQuestion('email me at nick@example.com or call 07700 900123');
    assert.ok(!out.includes('example.com'), out);
    assert.ok(!out.includes('900123'), out);
  });

  it('removes long numbers such as references', () => {
    assert.ok(!scrubQuestion('listing 167753189 any good?').includes('167753189'));
  });

  it('caps the length', () => {
    assert.equal(scrubQuestion('a'.repeat(1000)).length, MAX_QUESTION_LENGTH);
  });
});

describe('the row that is saved', () => {
  it('carries no user id', () => {
    const row = unansweredRow('Is Brixton safe?', 'area', ['Brixton']);
    assert.deepEqual(Object.keys(row ?? {}).sort(), ['areas', 'kind', 'q']);
  });

  it('keeps at most two areas', () => {
    assert.equal(unansweredRow('x y z', 'compare', ['A', 'B', 'C'])?.areas?.length, 2);
  });

  it('drops a question with nothing left in it', () => {
    assert.equal(unansweredRow('  ', 'general'), null);
  });
});

describe('telling the household when we cannot answer', () => {
  it('adds the improving note only when our data did not cover it', () => {
    const miss = weaveReply({ answer: "I don't have crime figures for Peckham yet.", unmeasured: null, coveredByData: false });
    assert.ok(miss.endsWith(IMPROVING_NOTE), miss);
    const hit = weaveReply({ answer: 'Flats sell for about £450k.', unmeasured: null, coveredByData: true });
    assert.ok(!hit.includes(IMPROVING_NOTE));
    assert.ok(!IMPROVING_NOTE.includes('—'), 'no em dash in app copy');
  });
});
