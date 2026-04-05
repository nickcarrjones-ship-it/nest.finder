# CLAUDE.md — Maloca

London house-hunting web app for Nick and Harriet. Vanilla JS/HTML/CSS, no build step.

## Quick links
- See [docs/architecture.md](docs/architecture.md) for tech stack, key globals, and file responsibilities
- See [docs/ai-features.md](docs/ai-features.md) for Anthropic integration details
- See [docs/firebase.md](docs/firebase.md) for auth and database schema

---

## Tone & approach
- Nick has no formal coding background. Explain changes in plain English as you go.
- Flag risks and side effects before making changes.
- Keep commits small and focused — one thing per commit.
- Bold changes are welcome but map rendering and commute calculation are the non-negotiables.
- Always state AI feature cost estimates before building anything AI-related.
- Query visual map changes before building — messy overlays erode the UX.
- Update CLAUDE.md at the end of each session only if something architecturally significant changed. Don't log session history here.

---

## What's working (as of 2026-04-04)
- Commute overlap algorithm — solid, accurate
- Firebase auth (Google sign-in) + ratings sync
- Score row ownership — each Google account only edits their own p1/p2 score row (matched by email in profile)
- AI classification via Sonnet 4.6 — colours map circles Ideal/Potential/Avoid; results cached in localStorage so refresh is instant
- Top picks card (purple badges on map), clickable reasons per pick
- Category card (Ideal/Potential/Avoid counts → browse list)
- Header command bar (max time + walk dropdowns, live result count)
- Maloca Agent tab — multi-turn chat, suggestion dropdown on focus; session-only visual area hiding (no persistence)
- Viewings tab — add/edit/delete viewings, Firebase storage, calendar with colour-coded day counts, Upcoming/Viewed/Want-to-view toggle, address autocomplete (Nominatim), ↩ Undo viewed, ⭐ Shortlist button
- Wishlist ("Want to view") — URL, price, address; amber pins on map
- Map property pins — 3 colours: amber (want to view), blue (upcoming), grey (viewed); legend bottom-left
- Must-haves — unlimited items, add/remove rows, suggestions chips, saved to Firebase
- Shortlist tab — league table ranked by rating then tiebreak order, tinder-style comparison card for tied properties, 1–10 rating dots per card

---

## Current priorities / next session
- **index.html** — make landing page buttons bigger and clearer
- **Viewed property pin colour** — change from grey to something more distinct
- **Wishlist address display** — truncate to road name, number and postcode only (full Nominatim strings are too long)
- **Token / speed optimisation** — audit area enrichment prompts, consider batching or trimming context sent to Sonnet; profile where latency comes from
- **Speech-to-text notes** — mic button on viewing cards, AI summarisation of spoken notes
- **Couple account linking** — partner 6-char code, coupleId in Firebase (groundwork exists in auth.js)

---

## Known debt
- `js/map-data.js` contains base64 gym logos (~245KB). Should be extracted into
  `js/gym-logos.js` and added to `.claudeignore` to prevent token waste.
- Firebase security rules: any logged-in user can read/write any other user's data.
  Should namespace under `users/{uid}/` with proper rules.
- Setup profile doesn't yet prompt for email on existing installs — users need to visit `setup.html?edit=true` once to add emails for score-row locking to activate.
