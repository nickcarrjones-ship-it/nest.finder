import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cuisineAsked, friendTopic, googleQueryFor, keepRated, placeBrief } from '../friend';

describe('friend-style answers', () => {
  it('reads what kind of question it is', () => {
    assert.equal(friendTopic("What's the high street like in Tooting Broadway?"), 'general');
    assert.equal(friendTopic('Any good pubs in Balham?'), 'drink');
    assert.equal(friendTopic('Where is good to eat in Brixton?'), 'food');
    assert.equal(friendTopic('Nice cafes for brunch in Clapham?'), 'cafe');
    assert.equal(friendTopic('Is Peckham safe?'), null);
  });

  it('treats a named cuisine as a food question and searches for it', () => {
    const q = 'I love pizza is there any good pizza spots';
    assert.equal(friendTopic(q), 'food');
    assert.equal(cuisineAsked(q), 'pizza');
    assert.equal(googleQueryFor('food', q), 'pizza restaurant');
    assert.equal(googleQueryFor('food', 'where is good to eat'), 'restaurant');
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
    assert.match(all, /Mostly independents|restaurants are chains/);
  });

  it('says how many in words, never as a count', () => {
    const all = placeBrief('Tooting Broadway', 'general') ?? '';
    assert.doesNotMatch(all, /(Sit-down restaurants|Pubs|takeaways, separately): \d/);
    assert.doesNotMatch(all, /Most common cuisines[^\n]*\d/);
    assert.doesNotMatch(all, /\d+%/);
  });

  it('treats the club scene as a night out, and looks up clubs', () => {
    const q = "what's the club scene like in Clapham Common";
    assert.equal(friendTopic(q), 'drink');
    assert.equal(googleQueryFor('drink', q), 'night club');
    assert.equal(googleQueryFor('drink', 'any good cocktail bars in Soho'), 'cocktail bar');
    assert.equal(googleQueryFor('drink', 'what are the pubs like'), 'pub');
    assert.notEqual(friendTopic('is there a tennis club in Balham'), 'drink');
  });
});
