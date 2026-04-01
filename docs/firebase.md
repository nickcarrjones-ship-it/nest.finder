# Firebase — nest.finder

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

## ⚠️ Known security issue
Current `database.rules.json` does NOT properly isolate users — any authenticated user can
read/write any other user's data. Should add `".read": "auth.uid === $uid"` rules.

## Cloud Function (proxy)
- `functions/index.js` — Anthropic proxy at `europe-west1-nestfinderv3.cloudfunctions.net/anthropicMessages`
- Validates Firebase ID token, forwards to Anthropic API
- NOT currently used (direct browser calls are used instead)
- Deploy requires Blaze plan + `FIREBASE_TOKEN` in GitHub secrets
