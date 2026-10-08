# Maloca product brief

Last updated: 8 October 2026. Written from the app's code and the project's decision notes, for use in business conversations outside the codebase. When the app changes, ask Claude Code to "update the product brief" and re-upload this file.

## What Maloca is

A native iPhone app (Android to follow) that helps couples and households decide where in London to live, then carries them through viewings to a decision. Portals such as Rightmove answer "which property". Maloca answers "which area" first: every area that works for everyone's commute, areas with the same feel as the ones they already love, and answers about any area from real data. Then it tracks the properties they view and scores them together.

Founding story: Nick (founder) and his partner Harriet were renting in Clapham Junction, working in Canary Wharf and Holborn, looking for a first home at around £600,000 to £700,000, and had only ever known south-west London. They wanted every area that worked for both commutes, filtered by how they actually live. Nothing did that. They have since bought, so the app is now built for people like they were.

Tone: a warm, wise friend guiding a big life event, not a cold data tool. The emotional competitor is Rightmove and Zoopla, which feel transactional.

## Status (8 October 2026)

- iOS build 1.1.0 (9) submitted for TestFlight external beta review on 7 October. Apple rejected it on 8 October under guideline 5.6, saying features appeared hidden during review. A reply explaining the app has been drafted. Likely triggers: the tab bar is hidden until sign-in, and a Settings section labelled "Testing".
- Two review logins exist: applereview@maloca.com (a set-up household) and applereview2@maloca.com (empty, for the new-user flow).
- Not yet on the public App Store. Android not yet built. No analytics or crash reporting yet.
- maloca.homes shows a coming-soon page with an email waiting list, the privacy policy and the terms.
- Over 770 automated tests. Fixes reach phones by over-the-air update (no rebuild) unless they change native parts of the app.

## The app, screen by screen

### Getting started

1. Welcome screen: "Get started" (explore without an account) or "I already have an account".
2. Who's moving in: up to four people, each with their name, the station nearest work and the walk from the station to their desk. Optional: join an existing household with a code.
3. The map shows every area within a shared commute. A dark card ("Tap here to explore more") leads to sign-in.
4. Sign-in: Apple, Google, or email. Email sign-in is for accounts created by hand in Firebase (test accounts); nobody can create an account with email in the app.
5. Six setup steps, with a progress line and a Back button:
   1. Which areas are you considering? Name up to three. A region ("South East") or more than three places turns into buttons to pick a top three.
   2. What do you like about them?
   3. Your evenings and weekends.
   4. Where wouldn't you want to live? Required, with "Would you live in Zone 1?".
   5. Where do most of your people live (north, east, south, west)?
   6. Do schools matter (not a factor, primary, secondary, both)?
6. A four-step guide to the app, with the map locked while it runs.

### Map tab

- A commute slider (20 to 60 minutes door to desk) and a shaded zone showing where everyone can live within it, from pre-computed TfL journey times and walking areas around stations. About 585 London areas.
- Pins for the areas the household loves (rose) and areas Maloca suggests (teal).
- A swipeable row of area cards: typical sold price and its trend (Land Registry), what the area shares with the ones they love, a link to the area's Instagram hashtag, a heart to add it to favourites, and a Rightmove search for the area using the household's saved criteria (price, beds, baths, property type). The first time, a pop-up explains how to copy a listing link back into Maloca. Rightmove opens in the browser on purpose: Rightmove's own app ignores search links.

### Ask tab (Ask Maloca)

Questions about areas, answered from the app's own data, with the AI (Claude) writing the words:

- Area answers ("What's Clapham Common like?").
- Places answers with photo cards from Google ("best pubs in Peckham", "brunch in Balham").
- Comparisons ("Balham or Tooting for pubs?").
- Rankings of the household's areas on a theme, shown as a podium: nightlife, food, cafés, quiet, busy, young crowd, family-friendly, safety, commute.
- Route to work from any area, drawn as a TfL-coloured map for each person (TfL Journey Planner, fastest route).
- A day planner: a swipeable strip of stops (brunch, a walk, a market, the pub, dinner) fitted to the hours they have, with Book a table and Call links. Stops must really be that kind of place: corner shops are filtered out.
- Three suggested follow-up questions after every answer, chosen by the app so each leads to something it answers well.
- Rules: answers never quote raw counts ("386 places across 58 cuisines"); they speak in words. Questions the app cannot answer are saved anonymously for 90 days so the team can see what to add.

### Viewings tab

- Tabs: Want to see, Booked in, Viewed.
- Add a property by pasting a Rightmove link (the server reads that one page for the address, price, location, beds and the estate agent's name and number) or by hand.
- Call agent (opens the phone's dialler), Add viewing time, Change time, and "Did you go?" after the date passes.
- Must-haves: the household's list, reordered by dragging; the order sets each item's weight. Each viewing gets a score out of 10 from ticked must-haves.
- Video walkthroughs stored for the household, and a calendar feed of booked viewings.
- Properties outside the commute zone are shaded, with "Keep it anyway".

### Settings tab

Account and sign-out; household sharing (up to four people, invite by code or QR, codes expire after 24 hours); the Rightmove search criteria; privacy policy and terms; delete my account; a "Run the Ask Maloca questions again" option (currently under a section labelled "Testing", to be renamed); the version and update code.

## Where the data comes from

| Data | Source | Licence |
| --- | --- | --- |
| Commute times | TfL journey data, pre-computed; live routes from the TfL Journey Planner | TfL open data |
| Station busyness | Office of Rail and Road station usage 2024-25; TfL station counts 2025; TfL crowding | Open Government Licence, TfL open data |
| Sold prices | HM Land Registry Price Paid Data | Open Government Licence |
| Housing stock age | Energy Performance Certificates | Open Government Licence |
| Age and tenure mix | ONS Census 2021 | Open Government Licence |
| Restaurants, cafés, pubs, parks, buildings | OpenStreetMap | ODbL, attribution required |
| Food businesses | Food Standards Agency hygiene register | Open Government Licence |
| Schools | Ofsted inspection data (nearest two primary and two secondary) | Open Government Licence |
| Crime | data.police.uk street-level crime, about one mile around each station | Open Government Licence (used in the safety ranking) |
| Places, ratings, photos | Google Places, live | Google terms: must not store results beyond place IDs; to be made compliant before public launch |
| Listings | One Rightmove page, only when the user pastes its link | No scraping or searching of Rightmove |

## How it is built

- React Native with Expo (SDK 57), TypeScript. iOS first.
- Google Firebase: sign-in, Realtime Database (EU, Belgium), Storage for videos (London), and server functions that hold all secret keys.
- Anthropic Claude (Sonnet 5) through Maloca's own server, which checks every request and applies caps.
- Expo's EAS service for builds, App Store uploads and over-the-air updates.
- Code: github.com/nickcarrjones-ship-it/nest.finder (the app is in the `mobile` folder).

## Costs and caps (measured September 2026)

- AI: about 1p per Ask question; 1p to 35p per area-suggestion run; about 30p per household signing up, on average.
- Caps per household each month: 200 AI requests, 200 listing reads, 200 new route lookups; Google Places 100 rated and 500 standard searches.
- Caps across everyone each month: Google Places 900 rated and 4,500 standard searches (kept inside Google's free allowance), 5,000 listing reads, 10,000 route lookups.
- Fixed costs today: Apple developer account £79 a year; Expo, Firebase and Google within free tiers at current use.
- Year-one running costs at about 3,000 households: about £5,000 including legal and a small marketing test (see the business plan).

## Decisions already made, and why

- Rightmove search opens in the browser, not Rightmove's app: their app ignores search links and shows a blank search (tested 5 October 2026).
- No charging estate agents for buyer leads: London agents pay for sellers, not buyers, and will not log into another app (Movebubble relied on agents in-app and went offline).
- No scraping portals: against their terms and UK database rights. Listings come only from links the user pastes.
- Strava data ruled out (their terms forbid this use).
- Up to three loved areas at setup, so suggestions start from the household's real favourites.
- Never quote raw counts in answers; never use em dashes or purple in the app; always use the place names a Londoner would say.
- Over-the-air updates are not published while Apple is reviewing a build.

## Business model (from the business plan)

1. Maloca Plus: a paid pass for the search (test £19.99 for six months against £4.99 a month).
2. Disclosed, opt-in introductions to mortgage brokers and conveyancers when a household is ready to offer (assumed £250 per completed mortgage, £200 per conveyancing instruction; needs FCA and Trading Standards checks).
3. Later: employers relocating staff to London.

## Known gaps and next steps

- Resolve Apple's guideline 5.6 question; make the signed-out experience clearer; rename the "Testing" section in Settings.
- Analytics and crash reporting before public launch.
- Google Places storage rules (keep only place IDs and fetch details when shown).
- App Store screenshots (6.9-inch iPhone) and listing text.
- Android version.
- Crime data in area answers (today only in the safety ranking), with the border and footfall issues fixed first.
- Banked ideas: an inbox that sends a buyer profile to estate agents and sorts their replies (critiqued: buyers only, top three to five areas, agents never log in); bus-only areas the map cannot see yet; the commuter belt; a second city.
