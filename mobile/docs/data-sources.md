# Area data sources

The Agent's job is anchor-and-expand: someone names an area they already
love, and Maloca finds places elsewhere in London that genuinely feel like
it. That only works if the similarity comes from measured data rather than
the model's recollection of London — so every signal here has to be named,
dated and licensed, and anything we can't stand behind gets said out loud
rather than smoothed over.

Full reasoning and phasing: `~/.claude/plans/look-into-my-code-pure-cerf.md`.

## Status

| Signal | Source | Licence | State |
| --- | --- | --- | --- |
| Food composition | FSA food hygiene register | OGL | Probed 2026-08-27 — viable, see below |
| Rhythm of a place | TfL crowding API | TfL open data | Probed 2026-08-27 — excellent signal, tube only (42%) |
| Who lives there | Census 2021 | OGL | Not started |
| Housing stock | EPC register, Historic England | OGL | Not started |
| Change over time | Companies House | Free API | Not started |

Nothing is inherited from the web app without being re-derived. The web
app's council tax table has unknown provenance and covers 365 of 570 areas,
and its prompt claims Met Police crime data that no code ever fetches —
both are the reason for this discipline, not exceptions to it.

## FSA food hygiene register — probed 2026-08-27

`https://api.ratings.food.gov.uk/Establishments`, header `x-api-version: 2`.
No key, no rate limit hit during probing. Every food business in the country
with name, address, business type and usually a coordinate.

### What the probe showed

Five contrasting districts, fully paginated (every record, not a sample).
Composition as a share of food venues:

| District | Sit-down | Takeaway | Pubs/bars | Pubs/bars (n) | Venues |
| --- | --- | --- | --- | --- | --- |
| SW4 Clapham | 59% | 23% | 17% | 30 | 172 |
| N16 Stoke Newington | 71% | 19% | 10% | 28 | 275 |
| NW3 Hampstead | 61% | 32% | 7% | 22 | 295 |
| SE15 Peckham | 54% | 34% | 12% | 238 | 2007 |
| EC2 Liverpool St / Moorgate | 63% | 27% | 10% | 65 | 637 |

The shape separates areas the way a person would: Clapham has the highest
share of pubs and bars of the five, Peckham the highest share of takeaways,
Stoke Newington and Hampstead both skew to sitting down.

### Share alone is not enough — the City lesson

Nick queried the City's low pub share on 2026-08-27, and he was right to.
Look at the last two columns: **EC2 has 65 pubs and bars against Clapham's
30 — more than twice as many — while showing a lower share**, because it is
swamped by roughly 400 lunch places feeding office workers.

So the plan's "shape, not size" framing is only half the story. **A share
describes an area's balance; it hides its intensity.** Someone asking whether
the City is lively after work would be actively misled by the share. The
fingerprint needs proportions *and* density, and the pair has to be read
together.

The City is also the warning case for density: almost nobody lives there, so
per-resident density will be wild. Normalise by resident population *and*
sanity-check against workday population before trusting it.

### Two methodology traps, both hit during probing

- **Pagination.** The first probe capped every district at 400 records
  without checking `meta.totalCount`. Four of five were truncated, and the
  truncated ordering is not random — it moved the City's pub share from 6%
  to 10% and Hampstead's takeaway share by eight points. Always paginate to
  `totalCount`.
- **The FSA registers far more than food venues.** Childminders, care homes,
  schools and shops are all in there — 2,301 of Peckham's 4,308 records.
  Only `Restaurant/Cafe/Canteen`, `Takeaway/sandwich shop` and
  `Pub/bar/nightclub` belong in the denominator. Getting this filter wrong
  swamps the signal entirely.

**89% of records carry a usable lat/lng**, which is the finding that makes
this buildable — areas can be keyed by a radius around each station rather
than by postcode text, and postcode districts are far too coarse to stand in
for a station area.

**Chain detection works as designed.** Counting how often a business name
repeats across London surfaced Costa, Nando's, Caffè Nero, Tesco, KFC and
Gail's at the top, with 90% of names appearing once. Independent share is a
real measurable, and it's much closer to what people mean by "independent
coffee shops" than any raw count.

### The correction the probe forced

**FSA business types are coarser than the plan assumed.** The register uses
one bucket called `Restaurant/Cafe/Canteen` and another called
`Pub/bar/nightclub`. So the planned café-versus-restaurant split — which is
the difference between brunch-and-families and destination-dining — **cannot
come from FSA at all**.

What FSA gives is a reliable three-way split (sitting down, taking away,
drinking), complete coverage, official provenance and coordinates. The finer
texture has to come from somewhere with `amenity=cafe` versus
`amenity=restaurant` and cuisine tags — OpenStreetMap or Overture — which
have the categories but not the coverage.

So the design is both: FSA as the denominator and the ground truth for what
exists, OSM for the texture on top. Neither alone is enough, and the plan's
food fingerprint should be read with that split in mind.

### Caveats before building on this

- `address=` is a text search, useful for probing and wrong for the real
  build. Key by coordinate.
- The 11% without coordinates aren't random — they need checking for
  geographic bias before shares are treated as accurate.
- Ratings are hygiene scores, not quality. They say nothing about whether
  somewhere is any good, and must never be presented as if they do.
- Attribution is required: Open Government Licence.

## TfL crowding API — probed 2026-08-27

`https://api.tfl.gov.uk/crowding/{naptanId}/{Mon..Sun}`. No key needed for
probing, though a registered app key is needed for real use (see rate limits
below). Returns **`percentageOfBaseLine` in 15-minute bands for every day of
the week** — the shape of a station's day, measured.

This replaces the plan's reference to RODS, which is a survey of only 30–40
stations a year and weekday-only, so it never gave the Saturday-night signal
we wanted. The crowding API does.

### It works, and better than hoped

Two adjacent stations on the same line, one Saturday:

| Station | Peak value | Peak time |
| --- | --- | --- |
| Clapham Common | 0.22 | **00:15–00:30** |
| Clapham South | 0.10 | 00:30–00:45 |

Clapham Common is twice as busy as Clapham South and peaks *after midnight*.
That is a nightlife signature, and it separates two stations a mile apart on
the same line — exactly the discrimination the similarity engine needs and
exactly what the model's general knowledge of "Clapham" would flatten.

Hampstead peaks Saturday afternoon and is quiet late (a daytime
destination); Canary Wharf peaks Monday morning (an office dormitory). The
data reads the way a Londoner would describe these places.

### The values ARE comparable between stations

This was the decisive test, because similarity matching is worthless if each
station is normalised against itself. Saturday peaks range from Oxford
Circus 0.29 down to Chesham 0.03 — a tenfold spread that tracks real size.
So the figure carries **both shape and intensity**, which is precisely what
the FSA probe showed we were missing when working from shares alone.

### The serious limitation: tube only

Coverage measured by mode, throttled properly:

| Mode | Stations with crowding data |
| --- | --- |
| Tube (Northern) | 52 / 52 — 100% |
| Tube (Victoria) | 16 / 16 — 100% |
| Elizabeth line | 8 / 43 — 19% (only the tube interchanges) |
| Overground (Windrush) | 0 / 29 — 0% |
| DLR | 0 / 45 — 0% |
| Tram | 0 / 39 — 0% |

Matched against our own station list: **242 of 570 areas are tube stations
(42%). 328 areas have no rhythm signal at all** — Peckham Rye, Abbey Wood,
Alexandra Palace, Barnes, every DLR and Overground-only area.

This materially weakens the plan's claim that rhythm is "the strongest
signal available". It is the strongest signal *for the areas it covers*, and
it covers under half of them. Options, none free: fall back to ORR annual
station counts for National Rail (much coarser, no time-of-day), lean harder
on the food and character signals where rhythm is missing, or accept that
similarity is more confident in tube London and **say so in the output**
rather than hiding it.

### Rate limits — and a false negative they caused

The API throttles hard and returns HTTP 429 with no data. A first coverage
probe read those 429s as "no data available" and produced **18% coverage,
which was completely wrong** — the same stations came back at 100% once the
probe backed off and retried. Any pipeline built on this must check the
status code, not just whether the payload has content, or it will silently
record real stations as having no nightlife.

Register for an app key before building anything real, and throttle.

## The National Rail gap — options (Nick asked, 2026-08-27)

328 of 570 areas have no rhythm signal, and they are not fringe: Hackney
Central (579 venues, 53 pubs, 79% independent), Peckham Rye, Clapham
Junction, Herne Hill, Denmark Hill and Battersea Park are all in the blind
spot. These are prime house-hunting areas, so "accept the gap" is not an
answer on its own.

**1. Food only, lower confidence.** What the engine does today — those areas
compare on 5 dimensions instead of 12 and say so. Free, honest, works now,
but weakest exactly where interest is highest.

**2. ORR station usage estimates.** The Office of Rail and Road publishes
annual entry/exit counts for every National Rail station, free and open.
Recovers **intensity** everywhere, but is an annual total with no time-of-day
or day-of-week split, so it does not recover **rhythm**. Half the signal, and
a trustworthy half.

**3. Predicting rhythm from food — REJECTED, and worth recording why.** It is
tempting to learn the food→rhythm relationship on the 242 covered areas and
predict the rest. But the prediction would be a function of food, so matching
on both food and predicted rhythm counts the same evidence twice: two areas
with similar food would automatically get similar predicted rhythm. It would
raise apparent confidence without adding information. Five honest dimensions
beat twelve where seven are echoes.

**4. Premises licences.** Councils publish licensed premises, including late
licences — a direct measure of nightlife that **covers all of London
regardless of which operator runs the trains**, so it fixes the split at the
root rather than patching it. Cost: 32 boroughs, 32 formats, some on the
London Datastore and some not.

**Recommendation: 2 now, 4 properly.** ORR is small and restores intensity
everywhere. Licensing is the real fix and stops the map being two-tier — and
it is unglamorous enough that few competitors would bother, which is rather
the point.

## Known bias in the food data — found 2026-08-27, NOT yet fixed

The 11% of FSA records without coordinates are not a random sample, and
because `build-food.mjs` searches by location, anything ungeocoded is
invisible to it. Measured across 1,146 sampled venues:

| Venue type | Share missing coordinates |
| --- | --- |
| Takeaway/sandwich shop | **12%** |
| Restaurant/Cafe/Canteen | 4% |
| Pub/bar/nightclub | 4% |

**Takeaways are three times more likely to be missing**, so every area's
takeaway share reads low and its sit-down share reads high. And it varies by
borough — 25 missing in Hackney and 19 in Camden against 1 in Wandsworth —
so it distorts comparisons BETWEEN areas, which is exactly what the
similarity engine does.

**The fix, and it is also a better architecture.** Fetch by local authority
rather than by radius: that returns every record including the ungeocoded
ones, and it is 33 requests instead of 570. Then fill in missing coordinates
from the postcode via postcodes.io (free, open, no key, batches of 100), and
assign venues to areas locally by distance. Same output, no blind spot, far
fewer API calls, and radii become adjustable without refetching.

Until that lands, treat `takeawayShare` as a floor rather than a measurement,
and be aware that Hackney and Camden areas are the least complete.

## What `percentageOfBaseLine` actually means (Nick asked, 2026-08-27)

TfL's published API documentation does not define it — the swagger spec
covers a different crowding entity entirely. So it was determined
empirically, and the honest answer has three parts:

**It is comparable between stations.** A full Saturday's bands sum to 14.66
at Oxford Circus, 8.90 at Clapham Common and 1.57 at Chesham. If the value
were a share of each station's own day, every station would sum to the same
figure. They do not, and the totals track real station size — so ratios
between areas are meaningful, which is what the similarity engine needs.

**The denominator is unknown.** TfL does not publish what the baseline is
(most likely a pre-pandemic reference period). The values are a relative
busyness index: higher is busier, and one area being twice another is real.

**So the absolute number must never reach a user.** It is not "percent full",
not "percent of capacity", and quoting it as a percentage of anything would
be inventing a meaning we have not verified. The UI says *"busiest just after
midnight on a Friday"* or *"about twice as busy as its neighbour after dark"*
— statements the data genuinely supports — never "0.22".

### peakDay — a gap found the same day

`peakTime` was being stored without the day, which makes it close to
useless, and there is a trap underneath: **TfL's "Sat" data begins at
Saturday 00:00, so a peak in the Sat 00:15 band is Friday night.** The
script now records `peakDay` alongside. The dataset built on 2026-08-27
predates this and lacks the field; it is unaffected for matching, because
peak timing feeds the explanation rather than the comparison.

## What Nick's Chiswick challenge exposed (2026-08-27)

The engine ranked Chiswick Park 2nd most like Clapham Common. Nick rejected
it: different demographic, much further out, worse connected, "young people
don't go out in Chiswick", and 46 pubs looked far too high. Investigating
each point found three separate real problems.

### 1. The pub category is polluted, and unevenly

FSA's `Pub/bar/nightclub` includes anything with a drinks licence. Chiswick
Park's 46 included Chiswick Catholic Centre, Chiswick Memorial Club
Association, Gunnersbury Triangle Sports & Social Club and **Merkur Slots**,
a gaming arcade.

| Area | Classified | Actually going-out | Inflated by |
| --- | --- | --- | --- |
| Chiswick Park | 46 | 39 | 15% |
| High Barnet | 20 | 17 | 15% |
| Turnham Green | 49 | 44 | 10% |
| Clapham Common | 53 | 50 | 6% |
| Stoke Newington | 33 | 31 | 6% |

Suburbs are inflated roughly 2.5× more than inner areas — social clubs,
sports clubs and church halls are a suburban phenomenon — so this
systematically overstates suburban nightlife. A name filter removes most of
it and should be added to `build-food.mjs`.

### 2. The real gap: a gastropub and a nightclub are the same category

The George IV in Chiswick and Simmons Bar in Clapham are both
`Pub/bar/nightclub`. The distinction Nick is drawing — who goes, and until
when — is invisible to us. **Premises licence data is the fix**: a venue
licensed to 2am is a different animal from one closing at 11. This moves
licensing from "the proper fix for coverage" to "the thing that makes the
drink signal mean anything at all".

### 3. "Young professionals" is a demographic claim we cannot make

I described Chiswick as having "the same mix of young professionals and
families" as Clapham. **The data said nothing of the kind — that was model
recall presented as a finding**, precisely what this project exists to stop.
Census 2021 age profile and tenure mix answer it properly, which pulls Phase
2 forward: without it the engine cannot tell a young renting area from a
settled family one, and that is one of the first things anybody means by
"feels like".

### 4. Radius spans boroughs unevenly

Chiswick Park's 1-mile radius covers Ealing (17 pubs), Hounslow (28) and
Hammersmith & Fulham (1), reaching into Brentford and South Acton — several
separate high streets scored as one. Clapham Common's is 50 of 53 in
Lambeth. Fixed radii mean different things in different street patterns.

### The blending fix, and what it achieved

Rhythm is now blended across all stations within 1.2km, distance-weighted,
so an area is measured rather than a platform (`blendedRhythm` in
lib/similarity/features.ts). Chiswick Park's nightlife ratio fell from 0.43
to 0.34 against Clapham Common's 0.55, and it dropped from 2nd to 6th.

Balham barely moved (0.15 → 0.17) because its neighbours are also commuter
stations — so the area really does read as commuter-dominated, even though
its high road is lively. That remains a limitation of measuring anything
through station usage.

## ORR station usage — built 2026-08-27

`dataportal.orr.gov.uk`, Table 1410, April 2024 to March 2025, Open
Government Licence. A single CSV covering every National Rail station in
Great Britain — 2,586 with usage figures, 330 of which match our areas.

**This closed the coverage hole.** Any busyness signal at all went from
**42% of areas to 93%** (529 of 570); only 41 areas now have nothing. TfL
covers tube, ORR covers National Rail, and 43 areas have both.

It is an **annual total**, so it restores *how busy* and never *when*. Timing
still comes only from the TfL crowding data, and so is still tube-only.

### The interchange measure — the unexpected find

ORR reports interchanges separately from entries and exits, which lets us
measure the confound Nick exposed with Balham: how much of a station's
traffic never reaches the street.

| Area | Entries + exits | Interchange share |
| --- | --- | --- |
| Clapham Junction | 24.4m | 46% |
| Herne Hill | 2.4m | 30% |
| Hackney Central | 5.3m | 25% |
| Peckham Rye | 6.1m | 16% |
| East Dulwich | 1.3m | 0% |

A high ratio means the station's rhythm describes the railway rather than
the neighbourhood. Stored as `interchangeRatio`; **not yet applied** to
matching — the obvious use is to discount rhythm-derived dimensions where it
is high, on top of the existing blending.

Caveat worth remembering: ORR counts National Rail interchanges only, so
Balham's own tube-to-rail interchange is largely invisible here (it reads 4%).

## Licensing — no consolidated London source exists

Checked 2026-08-27: the London Datastore has no single licensed-premises
dataset. It is genuinely 32 boroughs in 32 formats, which is days of work.

**Substituted OpenStreetMap** (`build-venues.mjs`), which delivers three of
the four things licensing was wanted for:

- Café versus restaurant — the split FSA fundamentally cannot make
- Pub versus bar versus nightclub — the gastropub distinction behind
  Nick's Chiswick objection
- Cuisine diversity — the "cosmopolitan" measure the plan asked for
- **NOT closing times** — only ~28% of venues tag `opening_hours`, too
  sparse to trust, so `lateNight` is recorded but excluded from matching

**So a real late-licence signal remains outstanding**, and borough premises
licence data is still the only way to get it.

### Overpass etiquette — a self-inflicted block

Sixteen rapid tile queries got us temporarily blocked; even a small query
that had worked minutes earlier returned nothing. Overpass is a free shared
service. The script now issues four large queries with 25-second gaps after
a 90-second cooldown, and **reports a failed tile instead of recording zero
venues** — the same class of bug as the TfL rate-limit false negative, and
worth checking for in every future pipeline.
