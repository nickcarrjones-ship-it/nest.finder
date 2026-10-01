import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { instagramAreaUrl, socialLinks, toPlaceCard, typeLabel } from '../placeCards';

describe('place cards and social links', () => {
  it('turns Google types into short labels', () => {
    assert.equal(typeLabel('indian_restaurant'), 'Indian');
    assert.equal(typeLabel('coffee_shop'), 'Café');
    assert.equal(typeLabel('pub'), 'Pub');
    assert.equal(typeLabel(null), null);
  });

  it('measures the walk from the station', () => {
    const card = toPlaceCard(
      { id: 'x', name: 'Barra10', rating: 4.7, ratingCount: 300, primaryType: 'spanish_restaurant', lat: 51.4275, lng: -0.168 },
      { name: 'Tooting Broadway', lat: 51.4275, lng: -0.1680 + 0.007 },
      null,
    );
    assert.equal(card.station, 'Tooting Broadway');
    assert.ok(card.walkMins >= 5 && card.walkMins <= 7, String(card.walkMins));
  });

  it('follows the topic on TikTok and Instagram', () => {
    const pubs = socialLinks('Earlsfield', 'drink');
    assert.equal(pubs.tiktok, 'https://www.tiktok.com/search?q=Earlsfield%20pubs');
    assert.equal(pubs.instagram, 'https://www.instagram.com/explore/search/keyword/?q=earlsfield%20pubs');
    assert.match(socialLinks('Earlsfield', 'cafe').instagram, /earlsfield%20coffee/);
    assert.match(socialLinks('Earlsfield', 'food', 'pizza').instagram, /earlsfield%20pizza/);
  });

  it('uses the area hashtag for a broad question and the map card', () => {
    assert.equal(socialLinks('Tooting Bec', 'general').instagram, 'https://www.instagram.com/explore/tags/tootingbec/');
    assert.equal(instagramAreaUrl("Shepherd's Bush"), 'https://www.instagram.com/explore/tags/shepherdsbush/');
  });
});
