# CLAUDE.md — nest.finder

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

## What's working (as of 2026-04-03)
- Commute overlap algorithm — solid, accurate
- Firebase auth (Google sign-in) + ratings sync
- AI classification via Sonnet 4.6 — colours map circles Ideal/Potential/Avoid
- Top picks card (purple badges on map), clickable reasons per pick
- Category card (Ideal/Potential/Avoid counts → browse list)
- Header command bar (max time + walk dropdowns, live result count)
- Nest Agent tab — multi-turn chat, suggestion dropdown on focus; session-only visual area hiding (no persistence)
- Initial classification runs on every search (after Firebase auth resolves)
- Viewings tab — add/edit/delete viewings, Firebase storage, calendar with colour-coded day counts, Upcoming/Viewed toggle, address autocomplete (Nominatim), ↩ Undo viewed, ⭐ Shortlist button
- Shortlist tab — league table ranked by rating then tiebreak order, tinder-style comparison card for tied properties, 1–10 rating dots per card

---

## Current priorities / next session
- Couple account linking (partner 6-char code, coupleId in Firebase)
- Speech-to-text notes with AI summarisation on viewing cards

---

## Known debt
- `js/map-data.js` contains base64 gym logos (~245KB). Should be extracted into
  `js/gym-logos.js` and added to `.claudeignore` to prevent token waste.
- Firebase security rules: any logged-in user can read/write any other user's data.
  Should namespace under `users/{uid}/` with proper rules.
