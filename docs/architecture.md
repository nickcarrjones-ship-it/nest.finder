# Architecture — nest.finder

## Tech stack
- **Vanilla JS / HTML / CSS** — no framework, no build step
- **Leaflet.js** — interactive map
- **Firebase** — Google auth + Realtime Database (project: nestfinderv3)
- **Anthropic Claude API** — AI classification (claude-sonnet-4-6)
- **GitHub Pages** — hosting (main branch → auto-deploy via GitHub Actions)
- **GitHub Actions** — CI/CD; injects `ANTHROPIC_API_KEY` into `js/config.js` at deploy time

## Key files and their responsibilities

| File | Responsibility |
|------|---------------|
| `map.html` | Main app page. Header, tab bar, sidebar HTML. Inline styles for map overlays. |
| `js/map-core.js` | `computeZones()` — the core commute overlap algorithm. Draws Leaflet circles. Owns `greenAreas`, `top5Cache`, `zoomCircles` globals. |
| `js/map-filter.js` | Nest Agent tab. AI classification, colour mapping, top picks card, category cards, chat UI. |
| `js/map-ui.js` | Tab switching, area info panel, ratings UI, veto/shortlist table, profile apply. |
| `js/map-data.js` | Static data: GYM_BRANDS (⚠️ contains base64 logos — 245KB), COUNCIL_TAX, STATION_BOROUGH. Loads AREAS + JOURNEY_TIMES from JSON. |
| `js/auth.js` | Firebase Google sign-in, ratings/veto sync to RTDB. |
| `js/profile.js` | ProfileManager — load/save user profile from localStorage. |
| `js/config.js` | API keys (placeholders replaced by CI). Never committed with real values. |
| `js/anthropic-call.js` | `callAnthropicMessages()` — direct browser call with CI-injected key. |
| `js/area-enrichment.js` | Background data fetch per area (crime, air quality, OSM counts). |
| `js/property-search.js` | Zoopla URL generation. |
| `css/styles.css` | All sidebar/UI styles. Map overlay styles are inline in map.html `<style>` block. |
| `data/journey-times.json` | TfL journey time matrix (~450KB). Loaded at runtime, never read by Claude. |
| `data/stations.json` | Station list with lat/lng. Loaded at runtime, never read by Claude. |
| `functions/index.js` | Firebase Cloud Function — Anthropic proxy (not currently used; direct calls used instead). |

## Key globals (set in map-core.js, read everywhere)
- `window.greenAreas` — array of `{ area, t1, t2, lat, lng, circle, marker }` for areas matching both commutes
- `window.top5Cache` — `{ 'Brixton': { rank: 1, total: 18 } }` — user ratings top 5
- `window.nfMap` — the Leaflet map instance
- `window.nfLayers` — `{ commute, markers, aiTop5 }` Leaflet layer groups
- `window.filterColorMap` — `{ 'Brixton': 'green', 'Hackney': 'amber' }` from AI classification

## CI/CD
- `ANTHROPIC_API_KEY` secret in GitHub repo → injected into `js/config.js` at deploy
- `FIREBASE_TOKEN` used for Cloud Functions deploy (has `continue-on-error: true`)
- Deploys to `gh-pages` branch via JamesIves action

## Live URL
`nickcarrjones-ship-it.github.io/nest.finder`
