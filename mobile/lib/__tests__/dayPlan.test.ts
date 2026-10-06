import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activitiesFromTags, activitiesIn, changesTheDay, choosePlace, clock, daySubtitle, dayTitle, excludedIn, fitsActivity, greenSpacesNear, isProperPark, parseWindow, planSlots } from '../dayPlan';

const acts = (said: string, likes = [] as ReturnType<typeof activitiesIn>) =>
  planSlots(parseWindow(said), activitiesIn(said), likes, []).map((s) => s.activity);

describe('planning a day out', () => {
  it('reads the time they have', () => {
    assert.deepEqual(parseWindow('plan me a day in Clapham Common'), { start: 9.5, end: 21.5, part: 'day' });
    assert.equal(parseWindow('actually I just have an afternoon').part, 'afternoon');
    assert.equal(parseWindow('plan us an evening in Brixton').part, 'evening');
    assert.equal(parseWindow('plan a morning in Herne Hill').part, 'morning');
    assert.equal(parseWindow("we're free from 2pm").start, 14);
    assert.deepEqual(parseWindow('plan something from 2 to 6'), { start: 14, end: 18, part: 'afternoon' });
    assert.equal(parseWindow('a day out until 5pm').end, 17);
  });

  it('reads a range however it is said (Nick: "between 2 and 6" began at 12)', () => {
    for (const said of [
      'I only have an afternoon between 2 and 6',
      'between 2pm and 6pm',
      'we are free 2-6',
      'from 2 till 6',
      'plan something from 2 to 6',
    ]) {
      const w = parseWindow(said);
      assert.equal(w.start, 14, said);
      assert.equal(w.end, 18, said);
    }
    assert.deepEqual(parseWindow('between 10 and 1'), { start: 10, end: 13, part: 'morning' });
    // A follow-up with only a range still counts as a change of hours.
    assert.ok(changesTheDay('actually only between 2 and 6'));
  });

  it('starts the plan when they are free, not before', () => {
    const w = parseWindow('I only have an afternoon between 2 and 6');
    const slots = planSlots(w, [], ['brunch', 'walk', 'pub', 'dinner'], []);
    assert.ok(slots.length >= 2);
    assert.ok(slots.every((x) => x.at >= 14 && x.at < 18), slots.map((x) => x.at).join());
  });

  it('never plans a morning brunch into an afternoon (Nick)', () => {
    const a = acts('actually I just have an afternoon', ['brunch', 'walk', 'pub']);
    assert.ok(!a.includes('brunch'), a.join());
    assert.ok(a.includes('walk') && a.includes('pub'), a.join());
  });

  it('plans an evening as drinks and dinner', () => {
    assert.deepEqual(acts('plan us an evening in Brixton'), ['drinks', 'dinner']);
  });

  it('puts what they asked for first, in time order', () => {
    const a = acts('plan a day of brunch and galleries in Peckham');
    assert.equal(a[0], 'brunch');
    assert.ok(a.includes('gallery'));
  });

  it('builds a whole day from what they like', () => {
    const slots = planSlots(parseWindow('plan me a Saturday in Clapham Common'), [], ['brunch', 'walk', 'pub'], ['dinner']);
    assert.deepEqual(slots.map((s) => s.activity), ['brunch', 'walk', 'pub', 'dinner']);
    for (let i = 1; i < slots.length; i++) assert.ok(slots[i].at > slots[i - 1].at, 'in time order');
    assert.equal(clock(slots[0].at), '10am');
  });

  it('keeps every stop inside the window', () => {
    const w = parseWindow('from 2 to 6');
    for (const s of planSlots(w, [], ['brunch', 'coffee', 'walk', 'pub', 'dinner'], [])) {
      assert.ok(s.at >= w.start && s.at < w.end, `${s.activity} at ${s.at}`);
    }
  });

  it('hears what people say they like', () => {
    assert.deepEqual(activitiesIn('we love a brunch then a long walk and ending up in the pub'), ['brunch', 'walk', 'pub']);
    assert.deepEqual(activitiesFromTags(['cafe_culture', 'big_park_nearby', 'period_property']), ['coffee', 'walk']);
  });

  it('picks the well rated place that is a short walk on', () => {
    const area = { lat: 51.4618, lng: -0.1384 };
    const prev = { lat: 51.4618, lng: -0.1384 };
    const near = { id: 'near', lat: 51.4625, lng: -0.1390, rating: 4.5, ratingCount: 400 };
    const far = { id: 'far', lat: 51.4700, lng: -0.1250, rating: 4.7, ratingCount: 400 };
    const thin = { id: 'thin', lat: 51.4620, lng: -0.1386, rating: 5, ratingCount: 4 };
    assert.equal(choosePlace([far, near, thin], area, prev, new Set())?.id, 'near');
    assert.equal(choosePlace([near], area, prev, new Set(['near'])), null, 'never the same place twice');
  });

  it('writes a title and a line for the card', () => {
    assert.equal(dayTitle('Clapham Common', parseWindow('just an afternoon')), 'An afternoon in Clapham Common');
    assert.equal(daySubtitle([{ activity: 'brunch', at: 10 }, { activity: 'walk', at: 11.5 }, { activity: 'pub', at: 15.5 }]), 'Brunch, a walk, then the pub');
  });

  it('knows a change to the plan from a new question', () => {
    assert.ok(changesTheDay('actually i just have an afternoon'));
    assert.ok(changesTheDay('skip the pub'));
    assert.ok(changesTheDay('can we start from 2pm'));
    assert.ok(!changesTheDay("what's the crime like in Balham"));
    assert.deepEqual(excludedIn('no brunch and skip the pub'), ['brunch', 'pub']);
  });

  it('walks somewhere proper, never a pocket park (Nick: Mellison Rd Pocket Park)', () => {
    assert.equal(isProperPark('Mellison Rd Pocket Park'), false);
    assert.equal(isProperPark('Garratt Lane Playground'), false);
    assert.equal(isProperPark('Tooting Bec Common'), true);
    // Tooting Broadway has no park of its own in the data: the real green
    // spaces within about a mile, biggest first.
    const greens = greenSpacesNear({ lat: 51.4275, lng: -0.168 });
    assert.ok(greens.length > 0);
    assert.equal(greens[0].name, 'Tooting Bec Common');
    assert.ok(greens.every((g) => g.hectares >= 5 && isProperPark(g.name)));
  });

  it('only counts walks as a like when they say they enjoy them', () => {
    assert.ok(!activitiesIn("it's a 5 min walk to the station, all within walking distance").includes('walk'));
    assert.ok(!activitiesIn('can we walk to work from there').includes('walk'));
    assert.ok(activitiesIn('we love long walks on the common').includes('walk'));
    assert.ok(activitiesIn('we usually go for a walk on Sundays').includes('walk'));
  });

  it('never sends them to a mini-mart as "a market" (Nick: Peckham Rye)', () => {
    const place = (name: string, primaryType: string | null) => ({ name, primaryType });
    assert.equal(fitsActivity('market', place('Rye Lane Food & Wine', 'liquor_store')), false);
    assert.equal(fitsActivity('market', place('Peckham Mini Market', null)), false);
    assert.equal(fitsActivity('market', place('Peckham Market', 'convenience_store')), false);
    assert.equal(fitsActivity('market', place('Market Superstore', 'supermarket')), false);
    assert.equal(fitsActivity('market', place('Costcutter', 'grocery_store')), false);
    assert.equal(fitsActivity('market', place('Brixton Village', 'market')), true);
    assert.equal(fitsActivity('market', place('Herne Hill Market', 'farmers_market')), true);
    assert.equal(fitsActivity('market', place('Maltby Street Market', 'tourist_attraction')), true);
    assert.equal(fitsActivity('market', place('Market Wines', 'liquor_store')), false);
  });

  it('a gallery is a gallery, and no stop is ever a corner shop', () => {
    const place = (name: string, primaryType: string | null) => ({ name, primaryType });
    assert.equal(fitsActivity('gallery', place('South London Gallery', 'art_gallery')), true);
    assert.equal(fitsActivity('gallery', place('Frame Express', 'home_goods_store')), false);
    assert.equal(fitsActivity('gallery', place('Rye Lane Art Supplies', 'art_supply_store')), false);
    assert.equal(fitsActivity('pub', place('The Gowlett Arms', 'pub')), true);
    assert.equal(fitsActivity('pub', place('Bargain Booze', 'liquor_store')), false);
    assert.equal(fitsActivity('drinks', place('Peckham Off Licence', null)), false);
    assert.equal(fitsActivity('dinner', place('Pizza Express', 'pizza_restaurant')), true);
    assert.equal(fitsActivity('pub', place('The Local', 'pub')), true);
  });
});
