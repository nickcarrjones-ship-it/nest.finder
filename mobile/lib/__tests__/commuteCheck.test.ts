import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCommute, inSharedZone, indexRings } from '../commuteCheck';

// A square around (0,0) and one around (1,1), as [lng, lat] rings.
const sq = (x: number, y: number) => [[x - 0.1, y - 0.1], [x + 0.1, y - 0.1], [x + 0.1, y + 0.1], [x - 0.1, y + 0.1], [x - 0.1, y - 0.1]];

describe('commute zone check', () => {
  it('is in the zone only when inside a catchment of EVERY member', () => {
    const a = indexRings([sq(0, 0), sq(1, 1)]);
    const b = indexRings([sq(0, 0)]);
    assert.equal(inSharedZone(0, 0, [a, b]), true);
    assert.equal(inSharedZone(1, 1, [a, b]), false, 'only member A can reach it');
    assert.equal(inSharedZone(5, 5, [a, b]), false);
  });

  it('is never in the zone with no members', () => {
    assert.equal(inSharedZone(0, 0, []), false);
  });

  it('estimates door to desk for the slowest member', () => {
    const stations = [{ name: 'S', lat: 51.5, lng: -0.1 }] as never;
    const jt = { S: { w1: 20, w2: 35 } } as never;
    const profile = { members: [{ name: 'A', workId: 'w1' }, { name: 'B', workId: 'w2', offWalk: 5 }] } as never;
    // On the station itself: walk 0, so the slowest is 35 + 5.
    assert.equal(estimateCommute({ lat: 51.5, lng: -0.1 }, stations, jt, profile), 40);
  });
});
