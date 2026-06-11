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
- Wishlist ("Want to view") — URL, price, address; pink pins on map
- Map property pins — 4 colours: pink (want to view), blue (upcoming), dark green (viewed), gold (top 3 rated); legend via `_pinLegendRow` in map-core.js
- Must-haves — unlimited items, add/remove rows, suggestions chips, saved to Firebase
- Shortlist tab — league table ranked by rating then tiebreak order, tinder-style comparison card for tied properties, 1–10 rating dots per card
- Security hardening (2026-06-11) — database rules deploy via CI (`firebase deploy --only functions,database`); AI proxy validates model allowlist + max_tokens ≤ 8192 + body size, atomic usage counter; couple linking is server-side via `linkPartner` Cloud Function (mutual-consent rules: redeemer's `linkedTo` + creator's `linkedPartner` must both agree); invite codes 8-char crypto-random with 24h expiry; calendar tokens crypto-random
- Legal pages — privacy.html + terms.html, linked from landing footer (contact email is Nick's gmail — swap for a dedicated address before wide launch; have a lawyer skim before charging money)
- Toast notifications (js/toast.js) — replaces all alert() calls; mobile-first, bottom-anchored; use `Toast.show(msg, 'success'|'error'|'info')`

---

## Current priorities / next session
(Mobile UI/UX comes ahead of desktop in all design decisions — Nick, 2026-06-11)
- **First-run experience** — value before sign-in (default commute demo on map), guided empty states on Viewings/Shortlist/wishlist, trim setup to one decision (commute destination)
- **Area panel lazy-load** — collapse the ~14 area sections, generate AI sections on expand instead of up-front; this IS the token/speed optimisation (stop paying for unread sections)
- **Paste-a-listing quick add** — paste Rightmove/Zoopla URL → pre-fill address/price on a viewing
- **Mobile bottom navigation** — move Map/Agent/Viewings/Shortlist tabs to a fixed bottom bar on small screens
- **Friends heatmap layer (Nick's idea, 2026-06-11)** — show where your friends live on the map. NOT yet designed: a heatmap on top of zone circles + 4 pin colours risks overlay soup — propose clean alternatives first (e.g. toggleable friend pins layer, or friend-density tint only when zones are hidden). Also needs a data-entry story (manual pins? contact import?) and a privacy think (friends' addresses are third-party personal data — privacy policy implications)
- **Brand polish** — use real names from profile instead of P1/P2; milestone moments; "your hunt so far" progress strip
- **Speech-to-text notes** — mic button on viewing cards, AI summarisation of spoken notes
- **Monetisation groundwork** — freemium plan: free tier (existing 50 AI cap, limited tracking) vs Maloca Plus ~£5-7/mo (Stripe Payment Links + webhook → `users/{uid}/plan`); mortgage-broker affiliate as secondary stream

---

## Known debt
- `js/map-data.js` contains base64 gym logos (~245KB). Should be extracted into
  `js/gym-logos.js` and added to `.claudeignore` to prevent token waste.
- Setup profile doesn't yet prompt for email on existing installs — users need to visit `setup.html?edit=true` once to add emails for score-row locking to activate.
- ~1.5MB front-loaded on map.html (transit.json 844KB + journey-times 467KB + gym-logos 202KB) — lazy-load/split before public launch.
- Nominatim public server forbids autocomplete-style usage at scale — fine for personal use, must switch to a paid geocoder (LocationIQ/Geoapify) or self-host before public launch.
- No PWA manifest yet (Phase 2 of mobile roadmap).
- No SEO/OG meta tags; index.html title is just "Maloca".
- No analytics or error monitoring — won't know when it breaks for strangers (consider Plausible + Sentry).
- GitHub PAT in git remote now has workflow scope (regenerated 2026-06-11; pasted in chat once — rotate if transcript is ever shared).
