import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRuleOuts, isRuledOut, ruledOutNames } from '../ranking/ruleOuts';
import { applyCommercialCoreFilter, isCommercialCore } from '../ranking/commercialCore';
import type { AreaCandidate } from '../ranking/prompt';

const candidate = (neighbourhood: string, stations: string[] = [neighbourhood]): AreaCandidate => ({
  neighbourhood,
  stations,
  lat: 51.5,
  lng: -0.02,
  commuteMins: 10,
  walkBudgetMins: 15,
  pocketSize: stations.length,
});

describe('the area someone ruled out', () => {
  // The exact failure: Canary Wharf was ruled out and came back first,
  // with its whole DLR ring behind it (2026-08-30).
  it('is removed, not merely ranked lower', () => {
    const candidates = [
      candidate('Canary Wharf'),
      candidate('Poplar'),
      candidate('Peckham Rye'),
    ];
    const kept = applyRuleOuts(candidates, { 'Canary Wharf': 'hate' });
    assert.deepEqual(kept.map((c) => c.neighbourhood), ['Poplar', 'Peckham Rye']);
  });

  it('is caught by its STATION even when the area is named something else', () => {
    // Neighbourhood names come from ward boundaries and are often not what
    // anyone says — "Blackwall & Cubitt Town" contains Canary Wharf station.
    const hood = candidate('Blackwall and Cubitt Town', ['Canary Wharf', 'Blackwall']);
    assert.equal(isRuledOut(hood, ['Canary Wharf']), true);
  });

  it('takes its grouped areas with it', () => {
    // Ruling out "Clapham" has to mean all of it, or naming an area rather
    // than a station quietly does nothing.
    const candidates = [
      candidate('Clapham Common'),
      candidate('Clapham Junction'),
      candidate('Brixton'),
    ];
    const kept = applyRuleOuts(candidates, { Clapham: 'hate' });
    assert.deepEqual(kept.map((c) => c.neighbourhood), ['Brixton']);
  });

  // KNOWN over-match, asserted so it is a decision rather than a surprise.
  // No string rule separates "Clapham Common is part of Clapham" from
  // "Victoria Park is not part of Victoria" — that is geography, not text.
  // Since the Canary Wharf failure was UNDER-removal, the broad rule wins:
  // showing someone the area they rejected is worse than hiding one they
  // might have liked.
  it('over-matches a shared first word, deliberately', () => {
    const kept = applyRuleOuts([candidate('Victoria Park')], { Victoria: 'hate' });
    assert.deepEqual(kept, []);
  });

  it('does not match a name that merely contains the letters', () => {
    assert.equal(isRuledOut(candidate('Poplar'), ['Pop']), false);
    assert.equal(isRuledOut(candidate('Barking'), ['Bark']), false);
  });

  it('survives punctuation and casing differences', () => {
    assert.equal(isRuledOut(candidate("King's Cross"), ['kings cross']), true);
    assert.equal(isRuledOut(candidate('Shepherd’s Bush'), ["Shepherd's Bush"]), true);
  });
});

describe('what is left alone', () => {
  it('keeps loved areas — only hates are rule-outs', () => {
    const kept = applyRuleOuts([candidate('Peckham Rye')], { 'Peckham Rye': 'love' });
    assert.equal(kept.length, 1);
  });

  it('changes nothing when nobody ruled anything out', () => {
    const candidates = [candidate('Poplar'), candidate('Brixton')];
    assert.equal(applyRuleOuts(candidates, undefined), candidates);
    assert.equal(applyRuleOuts(candidates, {}), candidates);
  });

  it('lists only the hated names', () => {
    assert.deepEqual(
      ruledOutNames({ Brixton: 'love', Croydon: 'hate', Barking: 'hate' }),
      ['Croydon', 'Barking'],
    );
  });
});

describe('when the rule-out empties the list', () => {
  // Deliberately unlike applyZone1Filter, which hands back everything rather
  // than return nothing. A list made entirely of the areas someone rejected
  // is worse than no list.
  it('returns nothing rather than the areas they rejected', () => {
    const kept = applyRuleOuts([candidate('Canary Wharf'), candidate('Poplar')], {
      'Canary Wharf': 'hate',
      Poplar: 'hate',
    });
    assert.deepEqual(kept, []);
  });
});

describe('places nobody lives', () => {
  const at = (n: string) => ({
    neighbourhood: n, stations: [n], lat: 51.5, lng: -0.09,
    commuteMins: 10, walkBudgetMins: 15, pocketSize: 1,
  });

  it('drops the City and the theatre core', () => {
    // "No one really lives in St Pauls" (Nick, 2026-08-31).
    for (const n of ['St Pauls', 'Bank', 'Mansion House', 'Covent Garden', 'Liverpool Street']) {
      assert.equal(isCommercialCore(at(n)), true, `${n} should be excluded`);
    }
  });

  it('keeps London Bridge, which the ratio alone would exclude', () => {
    // 0.68, below the threshold, spared by name on Nick's local knowledge
    // (2026-08-31) — people do live around it.
    assert.equal(isCommercialCore(at('London Bridge')), false);
  });

  it('keeps places that only LOOK central', () => {
    // All five have low ratios because offices surround the station, not
    // because nobody lives there — the threshold is set to spare them.
    for (const n of ['Barbican', 'Farringdon', 'Waterloo', 'Southwark', 'Russell Square']) {
      assert.equal(isCommercialCore(at(n)), false, `${n} should survive`);
    }
  });

  it('keeps real neighbourhoods', () => {
    for (const n of ['Shoreditch High Street', 'Clapham Common', 'Peckham Rye', 'Angel']) {
      assert.equal(isCommercialCore(at(n)), false, `${n} should survive`);
    }
  });

  it('does not mistake thin OSM coverage for an office district', () => {
    // Caterham has 42 homes and 55 venues — the same ratio as the City,
    // nothing like the same place.
    for (const n of ['Caterham', 'Hillingdon', 'Romford']) {
      assert.equal(isCommercialCore(at(n)), false, `${n} should survive`);
    }
  });

  it('catches an area by its station, not just its name', () => {
    const hood = { ...at('Some Ward Name'), stations: ['Bank', 'Some Ward Name'] };
    assert.equal(isCommercialCore(hood), true);
  });

  it('never hands back nothing', () => {
    // Unlike a rule-out, this is the app's own judgement — an empty map
    // because we decided nowhere is habitable would read as broken.
    const all = [at('Bank'), at('St Pauls')];
    assert.deepEqual(applyCommercialCoreFilter(all), all);
  });
});
