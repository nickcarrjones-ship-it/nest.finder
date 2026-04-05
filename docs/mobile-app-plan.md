# iOS / Android App Conversion Plan

## Context
Maloca is currently a desktop-first web app hosted on GitHub Pages. Nick and Harriet are using it on-the-go during viewings. The product roadmap is: personal use first → iOS/Android app → premium revenue. This plan covers how to get from web to native mobile.

## Current state
- **No PWA setup** — no manifest.json, no service worker, no offline support
- **Desktop-first fixed layout** — 300px sidebar + full-screen map; one mobile media query (tutorial card only)
- **Vanilla JS stack** — no build step, no framework; works in any browser
- **Firebase + Leaflet** — both work fine on mobile
- Stack is compatible with Capacitor wrapping

---

## Recommended path: Three phases

### Phase 1 — Mobile-responsive layout (prerequisite for everything)
**~3–5 days of UI work**

This is required regardless of which mobile route you take. The current layout will not work on a phone without this.

Key changes:
- **Bottom navigation bar** — replace the sidebar tabs (Filter, Search, Area, Viewings, Shortlist) with a fixed bottom nav with icons, like any iOS/Android app
- **Map full screen** — the map becomes the full background; tapping areas bubbles up from the bottom as a **bottom sheet panel** (slides up from bottom)
- **Sidebar removed on mobile** — becomes a bottom sheet that can be swiped up/down
- **Touch targets** — all buttons minimum 44px tall (Apple HIG requirement)
- **Responsive header** — collapse the commute inputs on mobile, put them in a settings drawer
- CSS media query breakpoint at `768px` distinguishing desktop sidebar from mobile bottom-nav

No JavaScript changes needed — purely CSS/layout.

### Phase 2 — PWA ("Add to Home Screen")
**~1–2 hours once Phase 1 is done**

A PWA lets users install Maloca on their home screen like a native app, without an App Store. This is the fastest win.

Files to add/change:
| File | Change |
|------|--------|
| `manifest.json` (new) | App name, icon, theme colour, display mode |
| `map.html` | Add `<link rel="manifest">` tag |
| `index.html` | Add `<link rel="manifest">` tag |
| App icon | 192×192 and 512×512 PNG versions of Maloca logo |

A service worker (offline caching) is optional — adds complexity, skip it for v1.

**What users get:** Tap "Add to Home Screen" in Safari/Chrome → Maloca appears on the home screen with full-screen launch, no browser chrome. Looks and feels like a native app. Works on iPhone and Android.

**Limitation:** No App Store listing — users must install manually. Fine for personal use; not ideal for distribution.

### Phase 3 — Capacitor (proper App Store release)
**~1–2 weeks once Phase 1 is done**

Capacitor (by Ionic) wraps the existing web app in a native iOS/Android shell. The web code runs inside a WebView — almost zero code changes required.

**What it gives you:**
- App Store (iOS) and Google Play (Android) listings
- Push notifications
- Deeper native integration (camera, geolocation, contacts)
- Offline capability via native caching

**What's involved:**
1. `npm install @capacitor/core @capacitor/ios @capacitor/android`
2. `npx cap init` — generates `capacitor.config.json`
3. `npx cap add ios` and `npx cap add android`
4. Open in Xcode (iOS) → sign with Apple Developer account → submit
5. Open in Android Studio → build → upload to Google Play

**Costs:**
- Apple Developer account: $99/year (required for App Store)
- Google Play Developer: $25 one-off

**Risk:** The app needs a local server or file-serving setup because Capacitor loads files differently than `file://`. The current GitHub Pages setup works fine — Capacitor can point at `maloca.homes` directly and load the live web app, or bundle files locally.

---

## Decision: PWA vs Capacitor?

| | PWA | Capacitor |
|---|---|---|
| Time to ship | 1–2 hours | 1–2 weeks |
| App Store listing | No | Yes |
| Push notifications | Limited on iOS | Yes |
| Code changes | Minimal | Minimal |
| Cost | Free | $99/yr (iOS) |
| Best for | Personal use, quick win | Distribution, monetisation |

**Recommendation:** Do Phase 1 (layout) + Phase 2 (PWA) now. When you're ready to monetise, Phase 3 (Capacitor) is a natural upgrade — the layout work carries over completely.

---

## Verification (Phase 1 + 2)
1. Open `maloca.homes` on iPhone in Safari
2. Layout shows bottom nav + full-screen map (not desktop sidebar)
3. Tap "Add to Home Screen" — Maloca icon appears
4. Launch from home screen — opens full-screen, no browser chrome, loads normally
5. All tabs work: viewings, shortlist, AI filter, area panels
6. Firebase auth (Google sign-in popup) works on maloca.homes (this was already fixed)
