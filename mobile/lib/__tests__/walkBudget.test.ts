import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAreaBudgets,
  computeMemberBudgets,
  possibleBudgets,
  MIN_WALK_BUDGET_MINS,
  MAX_WALK_BUDGET_MINS,
} from '../walkBudget';
import type { Area, JourneyTimes, Profile } from '../types';

const areas: Area[] = [
  { name: 'Fast', lat: 51.5, lng: -0.1 },
  { name: 'Middling', lat: 51.5, lng: -0.11 },
  { name: 'Marginal', lat: 51.5, lng: -0.12 },
  { name: 'TooFar', lat: 51.5, lng: -0.13 },
];

// Two people with DIFFERENT walks at the work end — the case that makes the
// binding constraint swap between them.
const profile: Profile = {
  sharedCommuteLimit: true,
  maxCommuteMins: 50,
  members: [
    { id: 'a', name: 'A', workId: 'cw', workLabel: 'Canary Wharf', offWalk: 5 },
    { id: 'b', name: 'B', workId: 'hol', workLabel: 'Holborn', offWalk: 12 },
  ],
};

const times: JourneyTimes = {
  Fast:     { cw: 10, hol: 12 },   // budgets 35 / 26 -> 26, capped to 15
  Middling: { cw: 30, hol: 20 },   // budgets 15 / 18 -> 15
  Marginal: { cw: 43, hol: 20 },   // budgets  2 / 18 ->  2, below the floor
  TooFar:   { cw: 60, hol: 60 },   // negative
};

describe('computeAreaBudgets — how much walking each area affords', () => {
  it('caps generous budgets rather than promising a half-hour walk', () => {
    const got = computeAreaBudgets(areas, times, profile);
    const fast = got.find((b) => b.area.name === 'Fast');
    assert.equal(fast?.budget, MAX_WALK_BUDGET_MINS);
  });

  it('takes the tighter of the two people, since they share one walk', () => {
    const got = computeAreaBudgets(areas, times, profile);
    const fast = got.find((b) => b.area.name === 'Fast');
    // A has 35 spare, B only 26 — B is the constraint even though A is slower
    // to their own desk.
    assert.equal(fast?.limitedBy, 1);
  });

  it('drops areas below the floor — you cannot live in a ticket hall', () => {
    const got = computeAreaBudgets(areas, times, profile);
    assert.ok(!got.some((b) => b.area.name === 'Marginal'));
  });

  it('drops areas nobody can reach at all', () => {
    const got = computeAreaBudgets(areas, times, profile);
    assert.ok(!got.some((b) => b.area.name === 'TooFar'));
  });

  it('never returns a budget below the floor or above the cap', () => {
    for (const b of computeAreaBudgets(areas, times, profile)) {
      assert.ok(b.budget >= MIN_WALK_BUDGET_MINS);
      assert.ok(b.budget <= MAX_WALK_BUDGET_MINS);
    }
  });

  it('ignores areas with no journey data instead of crashing', () => {
    const got = computeAreaBudgets(
      [...areas, { name: 'Unknown', lat: 0, lng: 0 }], times, profile,
    );
    assert.ok(!got.some((b) => b.area.name === 'Unknown'));
  });

  it('a longer walk at the work end shrinks the search area', () => {
    const patient: Profile = {
      ...profile,
      members: [profile.members[0], { ...profile.members[1], offWalk: 25 }],
    };
    const before = computeAreaBudgets(areas, times, profile).length;
    const after = computeAreaBudgets(areas, times, patient).length;
    assert.ok(after <= before);
  });
});

describe('computeMemberBudgets — one person at a time', () => {
  it('judges an area on that person alone, ignoring their partner', () => {
    // Marginal is dropped for the household (A only has 2 spare) but B alone
    // has 18, so it is perfectly fine for B.
    const forB = computeMemberBudgets(areas, times, profile, 1);
    assert.ok(forB.some((b) => b.area.name === 'Marginal'));
  });

  it('returns nothing for a member who does not exist', () => {
    assert.deepEqual(computeMemberBudgets(areas, times, profile, 9), []);
  });
});

describe('possibleBudgets — why precomputing isochrones is viable', () => {
  it('is a small fixed set whatever the limits and work walks', () => {
    const all = possibleBudgets();
    assert.equal(all[0], MIN_WALK_BUDGET_MINS);
    assert.equal(all[all.length - 1], MAX_WALK_BUDGET_MINS);
    assert.equal(all.length, MAX_WALK_BUDGET_MINS - MIN_WALK_BUDGET_MINS + 1);
  });

  it('covers every budget the calculation can actually produce', () => {
    const allowed = new Set(possibleBudgets());
    for (let limit = 20; limit <= 60; limit += 5) {
      for (let walk = 0; walk <= 30; walk++) {
        const p: Profile = {
          ...profile, maxCommuteMins: limit,
          members: [{ ...profile.members[0], offWalk: walk }],
        };
        for (const b of computeAreaBudgets(areas, times, p)) {
          assert.ok(allowed.has(b.budget), `budget ${b.budget} outside the set`);
        }
      }
    }
  });
});
