import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asksForAnAmenity, pickNearby, walkMinutes, composeAmenities } from '../agentChat/amenities';
import type { Place } from '../placesClient';

const place = (over: Partial<Place> = {}): Place => ({
  id: 'p1', name: 'A Place', address: '', lat: 51.5, lng: -0.1,
  rating: 4.5, ratingCount: 100, photoName: null, ...over,
});

describe('spotting a question about local amenities', () => {
  it('catches the ones Nick asked for by name', () => {
    assert.equal(asksForAnAmenity('where are the GP surgeries in Tooting Broadway?')?.query, 'GP surgery');
    assert.equal(asksForAnAmenity('what gyms are there in Balham?')?.query, 'gym');
    assert.equal(asksForAnAmenity("what's the best rated takeaway round there?")?.query, 'takeaway');
  });

  it('only pays for ratings when they asked for the best', () => {
    // Ratings move the request into Places' Enterprise bucket, which has a
    // fifth of the free monthly allowance - so this is a billing decision,
    // not a wording one.
    assert.equal(asksForAnAmenity('where is the nearest pharmacy?')?.wantsBest, false);
    assert.equal(asksForAnAmenity('best pub near Balham?')?.wantsBest, true);
  });

  it('needs an actual ask, not just a mention', () => {
    // Somebody describing themselves is not asking for a list of addresses.
    assert.equal(asksForAnAmenity('we go to the gym a lot'), null);
    assert.equal(asksForAnAmenity('I work in a pub'), null);
  });

  it('leaves schools and parks to our own data', () => {
    // We hold every school within reach with its verbatim Ofsted wording,
    // and the nearest park by name and hectares. Places would be worse.
    assert.equal(asksForAnAmenity('where are the best schools in Balham?'), null);
    assert.equal(asksForAnAmenity('are there any parks nearby?'), null);
  });

  it('is not triggered by an ordinary area question', () => {
    assert.equal(asksForAnAmenity('what is Balham like?'), null);
    assert.equal(asksForAnAmenity('is Balham or Tooting better?'), null);
  });
});

describe('keeping amenities inside the ten minute walk', () => {
  const from = { lat: 51.5, lng: -0.1 };

  it('drops anything beyond the walk, however good', () => {
    // The Places radius is a bias, not a fence - a search near here will
    // happily return the best answer a mile away.
    const far = place({ id: 'far', lat: 51.52, lng: -0.1, rating: 5 });
    const near = place({ id: 'near', lat: 51.5005, lng: -0.1, rating: 3.5 });
    assert.deepEqual(pickNearby([far, near], from).map((p) => p.id), ['near']);
  });

  it('drops anything with no coordinates to check', () => {
    assert.deepEqual(pickNearby([place({ lat: undefined as never })], from), []);
  });

  it('puts the better-rated first', () => {
    const a = place({ id: 'a', rating: 4.1 });
    const b = place({ id: 'b', rating: 4.8 });
    assert.deepEqual(pickNearby([a, b], from).map((p) => p.id), ['b', 'a']);
  });

  it('never reports a zero minute walk', () => {
    assert.ok(walkMinutes(from, from) >= 1);
  });
});

describe('what it says back', () => {
  const ask = { query: 'gym', label: 'gyms', wantsBest: false };

  it('treats finding nothing as a real answer about the area', () => {
    const out = composeAmenities('Balham', ask, []);
    assert.match(out, /couldn't find any gyms/);
    assert.match(out, /ten minute walk/);
  });

  it('names the best one when that is what was asked', () => {
    const out = composeAmenities('Balham', { ...ask, wantsBest: true }, [place({ name: 'Gym A' })]);
    assert.match(out, /Gym A/);
  });
});
