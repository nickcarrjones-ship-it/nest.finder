/**
 * "Where else in London feels like X?" — from the terminal.
 *
 *   npm run similar -- "Clapham Common"
 *   npm run similar -- "Clapham Common" "the bars and going out"
 *
 * This is the Phase 1 verification test, and it is deliberately a judgement
 * call rather than an assertion: the engine passes if Nick recognises the
 * answers as genuinely similar AND at least some are places he would never
 * have considered. No amount of green test output substitutes for that, so
 * this exists to put the answer in front of him before anything is built
 * around it.
 *
 * Reads the compiled engine from .test-build, so run the build first — the
 * npm script does it for you.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let findSimilar, weightsFromPreference;
try {
  ({ findSimilar, weightsFromPreference } = require('../.test-build/similarity/similar.js'));
} catch (err) {
  console.error('Could not load the compiled engine. Run: npm run similar');
  console.error(err.message);
  process.exit(1);
}

const stations = require('../assets/data/stations.json');
const coords = Object.fromEntries(stations.map((s) => [s.name, { lat: s.lat, lng: s.lng }]));

const [anchor, preference] = process.argv.slice(2);
if (!anchor) {
  console.error('Usage: npm run similar -- "Clapham Common" ["what you like about it"]');
  process.exit(1);
}

if (!coords[anchor]) {
  const near = stations
    .map((s) => s.name)
    .filter((n) => n.toLowerCase().includes(anchor.toLowerCase().slice(0, 5)))
    .slice(0, 8);
  console.error(`No area called "${anchor}".`);
  if (near.length) console.error(`Did you mean: ${near.join(', ')}?`);
  process.exit(1);
}

const weights = preference ? weightsFromPreference(preference) : {};
const matches = findSimilar(anchor, { limit: 10, weights, coords });

console.log(`\nAreas most like ${anchor}`);
if (preference) {
  const named = Object.keys(weights);
  console.log(`  weighted towards: ${named.length ? named.join(', ') : 'nothing recognised — using an even weighting'}`);
}
console.log('');

if (matches.length === 0) {
  console.log('  No comparable areas — we hold no measurements for this one.');
  process.exit(0);
}

const pad = Math.max(...matches.map((m) => m.name.length));
for (const m of matches) {
  const bar = '#'.repeat(Math.round(m.score * 20)).padEnd(20, '.');
  const flag = m.confidence === 'high' ? '   ' : m.confidence === 'medium' ? ' ~ ' : ' ? ';
  console.log(
    `  ${m.name.padEnd(pad)}  ${bar} ${(m.score * 100).toFixed(0).padStart(3)}%` +
      `${flag}${String(m.distanceKm).padStart(5)}km  on ${String(m.dimensionsCompared).padStart(2)} dims` +
      `  ${m.sharedTraits.join(', ')}`,
  );
}

console.log('\n  ~ = medium confidence, ? = low (little data in common)');
console.log('  Distance is shown for spread only — it never affects ranking.\n');
