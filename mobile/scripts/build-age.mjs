/**
 * Builds assets/data/area-age.json — when the housing was built, and how big it is.
 *
 *   npm run age
 *
 * The last piece of "what the place looks like". OSM gave us building type
 * and height, which separated Canary Wharf's towers from Balham's terraces,
 * but only 0.1% of London buildings record a construction date. Nick asked
 * for this specifically: age is one of the first things anybody means when
 * they describe a London area — Victorian terrace, 1930s semi, new-build.
 *
 * Source: the EPC domestic bulk export (8.26GB zip, 26GB of certificate
 * CSVs). The per-certificate API does NOT expose construction_age_band, so
 * the bulk file is the only route to it. Streamed straight out of the zip so
 * 26GB is never written to disk, and the zip is deleted afterwards; the
 * output is ~120KB.
 *
 * TWO THINGS THAT WOULD SILENTLY CORRUPT THIS, both hit while writing it:
 *
 *  1. The CSV has commas inside quoted fields. Splitting on commas shifted
 *     every column, which showed up as construction ages reading "1.2" and
 *     "0.9". Columns are read by HEADER NAME through a real parser.
 *  2. A property re-certified every time it is let would be counted once per
 *     tenancy, biasing the age profile towards rental churn. Deduplicated by
 *     UPRN, keeping the most recent certificate.
 *
 * Positions: EPC records a postcode, not coordinates. Rather than fetch a
 * gigabyte postcode directory, certificates are aggregated by postcode
 * SECTOR ("SW4 7" — about 2,700 across London against ~180,000 postcodes),
 * and one real postcode per sector is geocoded through postcodes.io in
 * batches of 100. At a one-mile radius, sector precision is ample.
 */
import { createReadStream, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

const require = createRequire(import.meta.url);
const appStations = require('../assets/data/stations.json');

const ZIP = new URL('../data/epc-domestic.zip', import.meta.url).pathname;
const OUT = new URL('../assets/data/area-age.json', import.meta.url);
const RADIUS_KM = 1.60934;

/** Every postcode area that falls in or around Greater London. */
const LONDON_PC = /^(E|EC|N|NW|SE|SW|W|WC|BR|CR|DA|EN|HA|IG|KT|RM|SM|TW|UB|WD)\d/i;

/** EPC's verbose bands, collapsed to how people actually describe housing. */
function ageBand(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('before 1900')) return 'pre1900';
  const m = s.match(/(\d{4})\s*-\s*(\d{4})/);
  if (m) {
    const from = Number(m[1]);
    if (from < 1900) return 'pre1900';
    if (from < 1930) return 'v1900_1929';
    if (from < 1950) return 'v1930_1949';
    if (from < 1967) return 'v1950_1966';
    if (from < 1983) return 'v1967_1982';
    if (from < 1996) return 'v1983_1995';
    if (from < 2007) return 'v1996_2006';
    return 'post2007';
  }
  if (/(20[0-2]\d)/.test(s) && !s.includes('-')) {
    const y = Number(RegExp.$1);
    return y >= 2007 ? 'post2007' : 'v1996_2006';
  }
  return null;
}
const BANDS = ['pre1900','v1900_1929','v1930_1949','v1950_1966','v1967_1982','v1983_1995','v1996_2006','post2007'];

/** A real CSV line split: commas inside quotes are data, not separators. */
function splitCsv(line) {
  const out = [];
  let field = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') { if (line[i+1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

const sectorOf = (pc) => {
  const m = pc.trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d)/);
  return m ? `${m[1]} ${m[2]}` : null;
};

/** Certificates kept per UPRN — the most recent wins. */
const byUprn = new Map();
let scanned = 0, kept = 0;

function listCertificateFiles() {
  return new Promise((resolve, reject) => {
    const p = spawn('unzip', ['-l', ZIP]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => {
      const files = [...out.matchAll(/(certificates-\d{4}\.csv)/g)].map((m) => m[1]);
      files.length ? resolve([...new Set(files)].sort()) : reject(new Error('no certificate files in the zip'));
    });
  });
}

async function readFile(name) {
  return new Promise((resolve, reject) => {
    const p = spawn('unzip', ['-p', ZIP, name]);
    const rl = createInterface({ input: p.stdout, crlfDelay: Infinity });
    let cols = null, idx = {};
    rl.on('line', (line) => {
      if (!cols) {
        cols = splitCsv(line).map((c) => c.trim().toLowerCase());
        for (const k of ['postcode','construction_age_band','total_floor_area','number_habitable_rooms','uprn','lodgement_date','inspection_date'])
          idx[k] = cols.indexOf(k);
        return;
      }
      scanned++;
      const f = splitCsv(line);
      const pc = (f[idx.postcode] || '').trim();
      if (!LONDON_PC.test(pc)) return;
      const band = ageBand(f[idx.construction_age_band]);
      if (!band) return;
      const uprn = (f[idx.uprn] || '').trim() || `${pc}|${f[idx.total_floor_area]}|${f[idx.number_habitable_rooms]}`;
      const date = f[idx.lodgement_date] ?? f[idx.inspection_date] ?? '';
      const prev = byUprn.get(uprn);
      if (prev && prev.date >= date) return;
      byUprn.set(uprn, {
        pc, band, date,
        floor: Number.parseFloat(f[idx.total_floor_area]) || null,
        rooms: Number.parseInt(f[idx.number_habitable_rooms], 10) || null,
      });
      kept++;
    });
    rl.on('close', resolve);
    p.on('error', reject);
  });
}

const files = await listCertificateFiles();
console.log(`Streaming ${files.length} certificate files from the zip…`);
for (const [i, name] of files.entries()) {
  await readFile(name);
  console.log(`  ${String(i+1).padStart(2)}/${files.length} ${name.padEnd(24)} ${scanned.toLocaleString().padStart(12)} rows, ${byUprn.size.toLocaleString()} London dwellings`);
}
console.log(`\n${byUprn.size.toLocaleString()} distinct London dwellings with a construction age\n`);

/** Aggregate by postcode sector. */
const sectors = new Map();
for (const c of byUprn.values()) {
  const s = sectorOf(c.pc);
  if (!s) continue;
  let e = sectors.get(s);
  if (!e) { e = { counts: {}, floors: [], rooms: [], sample: c.pc }; sectors.set(s, e); }
  e.counts[c.band] = (e.counts[c.band] ?? 0) + 1;
  if (c.floor && c.floor > 5 && c.floor < 1000) e.floors.push(c.floor);
  if (c.rooms && c.rooms > 0 && c.rooms < 20) e.rooms.push(c.rooms);
}
console.log(`${sectors.size} postcode sectors — geocoding one postcode each…`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const entries = [...sectors.entries()];
const coords = new Map();
for (let i = 0; i < entries.length; i += 100) {
  const chunk = entries.slice(i, i + 100);
  try {
    const res = await fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: chunk.map(([, v]) => v.sample) }),
    });
    const body = await res.json();
    for (const r of body.result ?? []) {
      if (!r.result) continue;
      const s = sectorOf(r.result.postcode);
      if (s) coords.set(s, { lat: r.result.latitude, lng: r.result.longitude });
    }
  } catch { /* a failed batch just means those sectors are skipped */ }
  if ((i / 100) % 5 === 0) console.log(`  ${Math.min(i + 100, entries.length)}/${entries.length}`);
  await sleep(120);
}
console.log(`  located ${coords.size} of ${sectors.size} sectors\n`);

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat/2) ** 2 + Math.sin(dLng/2) ** 2 * Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180);
  return 2 * R * Math.asin(Math.sqrt(h));
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const round = (n) => Math.round(n * 1000) / 1000;

const areas = {};
let empty = 0;
for (const station of appStations) {
  const counts = {}; const floors = []; const rooms = [];
  let total = 0;
  for (const [sector, data] of sectors) {
    const at = coords.get(sector);
    if (!at || distanceKm(station, at) > RADIUS_KM) continue;
    for (const [b, n] of Object.entries(data.counts)) { counts[b] = (counts[b] ?? 0) + n; total += n; }
    floors.push(...data.floors); rooms.push(...data.rooms);
  }
  if (total === 0) { empty++; continue; }
  areas[station.name] = {
    dwellings: total,
    shares: Object.fromEntries(BANDS.map((b) => [b, round((counts[b] ?? 0) / total)])),
    medianFloorArea: median(floors),
    medianRooms: median(rooms),
  };
}

const out = {
  source: 'EPC domestic bulk export (Energy Performance of Buildings certificates)',
  url: 'https://api.get-energy-performance-data.communities.gov.uk/api/files/domestic/csv',
  licence: 'Open Government Licence v3.0',
  fetched: new Date().toISOString().slice(0, 10),
  method: `Certificates deduplicated by UPRN, aggregated by postcode sector, assigned to areas within ${RADIUS_KM.toFixed(2)}km.`,
  caveats: [
    'Covers only dwellings with an EPC — sold or let since 2008. Long-held family homes are under-represented.',
    'Positioned by postcode sector, not exact address.',
    'Construction age is the assessor\'s banding, not a survey.',
  ],
  coverage: { areasWithData: Object.keys(areas).length, appAreas: appStations.length },
  areas,
};
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`Wrote ${Object.keys(areas).length} areas to assets/data/area-age.json`);
if (empty) console.log(`${empty} areas had no certificates within range`);
