import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asksForARoute, chipLabel, swapsThePlace, describeRoutes, isValidRoute, lineColour, placeName, type PersonRoute, type RouteLeg } from '../routes';

const leg = (mode: string, line: string, from: string, to: string, mins: number): RouteLeg =>
  ({ mode, line, from, to, mins, path: [[51.44, -0.18], [51.5, -0.11]] });

// What TfL actually returned for Earlsfield on 2026-10-02.
const nick: PersonRoute = {
  name: 'Nick',
  office: 'Canary Wharf',
  route: {
    mins: 42,
    legs: [
      leg('national-rail', 'South Western Railway', 'Earlsfield Rail Station', 'London Waterloo Rail Station', 15),
      leg('tube', 'Jubilee', 'Waterloo Underground Station', 'Canary Wharf Underground Station', 10),
      leg('walking', '', 'Canary Wharf Underground Station', 'Canary Wharf Rail Station', 9),
    ],
  },
};
const harriet: PersonRoute = {
  name: 'Harriet',
  office: 'Holborn',
  route: {
    mins: 30,
    legs: [
      leg('national-rail', 'South Western Railway', 'Earlsfield Rail Station', 'London Waterloo Rail Station', 16),
      leg('walking', '', 'London Waterloo Rail Station', 'Waterloo Station / Tenison Way', 5),
      leg('bus', '59', 'Waterloo Station / Tenison Way', 'Holborn Station', 9),
    ],
  },
};

describe('routes', () => {
  it('names stops the way a Londoner would', () => {
    assert.equal(placeName('London Waterloo Rail Station'), 'Waterloo');
    assert.equal(placeName('Waterloo Underground Station'), 'Waterloo');
    assert.equal(placeName('Waterloo Station / Tenison Way'), 'Waterloo');
    assert.equal(placeName('Canary Wharf Underground Station'), 'Canary Wharf');
    assert.equal(placeName('Holborn Station'), 'Holborn');
    assert.equal(placeName('London Bridge Rail Station'), 'London Bridge', 'its "London" is its name');
    assert.equal(placeName("London King's Cross Rail Station"), "King's Cross");
  });

  it('says the shared stretch once, then each person by name', () => {
    assert.equal(
      describeRoutes('Earlsfield', [nick, harriet]),
      "From Earlsfield, you'd both take South Western Railway to Waterloo. Then Nick takes the Jubilee line to Canary Wharf (42 min in all), and Harriet walks 5 minutes and gets the 59 bus to Holborn (30 min in all).",
    );
  });

  it('speaks to one person directly', () => {
    assert.equal(
      describeRoutes('Earlsfield', [nick]),
      'From Earlsfield, take South Western Railway to Waterloo, then the Jubilee line to Canary Wharf. About 42 minutes in all.',
    );
  });

  it('never uses an em dash', () => {
    assert.ok(!describeRoutes('Earlsfield', [nick, harriet]).includes('—'));
  });

  it('knows a route question when it sees one', () => {
    for (const q of ["Whats our route to work from Earlsfield", 'how would I get to work from Balham', 'which line would we take from Tooting', "what's the commute like from Brixton", 'how do we get into town from Peckham']) {
      assert.ok(asksForARoute(q), q);
    }
    for (const q of ['what are the pubs like in Earlsfield', 'is Balham safe', 'any good pizza here']) {
      assert.ok(!asksForARoute(q), q);
    }
  });

  it('treats a short "what about X" as the same question about a new place', () => {
    for (const q of ['What about Tooting', 'what about tooting?', 'and Balham?', 'How about Brixton then', 'Tooting?', 'What about Tooting Broadway']) {
      assert.ok(swapsThePlace(q), q);
    }
    assert.ok(!swapsThePlace('is it a nice place to bring up children in Tooting'));
  });

  it('uses TfL colours, charcoal for National Rail', () => {
    assert.equal(lineColour({ mode: 'tube', line: 'Jubilee' }), '#A0A5A9');
    assert.equal(lineColour({ mode: 'bus', line: '59' }), '#DC241F');
    assert.equal(lineColour({ mode: 'national-rail', line: 'South Western Railway' }), '#3C4248');
    assert.equal(chipLabel(nick.route.legs[0]), 'SWR');
    assert.equal(chipLabel(harriet.route.legs[2]), '59 bus');
  });

  it('rejects anything that is not a route', () => {
    assert.ok(isValidRoute(nick.route));
    assert.ok(!isValidRoute({ error: 'no_route' }));
    assert.ok(!isValidRoute({ mins: 3, legs: [] }));
  });
});
