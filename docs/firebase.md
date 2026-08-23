# Firebase — Maloca

## Project
- Project ID: `nestfinderv3`
- Region: `europe-west1`
- Realtime Database URL: `https://nestfinderv3-default-rtdb.europe-west1.firebasedatabase.app`

## Auth
- Provider: Google sign-in (popup)
- Managed by `js/auth.js` → `AuthManager` module
- `onUserLoggedIn()` calls `retryInitialClassification()` after 500ms delay (auth timing fix)

## Database schema
```
users/
  {uid}/
    ratings/
      {sanitized_area_name}/
        p1/ { score, comment, timestamp }
        p2/ { score, comment, timestamp }
    vetoes/
      {sanitized_area_name}: true
```
Key sanitization: `str.replace(/[^a-z0-9_]/gi, '_').toLowerCase()` — via `AuthManager.sanitizeAreaKey()`

## Security
`database.rules.json` scopes `users/$uid` reads/writes to `auth.uid === $uid`, with a
mutual-consent exception for linked partners (both sides' `linkedTo`/`linkedPartner`
must agree — written together by the `linkPartner` Cloud Function, so you can't grant
yourself access by pointing your own `linkedTo` at someone). Fixed as part of the
2026-06-11 security hardening pass; this doc previously described the pre-fix state.

## Cloud Function (proxy)
- `functions/index.js` — Anthropic proxy at `europe-west1-nestfinderv3.cloudfunctions.net/anthropicMessages`
- Validates Firebase ID token, forwards to Anthropic API
- NOT currently used (direct browser calls are used instead)
- Deploy requires Blaze plan + `FIREBASE_TOKEN` in GitHub secrets
