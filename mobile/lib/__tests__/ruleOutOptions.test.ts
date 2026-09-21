import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RULE_OUT_OPTIONS, matchRuleOutOptions, splitFreeText } from '../ruleOutOptions';

describe('the places you can rule out', () => {
  it('offers real place names, not ward names', () => {
    // The identities file calls places things like "Cathall" and
    // "Beckenham Town & Copers Cope" — ward names nobody says out loud, so
    // none of them belong in a list a person reads. Station names are the
    // names Londoners actually use, ampersands and all ("Harrow &
    // Wealdstone" is a real place; "Bickley & Sundridge" is a ward).
    assert.ok(RULE_OUT_OPTIONS.length > 400);
    assert.ok(RULE_OUT_OPTIONS.includes('Canary Wharf'));
    assert.ok(RULE_OUT_OPTIONS.includes('Harrow & Wealdstone'));
    for (const ward of ['Cathall', 'Bruce Castle', 'Courtfield', 'Beckenham Town & Copers Cope']) {
      assert.ok(!RULE_OUT_OPTIONS.includes(ward), `${ward} is a ward name`);
    }
  });

  it('is sorted, and says each place once', () => {
    assert.deepEqual(RULE_OUT_OPTIONS, [...new Set(RULE_OUT_OPTIONS)]);
    assert.deepEqual(RULE_OUT_OPTIONS, [...RULE_OUT_OPTIONS].sort((a, b) => a.localeCompare(b)));
  });

  it('leads with what the typing starts, not merely contains', () => {
    const hits = matchRuleOutOptions('clap', []);
    assert.ok(hits.length > 0);
    assert.ok(hits[0].toLowerCase().startsWith('clap'), `got ${hits[0]}`);
  });

  it('ignores case', () => {
    assert.deepEqual(matchRuleOutOptions('CANARY', []), matchRuleOutOptions('canary', []));
  });

  it('never offers something already chosen', () => {
    const first = matchRuleOutOptions('canary', [])[0];
    assert.ok(!matchRuleOutOptions('canary', [first]).includes(first));
  });

  it('says nothing at all until something is typed', () => {
    assert.deepEqual(matchRuleOutOptions('', []), []);
    assert.deepEqual(matchRuleOutOptions('   ', []), []);
  });

  it('caps the list, because it renders inline under the box', () => {
    // "e" matches a great many stations.
    assert.ok(matchRuleOutOptions('e', []).length <= 6);
  });

  it('splits a typed answer into the places it names', () => {
    assert.deepEqual(splitFreeText('Croydon, Barking and Dagenham'), [
      'Croydon',
      'Barking',
      'Dagenham',
    ]);
    assert.deepEqual(splitFreeText('   '), []);
  });

  it('leaves a phrase that is not a place as one string', () => {
    // It matches nothing downstream, which is correct — the model still
    // sees it, and ruleOuts.ts matches whole words against real names.
    assert.deepEqual(splitFreeText('anywhere in east London'), ['anywhere in east London']);
  });
});
