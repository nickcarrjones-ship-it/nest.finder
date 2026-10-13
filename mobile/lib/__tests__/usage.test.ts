import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_ID, installIdFrom, toLabel, updateLabel, usageRow } from '../usage';

const ID = 'a'.repeat(32);

describe('anonymous usage rows', () => {
  it('builds the smallest row the rules accept', () => {
    assert.deepEqual(usageRow('app_open', {}, ID, '1.1.0', 'embedded'), { e: 'app_open', i: ID, v: '1.1.0', u: 'embedded' });
  });

  it('keeps one small number and one short label, nothing else', () => {
    const row = usageRow('commute_set', { n: 45.2, k: 'Map' }, ID, '1.1.0', '01a12be7');
    assert.deepEqual(row, { e: 'commute_set', i: ID, v: '1.1.0', u: '01a12be7', n: 45, k: 'map' });
    const extra = usageRow('tab_view', { k: 'agent', email: 'x@y.z' } as never, ID, '1.1.0', 'embedded');
    assert.equal(Object.keys(extra ?? {}).includes('email'), false);
  });

  it('drops numbers the rules would refuse', () => {
    assert.equal(usageRow('commute_set', { n: -1 }, ID, '1.1.0', 'embedded')?.n, undefined);
    assert.equal(usageRow('commute_set', { n: 1000 }, ID, '1.1.0', 'embedded')?.n, undefined);
    assert.equal(usageRow('commute_set', { n: Number.NaN }, ID, '1.1.0', 'embedded')?.n, undefined);
  });

  it('refuses a malformed install id, version or event', () => {
    assert.equal(usageRow('app_open', {}, 'not-an-id', '1.1.0', 'embedded'), null);
    assert.equal(usageRow('app_open', {}, ID, 'v1', 'embedded'), null);
    assert.equal(usageRow('made_up' as never, {}, ID, '1.1.0', 'embedded'), null);
  });

  it('turns free text into a safe label, or nothing', () => {
    assert.equal(toLabel('Viewings'), 'viewings');
    assert.equal(toLabel('(tabs)/index'), 'tabs_index');
    assert.equal(toLabel('!!!'), undefined);
    assert.equal(toLabel(undefined), undefined);
    assert.equal(toLabel('x'.repeat(40))?.length, 24);
  });

  it('makes install ids and update labels in the accepted shape', () => {
    const id = installIdFrom(new Uint8Array(16).map((_, i) => i * 17));
    assert.match(id, INSTALL_ID);
    assert.equal(updateLabel('01A12BE7-5C3D-4E1F-9A2B-3C4D5E6F7A8B'), '01a12be7');
    assert.equal(updateLabel(null), 'embedded');
  });
});
