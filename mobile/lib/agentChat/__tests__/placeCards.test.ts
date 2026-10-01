import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { socialLinks, toPlaceCard, typeLabel } from '../placeCards';

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

  it('searches TikTok for the topic and opens the area hashtag on Instagram', () => {
    const s = socialLinks('Tooting Bec', 'drink');
    assert.equal(s.tiktok, 'https://www.tiktok.com/search?q=best%20pubs%20Tooting%20Bec');
    assert.equal(s.instagram, 'https://www.instagram.com/explore/tags/tootingbec/');
    assert.equal(socialLinks("Shepherd's Bush", 'general').instagram, 'https://www.instagram.com/explore/tags/shepherdsbush/');
  });
});
