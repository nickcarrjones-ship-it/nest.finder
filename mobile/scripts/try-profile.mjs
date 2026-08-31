/**
 * "What would the app suggest for someone like this?" — from the terminal.
 *
 *   npm run profile -- canary
 *   npm run profile -- nick
 *   npm run profile -- --list
 *
 * Runs a whole made-up household through the REAL pipeline: reachability
 * from both workplaces, the Zone 1 filter, rule-outs, the anchor, the tag
 * weighting and the geographic spread. Everything the phone does except
 * the model's own sentence at the end.
 *
 * WHY THIS EXISTS. Testing the matching by re-running setup on a phone
 * costs several minutes and a handful of API calls per attempt, and it
 * tests the model's extraction at the same time as the maths — so when the
 * answer looks wrong you cannot tell which half was at fault. This changes
 * one input at a time against fixed code and fixed data (Nick, 2026-08-31).
 *
 * Add a household to PROFILES below to test a hypothesis. The point is to
 * be able to say "if someone loved Canary Wharf instead, would we suggest
 * the right places?" and get an answer in a second.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let mods;
try {
  mods = {
    budgets: require('../.test-build/walkBudget.js'),
    candidates: require('../.test-build/ranking/candidates.js'),
    zones: require('../.test-build/ranking/zones.js'),
    ruleOuts: require('../.test-build/ranking/ruleOuts.js'),
    core: require('../.test-build/ranking/commercialCore.js'),
    anchor: require('../.test-build/ranking/anchor.js'),
    tags: require('../.test-build/similarity/tags.js'),
    labels: require('../.test-build/similarity/dimensionLabels.js'),
    features: require('../.test-build/similarity/features.js'),
  };
} catch (err) {
  console.error('Compile first: npm run profile does it for you.');
  console.error(err.message);
  process.exit(1);
}

const stations = require('../assets/data/stations.json');
const journeyTimes = require('../assets/data/journey-times.json');
const identities = require('../assets/data/area-identities.json');

const member = (name, workId, workLabel) => ({ id: name, name, workId, workLabel, offWalk: 4 });

/** Each one is a hypothesis worth being able to check in a second. */
const PROFILES = {
  nick: {
    what: "Nick and Harriet as they actually answered — commons, cafes, low-key",
    maxCommuteMins: 50,
    members: [member('Nick', 'canary_wharf', 'Canary Wharf'), member('Harriet', 'holborn', 'Holborn')],
    areaCards: { 'Clapham Common': 'love', Tooting: 'love' },
    anchorReason: 'The commons for sunbathing and running, plus great independent cafes and pubs',
    tags: ['independent_shops', 'cafe_culture', 'good_restaurants', 'local_and_lowkey', 'big_park_nearby'],
  },
  canary: {
    what: 'The opposite household: loves Canary Wharf, wants towers and convenience',
    maxCommuteMins: 50,
    members: [member('Nick', 'canary_wharf', 'Canary Wharf'), member('Harriet', 'holborn', 'Holborn')],
    areaCards: { 'Canary Wharf': 'love' },
    anchorReason: 'Modern towers, everything on the doorstep, and a short walk to the office',
    tags: ['high_rise', 'new_build', 'busy_centre', 'flats_not_houses'],
  },
  nightlife: {
    what: 'Out most nights — the test that "quiet" and "nightlife" really diverge',
    maxCommuteMins: 50,
    members: [member('Nick', 'canary_wharf', 'Canary Wharf'), member('Harriet', 'holborn', 'Holborn')],
    areaCards: { Shoreditch: 'love' },
    anchorReason: 'Bars, late licences and somewhere you can always get a table',
    tags: ['nightlife', 'good_restaurants', 'young_crowd', 'cosmopolitan'],
  },
  family: {
    what: 'Schools, houses and green space — should look nothing like the others',
    maxCommuteMins: 55,
    members: [member('Nick', 'canary_wharf', 'Canary Wharf'), member('Harriet', 'holborn', 'Holborn')],
    areaCards: { Dulwich: 'love' },
    anchorReason: 'Quiet streets, proper houses with gardens, and a big park for the kids',
    tags: ['family_area', 'houses_not_flats', 'big_park_nearby', 'period_property', 'quiet'],
  },
};

const [which] = process.argv.slice(2);
if (!which || which === '--list') {
  console.log('\nHouseholds you can run:\n');
  for (const [k, p] of Object.entries(PROFILES)) console.log(`  ${k.padEnd(11)} ${p.what}`);
  console.log('\n  npm run profile -- canary\n');
  process.exit(0);
}
const p = PROFILES[which];
if (!p) {
  console.error(`No household called "${which}". Try: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(1);
}

const profile = {
  maxCommuteMins: p.maxCommuteMins,
  sharedCommuteLimit: true,
  members: p.members,
};
const lifestyle = { anchorReason: p.anchorReason, preferenceTags: p.tags };

const reachable = mods.candidates.computeAreaCandidates(
  mods.budgets.computeAreaBudgets(stations, journeyTimes, profile),
  identities,
);
const habitable = mods.core.applyCommercialCoreFilter(reachable);
const candidates = mods.ruleOuts.applyRuleOuts(
  mods.zones.applyZone1Filter(habitable, lifestyle),
  p.areaCards,
);

console.log(`\n${'='.repeat(64)}`);
console.log(`  ${which.toUpperCase()} — ${p.what}`);
console.log(`${'='.repeat(64)}`);
console.log(`  works for both within ${p.maxCommuteMins}min: ${candidates.length} of ${reachable.length} areas`);
console.log(`  office districts removed: ${reachable.length - habitable.length}`);
console.log(`  loves: ${Object.entries(p.areaCards).map(([k, v]) => `${k} (${v})`).join(', ')}`);
console.log(`  tags:  ${p.tags.join(', ')}`);

const shortlist = mods.anchor.shortlistByAnchor(
  candidates, p.areaCards, p.anchorReason, 12, p.tags,
);
if (!shortlist) {
  console.log('\n  No anchor resolved — the model-led path would run instead.\n');
  process.exit(0);
}

console.log(`\n  anchored on: ${shortlist.anchors.join(' + ')}\n`);
const green = mods.features.featuresFor;
for (const [i, c] of shortlist.candidates.entries()) {
  const f = green(c.neighbourhood);
  const park = f.majorParkHa === null ? '   —  ' : `${(10 ** f.majorParkHa - 1).toFixed(0).padStart(4)}ha`;
  const ev = shortlist.evidence[c.neighbourhood];
  console.log(
    `  ${String(i + 1).padStart(2)}. ${c.neighbourhood.padEnd(26)}` +
    `${String(c.commuteMins).padStart(3)}min  park ${park}  ${(ev.score * 100).toFixed(0)}% like ${ev.anchor}`,
  );
  console.log(`      because they share ${mods.labels.traitsSentence(ev.sharedTraits)}`);
}
console.log('');
