# TestFlight beta review: everything to submit

Prepared 5 October 2026, updated 6 October. Paste the text blocks straight into App Store Connect.

---

## 1. Before you press Submit (blockers)

1. **Submit build 9, not build 8.** Build 9 (started 7 October) adds the email sign-in to the "Get started" route's sign-in page, which the review notes now use. Wait for 1.1.0 (9) to show as ready in App Store Connect.
2. **Check the review login works on your phone:** applereview@maloca.com. If it says "email sign-in isn't switched on", go to Firebase console → Authentication → Sign-in method → Email/Password → Enable.
3. **Recommended: a few lines added to the privacy policy** (section 5). Apple checks that the policy covers what the app does, and two newer services aren't mentioned yet.

---

## 2. TestFlight → Test Information

**Beta App Description**

> Maloca helps couples and households work out where to live in London. Tell it where each of you works and how long you're happy to commute, and it maps every neighbourhood that works for all of you. Name the areas you already love and Maloca finds others with the same feel, using real data on parks, high streets, nightlife, schools, safety and prices. Ask it anything about an area, see your route to work, plan a day out somewhere you're considering, and keep track of the properties you view, with notes, scores and video walkthroughs shared with everyone in your household.

**Feedback Email:** nickcarrjones@gmail.com *(or a dedicated address if you set one up)*

**Marketing URL:** https://maloca.homes

**Privacy Policy URL:** https://maloca.homes/privacy.html

---

## 3. Beta App Review Information

**Contact:** your first name, surname, phone number and email.

**Sign-in required:** Yes

- **User name:** applereview@maloca.com (the set-up household)
- **Password:** *(type it in yourself; don't paste it anywhere else)*
- The second, empty account (applereview2@maloca.com) goes in the review notes below. Leave it with no data, so it starts as a brand-new user.

**Review Notes** (replace [PASSWORD]; about 3,300 characters, Apple allows 4,000)

> Maloca covers London only. There are two test accounts. Please use them in this order: Account 1 is already set up, so you can see the app in use; Account 2 is empty, so you can try everything a new user does.
>
> PART 1 - ACCOUNT 1 (ALREADY SET UP)
>
> Sign in: on the first screen tap "I already have an account", then "Sign in with email", and use the account in the sign-in fields above.
>
> Things to try:
> - Map: drag the commute slider and watch the shaded area change. Swipe the row of area cards at the bottom and tap one to see prices and what it shares with the areas the household loves. The Rightmove button shows a short tip the first time (its Continue button unlocks after 5 seconds), then opens Rightmove with the household's search.
> - Ask tab: try "What's Clapham Common like?", "What's our route to work from Earlsfield?" or "Plan an afternoon in Tooting", then tap the suggested follow-up questions under each answer.
> - Viewings tab: switch between Want to see, Booked in and Viewed. "Call agent" opens the phone's own dialler with the estate agent's number from the listing; nothing is called automatically. "Add time" records a viewing time. In "Must-haves", drag items into order by their handles. To add a property, tap "Add" and paste any rightmove.co.uk/properties/ link, or add one by hand.
> - Settings tab: the Rightmove search and sharing with a household. Please test "Delete my account" on Account 2 only, so Account 1 stays set up.
>
> When finished: Settings tab, then "Sign out". The app returns to the first screen.
>
> PART 2 - ACCOUNT 2 (NEW USER)
>
> applereview2@maloca.com, password [PASSWORD]
> Suggested answers are given for each step, for anyone not familiar with London.
>
> 1. On the first screen tap "Get started".
> 2. "Someone else in the house already have an account?": tap "No".
> 3. Who's moving in: name "Alex", then tap the station box, type "Bank" and choose "Bank / Monument", then "Done" on the walking time. Tap "+ Add another person": name "Sam", station "Canary Wharf". Tap "Show me where we could live".
> 4. On the map, tap the dark "Tap here to explore more" card, then "Sign in with email", and sign in with Account 2.
> 5. Six setup steps follow:
>    1. Areas you are considering: type "Clapham Common and Balham"
>    2. What you like about them: type "The big common, good cafes and pubs, and a quick Tube into the City"
>    3. Your evenings and weekends: type "Out with friends a couple of evenings a week, brunch and long walks at weekends"
>    4. Where you would not want to live: type "Croydon" and tap "East Croydon". Would you live in Zone 1: tap "No". Then "Continue".
>    5. Where most of your people live: tap "S"
>    6. Do schools matter: tap "Not a factor"
> 6. The map then shows the household's areas, with a short 4-step guide to the app.
>
> To run the setup questions again: Settings tab, then "Run the Ask Maloca questions again". Account deletion can be tested here: Settings tab, then "Delete my account".
>
> OTHER INFORMATION
>
> - The AI features (the Ask tab and area matching) use Anthropic's Claude through our own server. No names or email addresses are sent to it.
> - Camera, microphone and photo library are only requested when you choose to add a video to a viewing. Location is optional and only shows your position on the map.

---

## 4. What to Test (on the build)

> Thanks for testing Maloca. Please try:
>
> 1. Setting up: add who's moving in and where you each work, then answer the setup questions.
> 2. The map: move the commute slider and open the area cards.
> 3. Ask: try "What's Clapham Common like?", "Plan an afternoon in Tooting" or "What's our route to work from Earlsfield?", then tap the follow-up suggestions under each answer.
> 4. Viewings: paste a Rightmove listing link to add a property, call the agent and add the viewing time, then score it after you've seen it. Switch between Want to see, Booked in and Viewed.
> 5. Must-haves: add a few and drag them into order.
>
> If anything is confusing, slow or wrong, take a screenshot and send it through TestFlight.

---

## 5. Privacy policy: suggested additions

Under the list of third-party services on https://maloca.homes/privacy.html:

> **Google Places** - when you ask about places in an area (pubs, cafes, a day out), our server asks Google for nearby places and their photos and ratings. Only the area and what you asked about are sent, never your name or email.
>
> **Transport for London** - when you ask how you'd get to work from an area, our server asks TfL's Journey Planner for the route between two stations. Only the station names are sent.

And in the existing Rightmove line, after "reads back the address, price and location":

> and the estate agent's name and phone number shown on the listing, so you can call them to book a viewing

And under "What we collect", one line for the email login:

> If you sign in with an email address and password (used for accounts we create for testing), we store that email address.

---

## 6. Already in order (nothing to do)

- Sign in with Apple is offered alongside Google (guideline 4.8).
- Accounts can be deleted inside the app (guideline 5.1.1).
- Every permission prompt has a plain-English reason (camera, microphone, photos, location).
- Encryption question: answered in the app itself ("no non-exempt encryption"), so App Store Connect won't ask.
- Privacy policy and terms are live at maloca.homes.
- Privacy manifest is set, with no tracking.

---

## 7. The order of clicks

1. Build 9 finishes processing in App Store Connect (about 10 to 30 minutes after it uploads; it uploads by itself when the build finishes).
2. TestFlight → Test Information: fill in sections 2 and 3.
3. TestFlight → External Testing → create a group (e.g. "Friends") → add build 9 → fill in What to Test (section 4).
4. Submit for Beta App Review. First reviews usually take about a day; later builds of the same version often skip review.
5. Once approved, add testers by email or switch on a public link.
