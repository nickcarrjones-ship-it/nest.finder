# Maloca — File Guide

**How to use this:** At the start of a new conversation, scan the table below and tell me which files are relevant to what you want to change. For example: *"I want to change how ratings are saved — I think that's `js/auth.js` and `js/map-ui.js`."* The more specific you are, the less I'll need to go exploring, and the fewer tokens we burn.

---

## Quick Reference

| File | What it does |
|------|-------------|
| `map.html` | The main app page — all visible HTML lives here |
| `index.html` | Landing page — routes new vs. returning users |
| `setup.html` | First-time setup wizard (names, stations, prefs) |
| `js/map-core.js` | Commute overlap engine — draws circles on the map |
| `js/map-ui.js` | UI wiring — tabs, sliders, area panel, search filters |
| `js/map-data.js` | Static data (council tax, gyms) + area detail AI prompts |
| `js/map-filter.js` | Maloca Agent chatbot — AI classifications and top-5 picks |
| `js/area-enrichment.js` | Background data fetch — crime, air quality, amenities |
| `js/viewings.js` | Property viewing tracker — calendar, Firebase, map pins |
| `js/config.js` | All constants — stations, API keys, price ranges, defaults |
| `js/profile.js` | Reads/writes user profile to localStorage |
| `js/auth.js` | Firebase sign-in, ratings, and vetoes |
| `js/anthropic-call.js` | Single function for all Claude API calls |
| `js/html-escape.js` | Sanitises AI text before inserting into the page |
| `js/commute-settings.js` | Commute and walk-distance dropdowns |
| `js/property-search.js` | Builds Rightmove and Zoopla search URLs |
| `js/setup-station-picker.js` | Searchable station dropdown |
| `js/gym-logos.js` | Stub — gym logos currently live in map-data.js |
| `css/styles.css` | All visual styling (~1,500 lines) |
| `css/setup-station-picker.css` | Styles for the station search dropdown only |
| `data/stations.json` | ~260 London stations with lat/lng |
| `data/journey-times.json` | TfL journey time matrix (456KB — never send to Claude) |
| `docs/architecture.md` | Tech stack and how the pieces connect |
| `docs/ai-features.md` | AI models used, prompts, cost notes |
| `docs/firebase.md` | Firebase auth and database schema |
| `functions/index.js` | Dormant Anthropic proxy Cloud Function |
| `.github/workflows/deploy.yml` | CI/CD pipeline — injects API key, deploys to GitHub Pages |
| `.github/workflows/generate-journey-times.yml` | Manually rebuilds journey-times.json from TfL API |
| `firebase.json` | Points Firebase to the Cloud Functions folder |
| `database.rules.json` | Firebase security rules |
| `build_journey_times.py` | Python script to regenerate journey-times.json |
| `CLAUDE.md` | Project instructions for Claude |
| `.claudeignore` | Tells Claude which files to skip |

---

## Detailed Descriptions

### Core App Pages

**`map.html`** — The main application page. All of the visible structure lives here: the header command bar, the tab strip (Map / Search / Areas / Viewings), the sidebar area info panel, and inline styles for map overlays like the loading bar and the AI top-5 card. Every JS module is loaded from this file.

**`index.html`** — The entry point. It's almost entirely JavaScript logic: it checks whether a profile exists in localStorage and either sends the user to `setup.html` (first visit) or straight to `map.html` (returning user).

**`setup.html`** — A four-step wizard that collects everything needed to run the app: person names and work stations, commute time limits, property type and price range, and lifestyle preferences. On completion it saves the profile and redirects to the map.

---

### JavaScript — Map & Core Logic

**`js/map-core.js`** — The heart of the app. For each London area, it calculates whether the commute time (TfL time + walk to station) is within both people's limits. Areas that work for both are drawn as green circles; one-person misses are red. Also handles gym proximity filtering and triggers AI classification after each search.

**`js/map-ui.js`** — Everything that connects the UI to the map logic. Reads dropdown values, renders the area detail panel (transport, council tax, crime), manages tab switching, drives the rating sliders (P1/P2 scores), renders the veto and shortlist tables, and wires up the property search filter buttons.

**`js/map-data.js`** — A data store and prompt builder. Contains static lookup tables (council tax rates per borough, gym brand metadata with logos), functions that load `stations.json` and `journey-times.json` at runtime, and functions that construct the AI prompts for each area detail section (transport, lifestyle, schools, etc.).

**`js/map-filter.js`** — Powers the Maloca Agent tab. Sends the full list of green areas plus the user's lifestyle preferences to Claude Sonnet, receives a JSON response with colour classifications (green/amber/red), a top-5 list, and per-area reasons, then recolours the map live. Supports multi-turn chat for refining the filter. Also handles one-click vetoing of red/amber areas.

**`js/area-enrichment.js`** — Runs silently in the background after each search. Hits several external APIs in parallel — Met Police crime data, Open-Meteo air quality, OpenStreetMap (cafés, parks, gyms), TfL StopPoint — and caches the results. The data is then used to enrich the area detail panel and give Claude better context.

**`js/viewings.js`** — The property viewing tracker (partially implemented). Lets users add a property address, geocodes it via Nominatim, stores the viewing in Firebase, and shows it as a pin on the map. Includes a month-view calendar, day panel, and a status workflow (scheduled / completed / cancelled).

---

### JavaScript — Utilities & Config

**`js/config.js`** — The single source of truth for all constants. Contains the `DESTINATIONS` array (~90 Zone 1 stations used as commute targets), Firebase connection details, the Anthropic API key placeholder (replaced by CI at deploy), walk-distance options, property price ranges, and app-wide defaults like map centre and zoom level.

**`js/profile.js`** — A small `ProfileManager` module. Provides `load()`, `save()`, `get()`, and `clear()` methods that read and write the user's profile object to `localStorage`. The profile holds names, work stations, commute limits, property preferences, and lifestyle notes.

**`js/auth.js`** — Handles everything Firebase-related outside of data storage: Google sign-in via popup, sign-out, and syncing ratings and vetoes to/from the Realtime Database. Also provides `sanitizeAreaKey()` which normalises area names into valid Firebase key strings.

**`js/anthropic-call.js`** — A single `callAnthropicMessages()` async function. It tries the Firebase proxy first (if the user is signed in and a proxy URL is configured), then falls back to a direct browser call using the CI-injected API key. All AI calls in the app go through this one function.

**`js/html-escape.js`** — A one-function file: `nfEscapeHtml()`. It converts characters like `<`, `>`, and `"` to HTML entities before any AI-generated text is inserted into the page. Prevents the AI's output from accidentally breaking the layout or creating security issues.

**`js/commute-settings.js`** — A shared `NFCommuteSettings` utility used by both `setup.html` and `map.html`. It populates the commute-time and walk-distance dropdowns with the correct options, and resolves the current limit values from the active profile.

**`js/property-search.js`** — Builds the search URLs that link out to Rightmove and Zoopla. Contains lookup tables mapping station names to their Rightmove station codes and Zoopla area slugs, and assembles URLs with the correct filters (property type, price range, number of beds, walk distance).

**`js/setup-station-picker.js`** — The searchable dropdown for selecting a workplace station. Filters the `DESTINATIONS` list as the user types and writes the chosen station ID and label to hidden fields. Used on both `setup.html` and the map header.

**`js/gym-logos.js`** — Currently a near-empty stub. The base64 gym brand logos (~245KB) are embedded in `map-data.js` instead. Moving them here and adding the file to `.claudeignore` is a known piece of debt.

---

### CSS

**`css/styles.css`** — All visual styling for the app: the colour palette (cream, ink, copper, green), layout grids, buttons, form fields, the sidebar, the tab bar, section headings, and person-block styling. Around 1,500 lines; touches almost every visible element.

**`css/setup-station-picker.css`** — A small, focused stylesheet just for the station search dropdown. Sets the input style, dropdown container, option hover states, and z-index (high enough to sit above map overlays).

---

### Data Files

**`data/stations.json`** — An array of ~260 London stations, each with a name and lat/lng coordinates. Loaded at runtime by `map-core.js` to know where to draw circles. Never needs to be sent to Claude.

**`data/journey-times.json`** — A 456KB matrix of TfL off-peak journey times (in minutes) between every station pair. The commute algorithm reads this to calculate travel times. It's excluded from `.claudeignore` to avoid accidental inclusion — never send this to Claude.

---

### Docs

**`docs/architecture.md`** — An overview of the tech stack and how the major pieces fit together. Good starting point for understanding the big picture.

**`docs/ai-features.md`** — Details of every place Claude is used: which model, what the prompt looks like, what the response format is, and cost notes.

**`docs/firebase.md`** — Firebase setup: how auth is configured, the database schema (users → ratings, vetoes, viewings), and known security issues.

**`docs/file-guide.md`** — This file.

---

### Firebase Cloud Functions

**`functions/index.js`** — A Node.js Cloud Function deployed to Firebase that proxies calls to the Anthropic API, keeping the key server-side. Currently dormant — the app prefers direct browser calls because they're simpler to maintain. The proxy exists as a fallback option.

**`functions/package.json`** — NPM dependencies for the Cloud Function: `firebase-admin`, `firebase-functions`, and `cors`.

---

### CI/CD & Config

**`.github/workflows/deploy.yml`** — The main deploy pipeline. Triggered on every push to `main`. It injects the `ANTHROPIC_API_KEY` secret into `js/config.js`, verifies the injection succeeded, optionally redeploys the Firebase function, then uploads the whole site to GitHub Pages.

**`.github/workflows/generate-journey-times.yml`** — A manually-triggered workflow that runs `build_journey_times.py`, waits for it to finish (about 30 minutes), and commits the updated `data/journey-times.json` back to the repo.

**`firebase.json`** — Minimal Firebase config file telling the CLI where to find the Cloud Functions source code.

**`database.rules.json`** — Firebase Realtime Database security rules. Currently any signed-in user can read/write any other user's data — this is known debt and should be tightened to `auth.uid === $uid`.

---

### Python Scripts

These are one-off tools. They're not part of the running app and don't need to be touched for normal feature work.

**`build_journey_times.py`** — Calls the TfL Journey Planner API to rebuild `data/journey-times.json`. Run this manually when new stations need to be added. Takes around 30 minutes due to rate limiting.

**`split_js.py`** — A one-time refactoring script used to break the original monolithic `map.js` into separate files (`map-core.js`, `map-data.js`, `map-ui.js`). Already done; kept for reference.

**`refactor_html.py`** — A one-time script that extracted the setup overlay HTML from `map.html` into the standalone `setup.html` page. Already done.

**`refactor_js.py`** — Companion to `refactor_html.py`. Cleaned up the leftover setup functions in `map.js` after the extraction. Already done.

**`lazy_load_patch.py`** — A proof-of-concept for lazy-loading map layers (schools, gyms, transport) on demand instead of all at once. Not applied to the codebase yet.

---

### Project Meta

**`CLAUDE.md`** — Instructions that Claude reads at the start of every session: the tech stack, what's working, known debt, next priorities, and how Nick likes to work. Update this at the end of sessions if something architecturally significant changed.

**`.claudeignore`** — Tells Claude which files to skip when reading the codebase (e.g. `node_modules`, large data files). Keeps sessions fast and cheap.

**`README.md`** — Currently minimal/empty.
