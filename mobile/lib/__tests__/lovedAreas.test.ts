import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveLovedOrder, reorderToPosition } from '../lovedAreas';

describe('the order loved areas appear in', () => {
  it('numbers a freshly loved area next, with no decision required', () => {
    // "At first, they need to be ranked in position 1, 2, 3, 4, 5,
    // whatever" — nobody has to choose an order for this to work.
    const order = effectiveLovedOrder({ Balham: 'love', Angel: 'love' }, undefined);
    assert.deepEqual(order, ['Balham', 'Angel']);
  });

  it('puts anything deliberately ranked first, in the order it was ranked', () => {
    const order = effectiveLovedOrder(
      { Balham: 'love', Angel: 'love', Brixton: 'love' },
      ['Brixton', 'Angel'],
    );
    assert.deepEqual(order, ['Brixton', 'Angel', 'Balham']);
  });

  it('drops an area that is no longer loved, rather than leaving a gap', () => {
    const order = effectiveLovedOrder({ Balham: 'love', Angel: 'hate' }, ['Angel', 'Balham']);
    assert.deepEqual(order, ['Balham']);
  });

  it('ignores a hated area even if it lingers in a stale ranked list', () => {
    const order = effectiveLovedOrder({ Balham: 'love' }, ['Croydon']);
    assert.deepEqual(order, ['Balham']);
  });

  it('is empty when nothing is loved', () => {
    assert.deepEqual(effectiveLovedOrder(undefined, undefined), []);
    assert.deepEqual(effectiveLovedOrder({}, []), []);
  });
});

describe('moving an area to a preferred position', () => {
  it('moves it to #1, pushing the rest down', () => {
    assert.deepEqual(
      reorderToPosition(['Balham', 'Angel', 'Brixton'], 'Brixton', 1),
      ['Brixton', 'Balham', 'Angel'],
    );
  });

  it('moves it to #2, between the areas that stay either side', () => {
    assert.deepEqual(
      reorderToPosition(['Balham', 'Angel', 'Brixton'], 'Brixton', 2),
      ['Balham', 'Brixton', 'Angel'],
    );
  });

  it('leaves the list alone in shape when it is already there', () => {
    assert.deepEqual(
      reorderToPosition(['Balham', 'Angel', 'Brixton'], 'Balham', 1),
      ['Balham', 'Angel', 'Brixton'],
    );
  });

  it('clamps a position past the end of the list', () => {
    assert.deepEqual(
      reorderToPosition(['Balham', 'Angel'], 'Angel', 99),
      ['Balham', 'Angel'],
    );
  });

  it('does nothing destructive to a name not in the list', () => {
    // Not a real use case — the UI only offers this for a loved area
    // already in the order — but it must not silently invent an entry.
    assert.deepEqual(reorderToPosition(['Balham'], 'Croydon', 1), ['Croydon', 'Balham']);
  });
});
