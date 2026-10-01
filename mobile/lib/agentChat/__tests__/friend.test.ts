import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { friendTopic, keepRated, placeBrief } from '../friend';

describe('friend-style answers', () => {
  it('reads what kind of question it is', () => {
    assert.equal(friendTopic("What's the high street like in Tooting Broadway?"), 'general');
    assert.equal(friendTopic('Any good pubs in Balham?'), 'drink');
    assert.equal(friendTopic('Where is good to eat in Brixton?'), 'food');
    assert.equal(friendTopic('Nice cafes for brunch in Clapham?'), 'cafe');
    assert.equal(friendTopic('Is Peckham safe?'), null);
  });

  it('keeps chicken shops and takeaways out of the rated restaurants', () => {
    const kept = keepRated([
      { name: 'Dosa n Chutny', rating: 4.5, ratingCount: 900, primaryType: 'indian_restaurant' },
      { name: 'Chicken Cottage', rating: 4.1, ratingCount: 300, primaryType: 'restaurant' },
      { name: 'Some Grill', rating: 4.4, ratingCount: 200, primaryType: 'fast_food_restaurant' },
      { name: 'Tiny New Place', rating: 5, ratingCount: 4, primaryType: 'restaurant' },
    ], 'food');
    assert.deepEqual(kept.map((p) => p.name), ['Dosa n Chutny']);
  });

  it('only covers what was asked', () => {
    const pubs = placeBrief('Tooting Broadway', 'drink') ?? '';
    assert.match(pubs, /Pubs:/);
    assert.doesNotMatch(pubs, /Restaurants, nearest first/);
    const all = placeBrief('Tooting Broadway', 'general') ?? '';
    assert.match(all, /Markets:/);
    assert.match(all, /Chains are \d+% of the restaurants/);
  });
});
