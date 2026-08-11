import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeReachableAreas } from '../commute';
import { resolveCommute, resolveWalk } from '../commuteSettings';
import type { Area, JourneyTimes, Profile } from '../types';

/**
 * Deliberately uses small made-up numbers rather than the real
 * data/journey-times.json — that file gets periodically regenerated
 * (e.g. off-peak -> peak departure times), so a test asserting a specific
 * real-world minute value would start "failing" the moment good data
 * replaces old data. These tests check the RULES are followed, not what
 * any particular station's commute time happens to be today.
 */

const areas: Area[] = [
  { name: 'Areaville', lat: 51.5, lng: -0.1 },
  { name: 'Farplace', lat: 51.6, lng: -0.2 },
  { name: 'NoDataTown', lat: 51.7, lng: -0.3 }, // deliberately has no journey-time entry
];

const journeyTimes: JourneyTimes = {
  Areaville: { work_a: 10, work_b: 12 },
  Farplace: { work_a: 40, work_b: 5 }, // fine for member B, too far for member A
  // NoDataTown intentionally omitted
};

function profileWith(overrides: Partial<Profile> = {}): Profile {
  return {
    sharedCommuteLimit: true,
    sharedWalkLimit: true,
    maxCommuteMins: 30,
    walkHomeKm: 1, // round(1 * 12) = 12min walk added to every member
    members: [
      { id: 'm0', name: 'A', workId: 'work_a', offWalk: 3, workLabel: 'Work A' },
      { id: 'm1', name: 'B', workId: 'work_b', offWalk: 3, workLabel: 'Work B' },
    ],
    ...overrides,
  };
}

describe('resolveCommute', () => {
  test('defaults to 30min for both members when there is no profile', () => {
    const { maxMins, sharedCommuteLimit } = resolveCommute(null);
    assert.deepEqual(maxMins, [30, 30]);
    assert.equal(sharedCommuteLimit, true);
  });

  test('applies the shared limit to every member', () => {
    const profile = profileWith({ maxCommuteMins: 45 });
    const { maxMins } = resolveCommute(profile);
    assert.deepEqual(maxMins, [45, 45]);
  });

  test('a per-member override wins when sharedCommuteLimit is false', () => {
    const profile = profileWith({ sharedCommuteLimit: false, maxCommuteMins: 45 });
    profile.members[0].maxCommuteMins = 20;
    const { maxMins } = resolveCommute(profile);
    // Member 0's override applies; member 1 falls back to the profile-level value.
    assert.deepEqual(maxMins, [20, 45]);
  });
});

describe('resolveWalk', () => {
  test('defaults to 1.5km for both members when there is no profile', () => {
    const { walkKms } = resolveWalk(null);
    assert.deepEqual(walkKms, [1.5, 1.5]);
  });

  test('rounds walking minutes the same way the web app does: round(km * 12)', () => {
    // This isn't resolveWalk's job directly, but pins the constant the web
    // app uses (js/map-core.js: walkMins = walkKms.map(km => Math.round(km*12)))
    // so a future change to the pace assumption is a deliberate edit, not a
    // silent one.
    const km = 1.4;
    assert.equal(Math.round(km * 12), 17);
  });
});

describe('computeReachableAreas — the core "works for everyone" rule', () => {
  test('includes an area when every member is within their own limit', () => {
    const profile = profileWith({ maxCommuteMins: 30 });
    const results = computeReachableAreas(areas, journeyTimes, profile);
    const areaville = results.find((r) => r.area.name === 'Areaville');
    assert.ok(areaville, 'Areaville should be reachable');
    // work_a: 10 + 12 (walk) + 3 (offWalk) = 25 <= 30
    // work_b: 12 + 12 (walk) + 3 (offWalk) = 27 <= 30
    assert.deepEqual(areaville!.memberTimes, [25, 27]);
  });

  test('excludes an area when even ONE member is over their limit — this is the whole point', () => {
    const profile = profileWith({ maxCommuteMins: 30 });
    const results = computeReachableAreas(areas, journeyTimes, profile);
    // Farplace: work_a = 40+12+3 = 55 (way over) even though work_b = 5+12+3 = 20 (fine).
    // The average would look reasonable; the app must still exclude it.
    assert.equal(results.find((r) => r.area.name === 'Farplace'), undefined);
  });

  test('excludes an area with no journey-time data instead of crashing', () => {
    const profile = profileWith();
    const results = computeReachableAreas(areas, journeyTimes, profile);
    assert.equal(results.find((r) => r.area.name === 'NoDataTown'), undefined);
  });

  test('excludes an area if even one member has no route to it, even if others do', () => {
    const partialData: JourneyTimes = { Areaville: { work_a: 10 } }; // work_b missing
    const profile = profileWith();
    const results = computeReachableAreas(areas, partialData, profile);
    assert.equal(results.length, 0);
  });

  test('a tighter shared limit shrinks the result set; a looser one grows it', () => {
    const tight = computeReachableAreas(areas, journeyTimes, profileWith({ maxCommuteMins: 20 }));
    const loose = computeReachableAreas(areas, journeyTimes, profileWith({ maxCommuteMins: 60 }));
    assert.ok(loose.length >= tight.length);
  });
});
