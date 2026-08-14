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
import threading
from concurrent.futures import ThreadPoolExecutor
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
    "Old Street":               "940GZZLUODS",  # was 940GZZLUOLD — didn't exist (missed in the earlier fix pass)
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
    "Whitechapel":              "940GZZLUWPL",  # was 940GZZLUWCE — didn't exist (missed in the earlier fix pass)
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

# Each request is ~0.9s of network round-trip, so throughput is governed by
# how many run in parallel, not by the sleep. TfL's registered tier allows
# 500/min; 6 workers with a small per-request pause lands comfortably under
# that (~370/min worst case) while cutting a ~5 hour sequential run to well
# under an hour. Unregistered, stay slow and sequential-ish — 429s appeared
# at roughly 400/min when tested without a key.
WORKERS = 6 if APP_KEY else 2
SLEEP_SECONDS = 0.1 if APP_KEY else 0.6

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

def get_journey_time(from_id, to_id, retries=2, extra_mode=None):
    # bus is included deliberately: excluding it made some areas look
    # artificially slow/unreachable when a bus leg is genuinely the fastest
    # real option — that risked wrongly dropping a reachable area out of a
    # couple's search results. Rail modes are listed first so LeastTime
    # still prefers them when a rail-only route is comparably fast.
    modes = "tube,dlr,elizabeth-line,overground,national-rail,bus"
    if extra_mode:
        modes += "," + extra_mode
    params = {
        "date": DATE,
        "time": TIME_STR,
        "timeIs": "Departing",
        "journeyPreference": "LeastTime",
        "mode": modes,
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
    with open("data/origin-codes.json") as f:
        origin_codes = json.load(f)  # name -> {id, needs_tram_mode?} — real TfL station codes,
        # resolved and individually verified against TfL's own naming (see project notes).
        # Using a real code rather than raw coordinates matters: an imprecise coordinate
        # makes TfL add a genuine "walk to the nearest station" leg before the journey even
        # starts, silently inflating results by 10-20+ minutes for areas whose stored
        # lat/lng weren't exactly on the platform.

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

    # Build the full list of outstanding work up front, so it can be spread
    # across worker threads. Each request takes ~0.9s of pure network
    # round-trip, so doing them one at a time caps the whole run at roughly
    # one per second regardless of what the rate limit allows — that's what
    # made a sequential run ~5 hours despite the key permitting 500/min.
    pending = []  # (origin_name, origin_id, dest_key, dest_id, extra_mode)
    for origin in origin_stations:
        origin_name = origin["name"]
        origin_info = origin_codes[origin_name]
        origin_id = origin_info["id"]
        extra_mode = "tram" if origin_info.get("needs_tram_mode") else None
        row = results.setdefault(origin_name, {})
        for dest_name in dest_names:
            key = slug(dest_name)
            if key in row:
                continue  # already fetched on a previous run
            if origin_name == dest_name:
                row[key] = 0
                continue
            pending.append((origin_name, origin_id, key, ZONE1_STATIONS[dest_name], extra_mode))

    print(f"NestFinder Journey Time Generator")
    print(f"Fetching {total:,} journeys from TfL API"
          f"{' (with app key)' if APP_KEY else ' (no app key — slower; see tfl_key.txt)'}...")
    print(f"{len(pending):,} outstanding, {WORKERS} parallel workers")
    # ~0.9s round-trip per request, divided across workers (measured, not
    # assumed — an earlier estimate that counted only SLEEP_SECONDS was
    # wildly optimistic).
    est_min = len(pending) * (0.9 + SLEEP_SECONDS) / WORKERS / 60
    print(f"Estimated time: ~{round(est_min)} minutes")
    print()

    start = time.time()
    lock = threading.Lock()
    counter = {"done": done}

    def fetch(job):
        origin_name, origin_id, dest_key, dest_id, extra_mode = job
        mins = get_journey_time(origin_id, dest_id, extra_mode=extra_mode)
        with lock:
            results[origin_name][dest_key] = mins
            counter["done"] += 1
            n = counter["done"]
            if n % 200 == 0:
                pct = round(n / total * 100)
                elapsed = (time.time() - start) / 60
                rate = (n - done) / max(elapsed, 0.01)
                eta = (total - n) / max(rate, 1)
                print(f"  {n:,}/{total:,} ({pct}%) — {elapsed:.1f} min elapsed, "
                      f"~{eta:.0f} min left")
                sys.stdout.flush()
                # Checkpoint so an interrupted run never loses much work.
                with open(PROGRESS_FILE, "w") as f:
                    json.dump(results, f)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        list(pool.map(fetch, pending))

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
