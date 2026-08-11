"""
build_journey_times.py — TfL-sourced journey times for NestFinder

Generates journey times from every area in data/stations.json (262 areas —
Zone 1 hubs AND outer residential areas) to the 73 Zone 1 destination
stations below, using TfL's public Journey Planner API. Outer-area origins
are queried by lat/lng (TfL's API accepts "lat,lon" as a from/to location,
same as a NaPTAN code or postcode) since stations.json has no NaPTAN code
for them.

HOW TO RUN THIS:
  1. Make sure Python 3 is installed on your computer
  2. Open Terminal (Mac) or Command Prompt (Windows)
  3. Run: python3 build_journey_times.py
  4. Wait — 262 origins x 73 destinations = ~19,100 requests at ~1.6/sec,
     so plan for a few hours, not the old 20-30 minute estimate (that
     figure was for a much smaller, since-outdated Zone1-to-Zone1-only
     version of this script).
  5. Copy the output file into nestfinder/data/journey-times.json

No API key required. TfL's Journey Planner is free for basic use.
"""

import json
import time
import urllib.request
import urllib.parse
import sys
from datetime import datetime, timedelta

# ── All Zone 1 stations with their TfL NaPTAN stop codes ─────────────────────
# NaPTAN codes are the official identifiers TfL's API uses.
# 940GZZLU = London Underground
# 910G     = National Rail / Overground / DLR hubs
ZONE1_STATIONS = {
    "Aldgate":                  "940GZZLUALD",
    "Aldgate East":             "940GZZLUADE",  # was 940GZZLUAGE — didn't exist, verified against TfL StopPoint
    "Angel":                    "940GZZLUAGL",
    "Baker Street":             "940GZZLUBST",  # was 940GZZLUBKR — didn't exist
    "Bank":                     "940GZZLUBNK",
    "Barbican":                 "940GZZLUBBN",
    "Battersea Power Station":  "940GZZBPSUST",  # was 940GZZLUBPS — didn't exist
    "Bermondsey":               "940GZZLUBMY",
    "Bethnal Green":            "910GBTHNLGR",  # was 940GZZLUBTN — didn't exist
    "Blackfriars":              "910GBLFR",  # was 910GBLKFR — didn't exist
    "Bond Street":              "940GZZLUBND",
    "Borough":                  "940GZZLUBOR",
    "Canary Wharf":             "910GCANWHRF",  # was 940GZZLUCYW — didn't exist
    "Cannon Street":            "910GCANONST",  # was 910GCNNRSTT — didn't exist
    "Chancery Lane":            "940GZZLUCHL",
    "Charing Cross":            "910GCHRX",  # was 910GCHARCRS — didn't exist
    "City Thameslink":          "910GCTMSLNK",  # was 910GCTYTML — didn't exist
    "Covent Garden":            "940GZZLUCGN",
    "Dalston Junction":         "910GDALS",  # was 910GDLSTNJ — didn't exist
    "Earl's Court":             "940GZZLUECT",  # was 940GZZLUERC — resolved to the WRONG station (Edgware Road)
    "Elephant and Castle":      "940GZZLUEAC",
    "Embankment":               "940GZZLUEMB",
    "Euston":                   "910GEUSTON",
    "Euston Square":            "940GZZLUESQ",  # was 940GZZLUESG — didn't exist
    "Farringdon":               "910GFRNDNLT",  # was 910GFRNDN — didn't exist
    "Fenchurch Street":         "910GFENCHRS",  # was 910GFNCHSTS — didn't exist
    "Gloucester Road":          "940GZZLUGTR",
    "Goodge Street":            "940GZZLUGDG",  # was 940GZZLUGGST — didn't exist
    "Great Portland Street":    "940GZZLUGPS",
    "Green Park":               "940GZZLUGPK",
    "Haggerston":               "910GHAGGERS",  # was 910GHGRSTN — didn't exist
    "High Street Kensington":   "940GZZLUHSK",
    "Highbury and Islington":   "910GHGHI",
    "Holborn":                  "940GZZLUHBN",
    "Hoxton":                   "910GHOXTON",
    "Hyde Park Corner":         "940GZZLUHPC",
    "Kennington":               "940GZZLUKNG",  # was 940GZZLUKNNG — didn't exist
    "King's Cross St Pancras":  "910GKNGX",
    "Knightsbridge":            "940GZZLUKNB",
    "Lambeth North":            "940GZZLULBN",
    "Lancaster Gate":           "940GZZLULGT",
    "Leicester Square":         "940GZZLULSQ",
    "Liverpool Street":         "910GLIVST",
    "London Bridge":            "910GLNDNBDC",  # was 910GLONDBDG — didn't exist
    "Mansion House":            "940GZZLUMSH",
    "Marble Arch":              "940GZZLUMBA",
    "Marylebone":               "910GMARYLBN",
    "Monument":                 "940GZZLUMMT",
    "Moorgate":                 "910GMRGT",  # was 910GMOORGT — didn't exist
    "Nine Elms":                "940GZZNEUGST",  # was 940GZZLUNNE — didn't exist
    "Old Street":               "940GZZLUOLD",
    "Oxford Circus":            "940GZZLUOXC",
    "Paddington":               "910GPADTON",
    "Piccadilly Circus":        "940GZZLUPCC",
    "Pimlico":                  "940GZZLUPCO",
    "Regent's Park":            "940GZZLURGP",
    "Russell Square":           "940GZZLURSQ",
    "Shoreditch High Street":   "910GSHRDHST",  # was 910GSRDCHSH — didn't exist
    "Sloane Square":            "940GZZLUSSQ",
    "South Kensington":         "940GZZLUSKS",  # was 940GZZLUSKN — didn't exist
    "Southwark":                "940GZZLUSWK",
    "St James's Park":          "940GZZLUSJP",
    "St Paul's":                "940GZZLUSPU",
    "Stepney Green":            "940GZZLUSGN",  # was 940GZZLUSGR — didn't exist
    "Temple":                   "940GZZLUTMP",  # was 940GZZLUTEM — didn't exist
    "Tower Gateway":            "940GZZDLTWG",  # was 940GZZLUTOG — didn't exist
    "Tower Hill":               "940GZZLUTWH",  # was 940GZZLUTOH — didn't exist
    "Vauxhall":                 "910GVAUXHLM",  # was 910GVXHLMET — didn't exist
    "Victoria":                 "910GVICTRIC",  # was 910GVICTRIA — didn't exist
    "Warren Street":            "940GZZLUWRR",
    "Waterloo":                 "910GWATRLMN",  # was 910GWTRLMET — didn't exist
    "Westminster":              "940GZZLUWSM",
    "Whitechapel":              "940GZZLUWCE",
}

BASE_URL = "https://api.tfl.gov.uk/Journey/JourneyResults"
TIME_STR = "0830"       # 08:30 departure — peak, matching a real commute rather than off-peak

def _next_tuesday():
    # TfL's Journey Planner rejects any date more than ~7 days in the past
    # (confirmed by hitting that exact error while testing this script), so
    # a hardcoded date silently goes stale within a week or two. Computing
    # it fresh each run — the next upcoming Tuesday, or today if it already
    # is one — means this can't quietly break again.
    today = datetime.now()
    days_ahead = (1 - today.weekday()) % 7  # Monday=0 ... Tuesday=1
    return (today + timedelta(days=days_ahead)).strftime("%Y%m%d")

DATE = _next_tuesday()

def get_journey_time(from_id, to_id, retries=2):
    params = {
        "date": DATE,
        "time": TIME_STR,
        "timeIs": "Departing",
        "journeyPreference": "LeastTime",
        "mode": "tube,dlr,elizabeth-line,overground,national-rail",
        # NOTE: a "walkingOptimization": "TotalTime" param used to be here.
        # TfL's API now rejects it outright ("The value 'TotalTime' is not
        # valid for Boolean") — confirmed by testing directly against the
        # live API. Removed; TfL's default behaviour is sensible without it.
    }
    url = (BASE_URL + "/" + urllib.parse.quote(from_id) + "/to/" +
           urllib.parse.quote(to_id) + "?" + urllib.parse.urlencode(params))
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "NestFinder/1.0"})
            with urllib.request.urlopen(req, timeout=15) as response:
                data = json.loads(response.read())
            journeys = data.get("journeys", [])
            if not journeys:
                return None
            best = min(journeys, key=lambda j: j.get("duration", 9999))
            return best.get("duration")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"    Rate limited, waiting 30s...")
                time.sleep(30)
            else:
                return None
        except Exception:
            if attempt < retries:
                time.sleep(2)
    return None

def main():
    with open("data/stations.json") as f:
        origin_stations = json.load(f)  # [{name, lat, lng}, ...] — 262 areas

    dest_names = sorted(ZONE1_STATIONS.keys())
    total = len(origin_stations) * len(dest_names)
    done = 0
    results = {}

    # Key format for journey-times.json: area name → {dest_id → minutes}
    # dest_id is the slugified Zone 1 station name (lowercase, underscores)
    def slug(name):
        return name.lower().replace("'", "").replace(" ", "_").replace(".", "")

    print(f"NestFinder Journey Time Generator")
    print(f"Fetching {total} journeys from TfL API...")
    print(f"Estimated time: ~{round(total * 0.6 / 60)} minutes")
    print()

    for origin in origin_stations:
        origin_name = origin["name"]
        # TfL's Journey Planner accepts "lat,lon" as a from/to location,
        # same as a NaPTAN code — needed since outer areas have no NaPTAN
        # code in stations.json, only coordinates.
        origin_id = f"{origin['lat']},{origin['lng']}"
        results[origin_name] = {}

        for dest_name in dest_names:
            if origin_name == dest_name:
                results[origin_name][slug(dest_name)] = 0
                continue

            dest_id = ZONE1_STATIONS[dest_name]
            mins = get_journey_time(origin_id, dest_id)
            results[origin_name][slug(dest_name)] = mins
            done += 1

            if done % 20 == 0:
                pct = round(done / total * 100)
                elapsed = round(done * 0.6 / 60, 1)
                print(f"  {done}/{total} ({pct}%) — ~{elapsed} min elapsed")
                sys.stdout.flush()

            time.sleep(0.6)  # ~1.6 req/sec — well within TfL's limits

    # Write output
    output = {
        "_readme": (
            "Journey times in minutes from each area (data/stations.json) to "
            "Zone 1 destination stations. "
            "Generated from TfL Journey Planner API, peak Tuesday 08:30 departure. "
            "Includes actual interchange walking times between platforms. "
            "Run build_journey_times.py to regenerate."
        )
    }
    # Add stations in alphabetical order
    for name in sorted(results.keys()):
        output[name] = results[name]

    with open("data/journey-times.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nDone! Written to data/journey-times.json")

    # Report failures
    failures = [(o, d) for o in results for d in results[o] if results[o][d] is None]
    if failures:
        print(f"\n{len(failures)} routes returned no data (likely no direct route):")
        for o, d in failures[:20]:
            print(f"  {o} → {d}")
        print("These will be treated as 'no data' in the app.")

if __name__ == "__main__":
    main()
