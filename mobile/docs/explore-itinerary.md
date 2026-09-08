# Explore this area — the visit itinerary

Nick's idea, 2026-09-08. Once the app has suggested five areas like the
ones someone already loves, it should give them a reason to go and stand in
one — a short itinerary of real places that match what they said they like,
with a Google Maps link to each.

This closes the loop the app currently leaves open. It tells people to go
and look, then gives them nothing to do when they arrive. It is also the
step that produces the visit, which produces the verdict, which is the only
part of this product that compounds (`learning-loop.md`).

Not built yet. This is the design and, more importantly, the constraints
that shape it — because two of them are hard and one of them is the reason
this cannot be built the way every other dataset in this app is built.

---

## The constraint that decides the architecture

**Google's terms let you cache `place_id` indefinitely, and essentially
nothing else.** Display names, addresses, ratings and photos have no
caching exception and must be re-fetched each time they are shown.
Latitude/longitude may be held for 30 days.

Every other dataset here is aggregated once by a `scripts/build-*.mjs` job
and shipped as JSON. **That pattern is unavailable.** A shipped
`area-itineraries.json` would be storing exactly the fields Google forbids,
and it would be storing them in a file checked into a public repository.

So this feature is generated on demand, per view, and the only thing that
persists between views is a list of place IDs.

## The other constraint: the free tier is small and easy to spend

Google withdrew the $200 monthly credit on 28 February 2025 and replaced it
with per-SKU free monthly allowances:

| Tier | Free calls / month | Fields |
|---|---|---|
| Essentials | 10,000 | ids only |
| Pro | 5,000 | display name, address, location, types |
| **Enterprise** | **1,000** | **+ rating, opening hours** |

**A request is billed at the highest tier of any field in its mask.** One
`rating` in an otherwise-Pro call re-prices the whole call to Enterprise.
The difference between 5,000 free calls and 1,000 is a single field.

At ~3 searches per itinerary, the Enterprise allowance is about **330
itineraries a month** before it costs $35/1,000. Ample for Nick and Harriet
and a small beta; not ample for a public launch, which is what the design
below is shaped around.

---

## Design

### Where it lives
A swipeable strip inside the area card, below the schools section — which
is already a collapsed block, so the pattern exists. Shut by default like
schools: an itinerary nobody asked for is furniture, and it costs money to
render.

### What generates it

1. **Their preferences become search queries.** `anchorReason` and
   `preferenceTags` already hold what they said they liked, in their own
   words — "the common and being able to walk to a decent pub". The LLM
   turns that into two or three Places queries ("independent coffee shop",
   "traditional pub"). This is the model doing what it is good at:
   reading intent, not recalling facts.

2. **Places Text Search finds candidates**, biased to the area's
   coordinates. Ratings requested HERE and only here — this is the one call
   where quality is the point, so it pays Enterprise knowingly.

3. **We keep the place IDs and our own reasoning**, and nothing else.
   The sentence "a small independent place, five minutes from the station"
   is OUR content and may be stored, keyed by place ID. The venue's *name*
   is Google's and may not.

4. **On every view, Place Details re-fetches the names** — display name and
   location only, which stays in the Pro tier and the 5,000 allowance. The
   stored reasoning is paired back on.

5. **The Maps link costs nothing.** A plain
   `https://www.google.com/maps/search/?api=1&query=…` URL needs no API key
   and no billing, so the "take me there" half is free however this goes.

### What it must not say

The app's rule is that there are no adjectives we cannot defend
(`lib/similarity/describe.ts`). "The coolest independent cafe" is exactly
that. A rating is defensible — "4.6 from 800 reviews" is a number with a
source. "Coolest" is not.

So an itinerary names real places and says **why they match what the
household said**, and lets the link do the judging.

---

## The free fallback, which is already half-built

The FSA register the app already downloads carries `BusinessName` on every
food business, and `scripts/build-food.mjs` already contains chain
detection — `nameKey`, names that recur across London, which is how
`independentShare` is computed. It aggregates all of that away into counts.

That means **named, genuinely independent cafes and pubs per area, for
free, and storable**, using the same independence method the ranking
already trusts. 89% of FSA records carry coordinates.

What FSA cannot give is quality. It holds hygiene ratings, which
`build-food.mjs` explicitly rejects as saying nothing about whether a place
is good.

**When to reach for it:** if Places usage approaches the free ceiling, or
when this needs to work on a free tier at launch. An FSA itinerary is
thinner — real places, no quality signal — but it costs nothing per view
and can be built once and shipped like everything else.

---

## Phasing

1. **Prove it's any good.** Places, on demand, no persistence beyond place
   IDs. 1,000 Enterprise calls a month is plenty to find out whether people
   actually go, which is the only question that matters at this stage.
2. **Measure.** Count generations against the allowance before assuming
   anything about cost at scale.
3. **Decide.** Either the FSA version becomes the default and Places
   becomes a paid-tier upgrade, or usage stays small enough that it does
   not matter.

## Open questions

- Does an itinerary belong to the household or the person? Two people
  visiting the same area probably want the same list, which argues for
  storing place IDs on the household.
- Should a completed visit prompt the verdict capture directly? That is the
  loop closing properly, and the verdict UI already exists.
- Opening hours are Enterprise-tier and would double the cost of a call.
  Worth it only if the itinerary claims a time of day.
