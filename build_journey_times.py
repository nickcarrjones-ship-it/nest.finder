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
import os
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

# Where partial progress is saved, so an interrupted run resumes instead of
# losing hours of work. Deleted automatically on a successful finish.
PROGRESS_FILE = "data/.journey-times-progress.json"

# A free TfL developer key (https://api-portal.tfl.gov.uk) raises the rate
# limit well above the unregistered allowance, cutting a full run from hours
# to well under one. Read from tfl_key.txt (git-ignored) or the TFL_APP_KEY
# environment variable. Works without one — just slower.
def _load_app_key():
    env_key = os.environ.get("TFL_APP_KEY", "").strip()
    if env_key:
        return env_key
    try:
        with open("tfl_key.txt") as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""

APP_KEY = _load_app_key()

# Unregistered use gets rate-limited above roughly 100 requests/minute
# (confirmed empirically — 429s appeared at ~400/min). With a key we can
# push considerably harder.
SLEEP_SECONDS = 0.12 if APP_KEY else 0.6

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
    if APP_KEY:
        params["app_key"] = APP_KEY
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

    # Key format for journey-times.json: area name → {dest_id → minutes}
    # dest_id is the slugified Zone 1 station name (lowercase, underscores)
    def slug(name):
        return name.lower().replace("'", "").replace(" ", "_").replace(".", "")

    # Resume from a previous interrupted run if one exists. A full run is
    # ~19k requests, so losing it all to a dropped connection or a closed
    # laptop at hour two would be painful.
    results = {}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            results = json.load(f)
        already = sum(len(v) for v in results.values())
        print(f"Resuming: {already:,} of {total:,} journeys already fetched.")

    done = sum(len(v) for v in results.values())

    print(f"NestFinder Journey Time Generator")
    print(f"Fetching {total:,} journeys from TfL API"
          f"{' (with app key)' if APP_KEY else ' (no app key — slower; see tfl_key.txt)'}...")
    remaining = total - done
    print(f"Estimated time for the {remaining:,} remaining: "
          f"~{round(remaining * SLEEP_SECONDS / 60)} minutes")
    print()

    start = time.time()
    for origin in origin_stations:
        origin_name = origin["name"]
        # TfL's Journey Planner accepts "lat,lon" as a from/to location,
        # same as a NaPTAN code — needed since outer areas have no NaPTAN
        # code in stations.json, only coordinates.
        origin_id = f"{origin['lat']},{origin['lng']}"
        row = results.setdefault(origin_name, {})

        for dest_name in dest_names:
            key = slug(dest_name)
            if key in row:
                continue  # already fetched on a previous run

            if origin_name == dest_name:
                row[key] = 0
                continue

            dest_id = ZONE1_STATIONS[dest_name]
            row[key] = get_journey_time(origin_id, dest_id)
            done += 1

            if done % 100 == 0:
                pct = round(done / total * 100)
                mins = round((time.time() - start) / 60, 1)
                print(f"  {done:,}/{total:,} ({pct}%) — {mins} min this run")
                sys.stdout.flush()
                # Checkpoint alongside the progress print so an interrupted
                # run never loses more than ~100 requests' worth of work.
                with open(PROGRESS_FILE, "w") as f:
                    json.dump(results, f)

            time.sleep(SLEEP_SECONDS)

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

    # Sanity gate before overwriting the live file. A partial or malformed
    # run should never silently replace good data — the whole app's core
    # feature depends on this file.
    expected_areas = len(origin_stations)
    failures = [(o, d) for o in results for d in results[o] if results[o][d] is None]
    failure_rate = len(failures) / max(total, 1)

    if len(results) < expected_areas:
        print(f"\nREFUSING TO WRITE: only {len(results)} of {expected_areas} areas "
              f"were fetched. Progress is saved in {PROGRESS_FILE} — re-run to resume.")
        return
    if failure_rate > 0.10:
        print(f"\nREFUSING TO WRITE: {len(failures):,} of {total:,} journeys "
              f"({failure_rate:.0%}) returned no data — that's too high to trust. "
              f"Progress is saved in {PROGRESS_FILE}. Investigate before writing "
              f"(the previous good file has been left untouched).")
        return

    with open("data/journey-times.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nDone! Written to data/journey-times.json")

    # Clean up the resume file now the real output is safely written.
    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)

    # Report failures
    if failures:
        print(f"\n{len(failures)} routes returned no data (likely no direct route):")
        for o, d in failures[:20]:
            print(f"  {o} → {d}")
        print("These will be treated as 'no data' in the app.")

if __name__ == "__main__":
    main()
