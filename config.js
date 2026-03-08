/**
 * config.js — NestFinder single source of truth
 *
 * DESTINATIONS = every Zone 1 station (A–Z).
 * id must match a top-level key in data/journey-times.json.
 *
 * To add a new station:
 *   1. Add an entry here
 *   2. Add matching row in journey-times.json
 */

'use strict';

window.DESTINATIONS = [
  { id: 'aldgate',                 label: 'Aldgate' },
  { id: 'aldgate_east',            label: 'Aldgate East' },
  { id: 'angel',                   label: 'Angel' },
  { id: 'baker_street',            label: 'Baker Street' },
  { id: 'bank',                    label: 'Bank / Monument' },
  { id: 'barbican',                label: 'Barbican' },
  { id: 'battersea_power_station', label: 'Battersea Power Station' },
  { id: 'bermondsey',              label: 'Bermondsey' },
  { id: 'bethnal_green',           label: 'Bethnal Green' },
  { id: 'blackfriars',             label: 'Blackfriars' },
  { id: 'bond_street',             label: 'Bond Street' },
  { id: 'borough',                 label: 'Borough' },
  { id: 'canary_wharf',            label: 'Canary Wharf' },
  { id: 'cannon_street',           label: 'Cannon Street' },
  { id: 'chancery_lane',           label: 'Chancery Lane' },
  { id: 'charing_cross',           label: 'Charing Cross' },
  { id: 'city_thameslink',         label: 'City Thameslink' },
  { id: 'covent_garden',           label: 'Covent Garden' },
  { id: 'dalston_junction',        label: 'Dalston Junction' },
  { id: 'earls_court',             label: "Earl's Court" },
  { id: 'elephant_and_castle',     label: 'Elephant & Castle' },
  { id: 'embankment',              label: 'Embankment' },
  { id: 'euston',                  label: 'Euston' },
  { id: 'euston_square',           label: 'Euston Square' },
  { id: 'farringdon',              label: 'Farringdon' },
  { id: 'fenchurch_street',        label: 'Fenchurch Street' },
  { id: 'gloucester_road',         label: 'Gloucester Road' },
  { id: 'goodge_street',           label: 'Goodge Street' },
  { id: 'great_portland_street',   label: 'Great Portland Street' },
  { id: 'green_park',              label: 'Green Park' },
  { id: 'haggerston',              label: 'Haggerston' },
  { id: 'high_street_kensington',  label: 'High Street Kensington' },
  { id: 'highbury_and_islington',  label: 'Highbury & Islington' },
  { id: 'holborn',                 label: 'Holborn' },
  { id: 'hoxton',                  label: 'Hoxton' },
  { id: 'hyde_park_corner',        label: 'Hyde Park Corner' },
  { id: 'kennington',              label: 'Kennington' },
  { id: 'kings_cross_st_pancras',  label: "King's Cross St Pancras" },
  { id: 'knightsbridge',           label: 'Knightsbridge' },
  { id: 'lambeth_north',           label: 'Lambeth North' },
  { id: 'lancaster_gate',          label: 'Lancaster Gate' },
  { id: 'leicester_square',        label: 'Leicester Square' },
  { id: 'liverpool_street',        label: 'Liverpool Street' },
  { id: 'london_bridge',           label: 'London Bridge' },
  { id: 'mansion_house',           label: 'Mansion House' },
  { id: 'marble_arch',             label: 'Marble Arch' },
  { id: 'marylebone',              label: 'Marylebone' },
  { id: 'monument',                label: 'Monument' },
  { id: 'moorgate',                label: 'Moorgate' },
  { id: 'nine_elms',               label: 'Nine Elms' },
  { id: 'old_street',              label: 'Old Street' },
  { id: 'oxford_circus',           label: 'Oxford Circus' },
  { id: 'paddington',              label: 'Paddington' },
  { id: 'piccadilly_circus',       label: 'Piccadilly Circus' },
  { id: 'pimlico',                 label: 'Pimlico' },
  { id: 'regents_park',            label: "Regent's Park" },
  { id: 'russell_square',          label: 'Russell Square' },
  { id: 'shoreditch_high_street',  label: 'Shoreditch High Street' },
  { id: 'sloane_square',           label: 'Sloane Square' },
  { id: 'south_kensington',        label: 'South Kensington' },
  { id: 'southwark',               label: 'Southwark' },
  { id: 'st_james_park',           label: "St James's Park" },
  { id: 'st_pauls',                label: "St Paul's" },
  { id: 'stepney_green',           label: 'Stepney Green' },
  { id: 'temple',                  label: 'Temple' },
  { id: 'tower_gateway',           label: 'Tower Gateway' },
  { id: 'tower_hill',              label: 'Tower Hill' },
  { id: 'vauxhall',                label: 'Vauxhall' },
  { id: 'victoria',                label: 'Victoria' },
  { id: 'warren_street',           label: 'Warren Street' },
  { id: 'waterloo',                label: 'Waterloo' },
  { id: 'westminster',             label: 'Westminster' },
  { id: 'whitechapel',             label: 'Whitechapel' }
];

// ── Firebase — replace with your project values ───────────────
window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBPuXJmo0VRWkIJuG53S0oCxOxVjqbJvRs",
  authDomain:        "nestfinderv3.firebaseapp.com",
  databaseURL:       "https://nestfinderv3-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "nestfinderv3",
  storageBucket:     "nestfinderv3.firebasestorage.app",
  messagingSenderId: "462786335336",
  appId:             "1:462786335336:web:bd234a0480ef6d4dd421dd"
};

// ── Google Maps API key ───────────────────────────────────────
// Used for future Google Maps features (Places, Geocoding etc.)
// Current map uses free Leaflet tiles — no key needed for that.
window.GOOGLE_MAPS_KEY = "AIzaSyAZ6zCKJM8vhr8RUNKV3PNHDBU97cu-kpA";

// ── App-wide settings ─────────────────────────────────────────
// ── Anthropic API key — powers the AI neighbourhood assistant ──
// Get your key from: console.anthropic.com → API Keys
// ⚠ WARNING: This key will be visible in your public GitHub repo.
//   For a private personal project this is acceptable, but never
//   share the repo publicly if you want to keep the key private.
//   You can restrict usage in the Anthropic console (monthly spend limits).
// ── Anthropic API key ─────────────────────────────────────────
// This value is intentionally left as a placeholder in the source code.
// The real key is stored as a GitHub Secret called ANTHROPIC_API_KEY
// and is injected automatically by the GitHub Actions deploy workflow.
// NEVER paste a real API key directly into this file.
window.ANTHROPIC_KEY_CONFIG = "%%ANTHROPIC_API_KEY%%";

window.APP_CONFIG = {
  anthropicKey:   window.ANTHROPIC_KEY_CONFIG,
  mapCenter:      [51.505, -0.09],
  mapZoom:        11,
  commuteOptions: [20, 30, 40, 45, 60],
  commuteDefault: 30,
  walkOptions:    [0, 5, 10, 15, 20],
  walkDefault:    5,
  storagePrefix:  'nf_'
};
