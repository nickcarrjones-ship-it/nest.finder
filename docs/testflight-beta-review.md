# TestFlight beta review: everything to submit

Prepared 5 October 2026, updated 6 October. Paste the text blocks straight into App Store Connect.

---

## 1. Before you press Submit (blockers)

1. **Build 8: started 6 October, uploading itself to TestFlight.** It has everything up to the day planner's market fix baked in, so a reviewer's first launch has the email login. Wait for it to show as ready in App Store Connect before submitting.
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
- The second, empty account goes in the review notes below. Create it first in Firebase console → Authentication → Users → Add user, e.g. applereview2@maloca.com. Leave it with no data, so it starts as a brand-new user.

**Review Notes** (replace the two bracketed parts)

> Maloca covers London only. There are two test accounts.
>
> ACCOUNT 1 (in the sign-in fields above) is a household that is already set up, so you can explore the map, Ask and Viewings straight away.
>
> ACCOUNT 2 is empty, to try the new-user setup: applereview2@maloca.com, password [PASSWORD].
>
> To sign in with either: on the first screen tap "I already have an account", then "Sign in with email". (The "Get started" button lets anyone explore the map without an account, and signing in from there offers Apple and Google only.)
>
> NEW-USER SETUP (Account 2). After signing in you are asked 6 steps. Suggested answers, for anyone not familiar with London:
> 1. Areas you are considering: type "Clapham Common and Balham"
> 2. What you like about them: type "The big common, good cafes and pubs, and a quick Tube into the City"
> 3. Your evenings and weekends: type "Out with friends a couple of evenings a week, brunch and long walks at weekends"
> 4. Where you would not want to live: type "Croydon" and tap "East Croydon". Would you live in Zone 1: tap "No". Then "Continue".
> 5. Where most of your people live: tap "S"
> 6. Do schools matter: tap "Not a factor"
>
> The map then asks who is moving in. Name "Alex", work station: type "Bank" and choose "Bank / Monument", then "Done" on the walking time. Tap "+ Add another person": name "Sam", work station "Canary Wharf". Then tap "Show me where we could live". A short 4-step guide to the app follows.
>
> To run the setup questions again on Account 2: Settings tab, then "Run the Ask Maloca questions again".
>
> Viewings tab: properties are added by pasting a Rightmove listing link, or by hand. "Call agent" on a saved property opens the phone's own dialler with the estate agent's number from the listing; nothing is called automatically.
>
> The AI features (the Ask tab and area matching) use Anthropic's Claude through our own server. No names or email addresses are sent to it.
>
> Account deletion: Settings tab, then "Delete my account".
>
> Camera, microphone and photo library are only requested when you choose to add a video to a viewing. Location is optional and only shows your position on the map.

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

1. Build 8 finishes processing in App Store Connect (about 10 to 30 minutes after it uploads; it uploads by itself when the build finishes).
2. TestFlight → Test Information: fill in sections 2 and 3.
3. TestFlight → External Testing → create a group (e.g. "Friends") → add build 8 → fill in What to Test (section 4).
4. Submit for Beta App Review. First reviews usually take about a day; later builds of the same version often skip review.
5. Once approved, add testers by email or switch on a public link.
