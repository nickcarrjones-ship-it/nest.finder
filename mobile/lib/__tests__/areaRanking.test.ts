import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asksForTheRest, describeRanking, describeTheRest, rankAreas, rankingAsked, whichSets, type RankKind } from '../areaRanking';
import type { Profile } from '../types';

const ASKED = 'Which of the Maloca areas and the ones I love is busiest at night and has a vibrant nightlife';
const areas: { name: string; kind: RankKind }[] = [
  { name: 'Earlsfield', kind: 'love' }, { name: 'Tooting Broadway', kind: 'love' },
  { name: 'Balham', kind: 'love' }, { name: 'Clapham Common', kind: 'love' },
  { name: 'Brixton', kind: 'pick' }, { name: 'Herne Hill', kind: 'pick' },
  { name: 'East Dulwich', kind: 'pick' }, { name: 'Peckham Rye', kind: 'pick' },
];
const profile: Profile = { members: [] };

describe('ranking their areas', () => {
  it('knows Nick\'s question, and that he meant both lists', () => {
    assert.equal(rankingAsked(ASKED), 'nightlife');
    assert.deepEqual(whichSets(ASKED), { love: true, pick: true });
  });

  it('knows the other ways of asking, and leaves one-area questions alone', () => {
    assert.equal(rankingAsked('rank my areas for food'), 'food');
    assert.equal(rankingAsked('which of my areas is safest'), 'safety');
    assert.equal(rankingAsked('which of our areas has the easiest commute'), 'commute');
    assert.equal(rankingAsked('which of the picks is quietest'), 'quiet');
    assert.deepEqual(whichSets('which of the picks is quietest'), { love: false, pick: true });
    assert.equal(rankingAsked("what's the nightlife like in Brixton"), null);
  });

  it('puts Clapham Common top for nightlife and Earlsfield at the quiet end', () => {
    const r = rankAreas('nightlife', areas, { profile });
    assert.equal(r.rows[0].name, 'Clapham Common');
    assert.equal(r.rows[r.rows.length - 1].name, 'Earlsfield');
    assert.equal(r.rows[0].score, 1);
    assert.equal(r.rows[r.rows.length - 1].score, 0);
  });

  it('says plainly which were judged on part of the data', () => {
    const r = rankAreas('nightlife', areas, { profile });
    const partial = r.rows.filter((x) => x.partial).map((x) => x.name).sort();
    assert.deepEqual(partial, ['East Dulwich', 'Herne Hill', 'Peckham Rye']);
    // Only the podium is shown, so the note only names the podium's.
    assert.match(r.footnote ?? '', /^Herne Hill: no night-time travel data/);
  });

  it('never puts a number on screen, or an em dash', () => {
    for (const theme of ['nightlife', 'food', 'cafes', 'quiet', 'busy', 'young', 'families', 'safety'] as const) {
      const r = rankAreas(theme, areas, { profile });
      const text = [describeRanking(r), r.title, r.subtitle, r.footnote ?? '', ...r.rows.map((x) => x.reason)].join(' ');
      assert.doesNotMatch(text, /\d/, theme);
      assert.doesNotMatch(text, /—/, theme);
    }
  });

  it('ranks the commute by the slowest of them, with minutes', () => {
    const household: Profile = {
      members: [
        { id: 'a', name: 'Nick', workId: 'canary_wharf', workLabel: 'Canary Wharf' },
        { id: 'b', name: 'Harriet', workId: 'holborn', workLabel: 'Holborn' },
      ],
    };
    const jt = { Earlsfield: { canary_wharf: 42, holborn: 30 }, Brixton: { canary_wharf: 30, holborn: 25 } };
    const r = rankAreas('commute', [{ name: 'Earlsfield', kind: 'love' }, { name: 'Brixton', kind: 'pick' }], { profile: household, journeyTimes: jt });
    assert.equal(r.rows[0].name, 'Brixton');
    assert.match(r.rows[0].reason, /Nick about 30 min/);
  });

  it('writes the answer as a sentence about the winner', () => {
    const r = rankAreas('nightlife', areas, { profile });
    assert.match(describeRanking(r), /^Clapham Common comes out top for nightlife: /);
    assert.doesNotMatch(describeRanking(r), /Earlsfield/, 'only the top three are talked about');
  });

  it('lists places four onwards when they ask about the rest', () => {
    const r = rankAreas('nightlife', areas, { profile });
    for (const q of ['what about the rest?', 'and the others?', 'show me positions 4 to 8', 'who came fourth']) assert.ok(asksForTheRest(q), q);
    const rest = describeTheRest(r).split('\n');
    assert.equal(rest[0], 'The rest, for nightlife:');
    assert.match(rest[1], /^4\. /);
    assert.match(rest[rest.length - 1], /^8\. Earlsfield \(you love\): quiet after dark/);
  });
});
