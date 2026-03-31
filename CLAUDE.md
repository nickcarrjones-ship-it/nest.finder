# CLAUDE.md — nest.finder conversation log

This file tracks what Nick and Claude have been discussing across sessions, so context is not lost between conversations.

---

## Recent Conversations

### 2026-03-31 — Onboarding wizard, AI auto-classification, map UX polish

**Session A completed (from plan):**
- New `setup.html` — 4-step wizard: The Couple / The Property / Area Cards / Lifestyle
  - 20 area personality cards (emoji + name + 3 vibe descriptors, love/hate toggle with heart animation)
  - Extended lifestyle quiz: nightsOut, schoolsPriority, safetyPriority fields added
  - Saves new profile fields: `bathrooms`, `propertyFormat`, `areaCards`, `hasRunInitialAi`
- `js/profile.js` JSDoc updated for new schema fields

**Session B completed (from plan):**
- `js/map-filter.js` — `runInitialAiClassification()`: fires after first computeZones if `hasRunInitialAi === false`; builds prompt from area cards + lifestyle; seeds filterMessages for follow-ups
- `js/map-filter.js` — `buildPersonalisedPrompts()` + `renderPromptChips()`: up to 6 tappable chips based on profile (greenSpace, streetVibe, nightsOut, gyms, loved areas etc.)
- Chips bug fixed: was using JSON.stringify in onclick attributes (broke HTML quotes) — fixed to use `data-prompt` attribute + `usePromptChip(this.dataset.prompt)`
- AI system prompt updated to always return `top5` array alongside `colours`

**Map UX polish (this session):**
- `#loading-bar` (thin copper strip) + `#loading-label` (centred dark popup bubble with spinner) added to map.html — appear during search and AI calls via `nfLoadingStart(label)` / `nfLoadingDone()` defined in map.html inline script
- `#map-ai-controls` — floating "Exclude red" / "Exclude red + amber" buttons over the map; appear automatically after AI classifies areas, no need to open Ask AI tab
- `#ai-top5-card` — top-right card showing "nest.finder Top Picks" ranked list; purple numbered badges pinned on map at each area's location
- `window.nfMap` and `window.nfLayers` exposed from map-core.js for cross-module access
- `layers.aiTop5` Leaflet layer group added for AI top pick markers

**Veto colour reset bug fixed:**
- Root cause: `toggleVeto()` calls `computeZones()` which redraws all circles with default colours, wiping AI classification
- Fix: `reapplyFilterColors()` exposed from map-filter.js (with `filterAreaCount` guard to prevent bleeding into new searches), called at end of `computeZones()` in map-core.js

**Header commute summary:**
- Added `#header-commute` element to the header bar, populated by `applyProfile()` in map-ui.js
- Shows "Nick → Canary Wharf · Harriet → Liverpool St" across all tabs always
- Search tab remains for adjusting commute times, but key info now always visible

**Ask AI confirmed iterative:**
- `filterMessages` array grows with every turn; full history sent to Claude each call
- Area list only prepended on the first turn; follow-ups add to the conversation naturally
- Each response re-classifies all areas (refines based on updated understanding) — intentional

**Still to do before Session C — header bar + Search tab rework:**

The header commute summary (name + work location) added this session is NOT hardcoded — it's pulled from the profile via `applyProfile()` in map-ui.js. But Nick doesn't like how it looks and has a better idea.

**Proposed header redesign:** replace the name/station text with a live "command bar":
- `nest.finder` logo (left)
- Max journey time dropdown (inline in header, triggers re-search on change)
- Walk to station dropdown (inline in header, triggers re-search on change)
- Live result count: "24 ideal · 47 reachable" (updates after each search)
- Sign out (right)

This surfaces the two most-tweaked controls on every tab. The Search tab becomes largely redundant. Decisions to make tomorrow:
- Person cards (name + station): move to profile/setup only?
- Property search (beds + price): keep somewhere, maybe Area tab or a modal?
- Edit profile button: keep accessible
- Gym toggles: move to a map overlay button (like the parks toggle)
- Find Overlap / Clear buttons: header dropdowns auto-trigger, buttons may become redundant
- Results summary: moves to header bar

Verdict to confirm: hide Search tab from the tab bar; its dropdowns move to header; gym toggles move to map; property search stays in a simplified panel.

**Outstanding — Session C from plan:**
- Couple account linking (partner code system, 6-char code, `coupleId` in Firebase)
- Property tracking tab: status workflow (Spotted → Offer accepted), map pins by status, Firebase storage
- Speech-to-text notes with AI summarisation (Web Speech API → Claude Haiku bullet points)
- Viewing calendar (vanilla JS month grid, upcoming/past viewings)

### 2026-03-27 — Data fixes, Zoopla, console errors, AI sections restored

**Council tax ranking fixed:**
- Wandsworth was incorrectly ranked 26th — corrected to #1 (~£845/yr Band D), Westminster #2 (~£871/yr), H&F #4, K&C #5
- Display updated to show rank only (no price): gold+bold for top 5, green for 6–20, red for 21+
- `STATION_BOROUGH` expanded from ~80 to ~220 stations covering the full network

**Property search:**
- Removed Rightmove entirely (only 76/262 stations had IDs)
- Zoopla: fixed a critical bug where `property-search.js` was explicitly re-assigning `window.renderPropertyLinks` to an old version (with Rightmove, no radius fix), overriding the correct `map-ui.js` version on every page load
- Radius param removed from Zoopla URL — Zoopla's `?q=` mode geocodes the area and adding a radius pin causes empty results
- Radius dropdown removed from UI (no longer useful)
- Household Bills section removed

**Console errors fixed:**
- TfL API 404s: `lng=` → `lon=`, removed invalid `returnLines=true` param
- ~10 AI fetch functions (fetchCrime, fetchAirQuality, etc.) were firing for every area on page load and crashing on null DOM elements — added early-return guards to each
- Background enrichment loop (`fetchSingleArea`) reduced to TfL-only — AI sections now only fire when user opens a specific area

**AI sections restored to Area tab:**
- Transport, Lifestyle & Amenities, Shopping, Crime Rate, Air Quality, Noise & Pollution, Schools Nearby, Up & Coming, Weekend Vibe — all restored
- Previously removed from Area tab in a March 23 session
- Each resets to "Loading…" when area opened, then fills async

**Other:**
- Bubble popup: removed person initials (was "N Nick: 34 min", now "Nick: 34 min")
- National Rail route colour changed to black (#000000) — was incorrectly red (#C1272D)
- "Set Aside" tab renamed to "Excluded"
- Person initials removed from dual route strip labels (still show initial · time)
- Map auto-fits to search results bounds after each search

**Outstanding / next session:**
- Earlsfield route trace was showing District line (wrong) — National Rail prompt fix deployed, route trace cache clears on hard refresh
- Pubs count (e.g. 45 for Earlsfield) is an AI estimate for 1-mile radius — may be high; could tighten to 0.5 miles or split pubs vs restaurants

### 2026-03-25 — AI proxy debugging session

**What was fixed:**
- **Firebase IAM bug**: Function was deployed but returning 403 Forbidden — Google Cloud's default policy blocked all browser requests before our code even ran. Fixed by running `gcloud functions add-iam-policy-binding` to allow `allUsers` invoker access. Function now correctly returns 401 (our auth check) instead of 403.
- **Anthropic API billing**: API key was valid but account had no credit. Nick added $6 to console.anthropic.com and created a fresh API key, updated GitHub Secret `ANTHROPIC_API_KEY`, redeployed.
- **Proxy error details**: Added `console.warn` to log the full Anthropic error body so future failures are diagnosable without checking Firebase logs.
- **CI reporting**: Added "Report Firebase deploy result" step to `deploy.yml` so Firebase deploy success/failure is clearly visible in Actions log.

**Outstanding issue — AI response JSON parsing fails:**
- Error shown: "Sorry, I had trouble understanding that response."
- Root cause: Model sometimes wraps its JSON in extra text (e.g. "Here's my analysis:") before/after the JSON object
- Fix attempted: Updated `map-filter.js` to extract JSON via `indexOf('{')` / `lastIndexOf('}')` rather than relying on strict `JSON.parse` of the full response
- Still failing — diagnostic `console.log('[NestFinder] Raw AI response:', raw)` added and deployed
- **Next session**: Nick should open browser console, try the AI filter, and paste the "Raw AI response:" log line — this will show exactly what the model is returning and why parsing fails

**Thinking on what tomorrow's fix might be:**
- If the model returns valid JSON but with preamble text → the `indexOf` fix should already work; check if deploy was fully complete when Nick retested
- If the model returns no JSON at all → strengthen the system prompt or switch model from `claude-haiku-4-5-20251001` to `claude-3-5-haiku-20241022`
- If the response is cut off (max_tokens hit) → increase `max_tokens` or reduce area list sent
- If `data.content` is malformed → add a guard on `data.content[0]` existence

### 2026-03-23
- User asked Claude to use CLAUDE.md to record conversation context between sessions — CLAUDE.md created
- **Critical bug fix**: Stray `);` in map.html's inline `<script>` block (leftover from JS refactor) caused `ProfileManager.load()` to never run → map always showed "Person 1 / Person 2" instead of real names
- **Corrupted characters**: `'N '` and `'H '` prefixes before names in Area tab commute lines were mangled emoji from the JS split — removed
- **Tab naming**: "Areas" tab renamed to "Shortlist" to distinguish from "Area" tab
- **Veto buttons**: Shortlist tab veto cells now show clean "Veto"/"Undo" pill buttons
- Multiple UI changes across Search, Area, and Areas tabs:
  - **Search tab**: Made person cards more compact (smaller font/padding); put "Max time" and "Walk to station" dropdowns side by side in a flex row
  - **Area tab**: Removed star (★) — replaced with gold+bold name styling for top-5 ranked areas; added rank number below name (only shows when both people have rated); moved voting section (ratings + save) to the top just below place name; removed all AI sections (Transport through Weekend Vibe, incl. Third Space); kept Household Bills, Council Tax, Property Search, EV Chargers; fixed voting bug — "logged in to vote" message was showing even when logged in (root cause: `currentUser` variable was always 'guest', now uses `AuthManager.isLoggedIn()`)
  - **Areas tab**: Changed veto button from 🚫 emoji to small text "Nah, not for us" (shows "Undo" when vetoed)
  - **Header**: Removed "signed in as [email]" from top right — just shows a subtle "Sign out" button

### 2026-03-23 (evening session)
- **New feature: "Ask AI" tab** — built `js/map-filter.js` (new file), updated `map.html` and `js/map-ui.js`
  - New tab between Search and Area called "✨ Ask AI"
  - Multi-turn chatbot that acts as a London estate agent
  - AI classifies all greenAreas as green/amber/red based on user's lifestyle preferences
  - Map circles recoloured live via Leaflet `.setStyle()`
  - "Veto red" / "Veto red + amber" buttons auto-veto areas in one click using existing `toggleVeto()`
  - Enter key support in chat input
- **AI proxy bug investigated** — "Failed to fetch" error on every AI call
  - Root cause 1: Firebase Cloud Function proxy (`europe-west1-nestfinderv3.cloudfunctions.net/anthropicMessages`) is not deployed — CI step has `continue-on-error: true` so it fails silently
  - Root cause 2: Direct browser calls to `api.anthropic.com` don't work from GitHub Pages (CORS blocks it in production even with the `anthropic-dangerous-direct-browser-iab-ash-pchd` header)
  - **Partial fix applied**: `js/anthropic-call.js` updated to try proxy first, then fall back to direct call — but direct call also fails due to CORS
  - **Outstanding issue**: Firebase proxy needs to actually be deployed for AI features to work

**TODO for next session — fix Firebase proxy deployment:**
1. Nick needs to run `npx firebase-tools login:ci` locally → get a token → add to GitHub repo secrets as `FIREBASE_TOKEN`
2. Confirm the Firebase project (`nestfinderv3`) is on the **Blaze plan** (Cloud Functions require billing; Spark free plan blocks them)
3. Once both done, push any commit — CI will deploy the function and AI features will route through it

### 2026-03-23 (end of evening — app review for tomorrow)

Nick asked for a full review of the current app with suggested features and improvements. Results below.

---

## App Review — Features, Improvements & Bugs

### What's working well
- Core commute overlap algorithm is solid and accurate
- UI is clean, consistent (Outfit font, copper/cream palette) and mobile-friendly
- Firebase auth, ratings, and veto sync are all reliable
- AI chatbot tab (just built) has a good UX flow — green/amber/red colouring is intuitive
- Property search links (Rightmove/Zoopla) cover ~90 stations correctly
- Gym proximity filter is a nice differentiator

---

### Bugs spotted

| Bug | Severity | Detail |
|-----|----------|--------|
| Firebase security rules | **HIGH** | Any logged-in user can read/write any other user's ratings and vetoes — no user isolation in database.rules.json |
| Layer panel never loads | Medium | Schools/Parks/Pubs toggles call toggleLayer() but it only stubs with setTimeout — no data ever loads |
| AI section DOM refs | Low | map-data.js has fetchTransport(), fetchCrime() etc. that try to update `#ai-transport`, `#ai-crime` etc., but those HTML elements were removed. Silent failures. |
| No retry on AI failure | Low | If AI call fails, error shows but no "Try again" button — user must retype their message |

---

### Quick wins (easy, high impact)

1. **Fix Firebase security rules** — namespace ratings and vetoes under `users/{uid}/` so each user can only read/write their own data (this is urgent — currently any user can overwrite anyone else's data)
2. **Dark mode toggle** — CSS is almost ready for it; add a toggle in the header
3. **Export to PDF** — "Download shortlist" button that prints the top-rated areas with commute times, scores and comments. Useful for couples to share with parents, estate agents etc.
4. **Side-by-side area comparison** — select two areas and see their stats, commute times and ratings next to each other
5. **Commute cost** — show estimated annual TfL travelcard cost by zone alongside each area's commute time
6. **Remove or clean up dead AI section references** — either restore the Transport/Crime/Lifestyle sections to the Area tab, or remove the now-unused fetch functions from map-data.js

---

### Medium-term features (worthwhile, moderate effort)

1. **Saved searches / scenarios** — "What if Nick changes jobs?" — save up to 3 named search configs (different workplaces, commute limits) and switch between them without resetting ratings
2. **Real-time couple sync** — when both people are using the app simultaneously, ratings update live for each other without a page refresh (Firebase onValue listener already in place — just needs the UI to react)
3. **Share shortlist link** — generate a read-only URL of your top-rated areas to share with parents, friends, or estate agents
4. **Price history per area** — show 12-month price trend for the area (via Rightmove/Zoopla or Land Registry open data)
5. **Affordability score** — flag which areas on the shortlist are "good value" vs overpriced relative to their commute convenience
6. **Reverse search** — pick an area and see which work destinations are reachable within X minutes (useful for flexible workers)
7. **Swipe to veto on mobile** — current veto button is small on mobile; swipe gesture would be more natural
8. **Search history** — remember the last 3 searches in localStorage so the user doesn't have to reconfigure from scratch

---

### Premium / monetizable features (bigger build, high value)

These are the features that would anchor a paid "Nest Pro" tier (suggested ~£8–12/mo):

1. **Property price alerts** — "Notify me when a 2-bed under £600k appears in Brixton or Hackney" — email/push notification (requires backend job)
2. **AI neighbourhood monthly report** — "What's new in Stoke Newington this month: 3 new cafés, crime down 8%, new Ofsted Outstanding primary" — AI-generated, sent by email
3. **AI-powered recommendations** — learns from the couple's ratings over time and proactively suggests areas they haven't explored yet ("You both rated Hackney 9/10 — have you looked at Clapton?")
4. **Safety / crime heatmap** — real crime data overlaid on the map (currently just AI chat estimates)
5. **School league table overlay** — real Ofsted ratings and GCSE scores for schools within walking distance of each area (huge for families)
6. **Team / family workspace** — two couples or a group of friends can share a collaborative shortlist with comments and votes (£15/mo plan)
7. **Mortgage / affordability calculator** — based on area prices, input income and deposit → shows which shortlisted areas are actually affordable
8. **Commute cost breakdown** — annual TfL costs by zone, driving costs, cycle feasibility — full financial picture per area

---

### UX improvements worth doing

- **Add "data source" labels** — e.g., "Council Tax: official GOV.UK data" or "Crime: AI estimate — not official". Builds trust.
- **Warn before editing profile** — currently going back to setup.html just overwrites everything. Should say "Your ratings will be preserved, but your commute results will reset."
- **"Both within limit" legend is confusing** — the results section says "Both within limit" with a green dot but doesn't explain what the numbers mean to new users. Add a one-line explainer.
- **Gym filter is invisible** — gym toggles only appear if gyms were set up. Many users won't know it exists. Add a hint on the Search tab.
- **Layer panel (Schools/Parks/Pubs)** — currently non-functional. Either make it work or remove it — dead UI erodes trust.
- **Header status line** — currently says "X ideal areas found" but doesn't update if the user vetoes areas. Should say "X ideal areas (Y excluded)".
- **Accessibility** — add ARIA labels and keyboard navigation for screen readers.

---

### Monetization summary

The app already has a strong free core. A freemium model could work like this:

**Free tier (current):**
- Full commute overlap search
- Rate and veto areas
- AI filter chatbot (3 questions/day)
- Basic area info

**Nest Pro (~£9/mo):**
- Unlimited AI questions
- Property price alerts
- Monthly neighbourhood reports
- PDF export
- Saved search scenarios

**Nest Family (~£15/mo):**
- Everything in Pro
- Up to 4 people sharing one shortlist
- Collaborative comments and voting

Realistic conversion: 10–15% of active users → meaningful revenue at even modest user numbers.

---

## How to use this file
At the end of each session (or after completing a significant piece of work), Claude should update the "Recent Conversations" section above with a brief summary of what was discussed and done.
