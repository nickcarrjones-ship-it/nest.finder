# AI Features — nest.finder

## How AI calls work
- **Direct browser calls** to `api.anthropic.com` using a special header:
  `anthropic-dangerous-direct-browser-iab-ash-pchd: true`
- API key is injected by CI (never in git). Locally: key is missing → AI gracefully degrades.
- Model: `claude-sonnet-4-6` for all classification (upgraded from haiku — haiku had poor London geography)
- Firebase proxy (`functions/index.js`) exists but is not used; direct calls are sufficient.

## Auth timing race
Firebase `onAuthStateChanged` resolves ~1–2s after page load. The auto-search fires at 100ms.
Fix: `retryInitialClassification()` is called from `onUserLoggedIn()` in auth.js with a 500ms delay.
This re-runs if `filterColorMap` is empty (i.e. first attempt failed silently).

## Nest Agent tab (map-filter.js)

### Initial classification
- Runs after every `computeZones()` call (not gated by `hasRunInitialAi`)
- Builds prompt from: area list with commute times, loved/hated area cards, lifestyle preferences
- Returns JSON with `colours`, `top5`, `reasons` (per top-5 area)
- Saves snapshot: `filterInitialColorMap`, `filterInitialTop5`, `filterInitialMessages`, `filterInitialReasons`

### JSON response format
```json
{
  "reply": "Warm conversational 2-3 sentences",
  "colours": { "Balham": "green", "Hackney": "amber", "Kings Cross": "red" },
  "top5": ["Balham", "Tooting", "Clapham", "Battersea", "Dulwich"],
  "reasons": {
    "Balham": "One sentence why this suits this specific couple."
  }
}
```
Colour labels: green = Ideal, amber = Potential, red = Avoid.

### Multi-turn conversation
- `filterMessages` array grows with each turn (full history sent every call)
- Area list only prepended on the first user turn
- Each response reclassifies all areas

### Reset
- Header ✕ button calls `resetToInitialClassification()` which restores the snapshot
- A popup directs the user to open Nest Agent

## Area tab AI sections
Each section fires independently when an area is opened (not on page load).
Sections: Transport, Lifestyle & Amenities, Shopping, Crime Rate, Air Quality, Noise,
Schools Nearby, Up & Coming, Weekend Vibe.
Model: `claude-haiku-4-5-20251001` (faster/cheaper for individual sections).
