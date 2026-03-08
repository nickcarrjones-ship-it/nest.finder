"""
build_journey_times.py — TfL-sourced journey times for NestFinder

This generates journey times between all zone 1 stations using 
TfL's public Journey Planner API.

HOW TO RUN THIS:
  1. Make sure Python 3 is installed on your computer
  2. Open Terminal (Mac) or Command Prompt (Windows)
  3. Run: python3 build_journey_times.py
  4. Wait ~20-30 minutes (it's rate-limited to be polite to TfL)
  5. Copy the output file into nestfinder/data/journey-times.json

No API key required. TfL's Journey Planner is free for basic use.
"""

import json
import time
import urllib.request
import urllib.parse
import sys
from datetime import datetime

# ── All Zone 1 stations with their TfL NaPTAN stop codes ─────────────────────
# NaPTAN codes are the official identifiers TfL's API uses.
# 940GZZLU = London Underground
# 910G     = National Rail / Overground / DLR hubs
ZONE1_STATIONS = {
    "Aldgate":                  "940GZZLUALD",
    "Aldgate East":             "940GZZLUAGE",
    "Angel":                    "940GZZLUAGL",
    "Baker Street":             "940GZZLUBKR",
    "Bank":                     "940GZZLUBNK",
    "Barbican":                 "940GZZLUBBN",
    "Battersea Power Station":  "940GZZLUBPS",
    "Bermondsey":               "940GZZLUBMY",
    "Bethnal Green":            "940GZZLUBTN",
    "Blackfriars":              "910GBLKFR",
    "Bond Street":              "940GZZLUBND",
    "Borough":                  "940GZZLUBOR",
    "Canary Wharf":             "940GZZLUCYW",
    "Cannon Street":            "910GCNNRSTT",
    "Chancery Lane":            "940GZZLUCHL",
    "Charing Cross":            "910GCHARCRS",
    "City Thameslink":          "910GCTYTML",
    "Covent Garden":            "940GZZLUCGN",
    "Dalston Junction":         "910GDLSTNJ",
    "Earl's Court":             "940GZZLUERC",
    "Elephant and Castle":      "940GZZLUEAC",
    "Embankment":               "940GZZLUEMB",
    "Euston":                   "910GEUSTON",
    "Euston Square":            "940GZZLUESG",
    "Farringdon":               "910GFRNDN",
    "Fenchurch Street":         "910GFNCHSTS",
    "Gloucester Road":          "940GZZLUGTR",
    "Goodge Street":            "940GZZLUGGST",
    "Great Portland Street":    "940GZZLUGPS",
    "Green Park":               "940GZZLUGPK",
    "Haggerston":               "910GHGRSTN",
    "High Street Kensington":   "940GZZLUHSK",
    "Highbury and Islington":   "910GHGHI",
    "Holborn":                  "940GZZLUHBN",
    "Hoxton":                   "910GHOXTON",
    "Hyde Park Corner":         "940GZZLUHPC",
    "Kennington":               "940GZZLUKNNG",
    "King's Cross St Pancras":  "910GKNGX",
    "Knightsbridge":            "940GZZLUKNB",
    "Lambeth North":            "940GZZLULBN",
    "Lancaster Gate":           "940GZZLULGT",
    "Leicester Square":         "940GZZLULSQ",
    "Liverpool Street":         "910GLIVST",
    "London Bridge":            "910GLONDBDG",
    "Mansion House":            "940GZZLUMSH",
    "Marble Arch":              "940GZZLUMBA",
    "Marylebone":               "910GMARYLBN",
    "Monument":                 "940GZZLUMMT",
    "Moorgate":                 "910GMOORGT",
    "Nine Elms":                "940GZZLUNNE",
    "Old Street":               "940GZZLUOLD",
    "Oxford Circus":            "940GZZLUOXC",
    "Paddington":               "910GPADTON",
    "Piccadilly Circus":        "940GZZLUPCC",
    "Pimlico":                  "940GZZLUPCO",
    "Regent's Park":            "940GZZLURGP",
    "Russell Square":           "940GZZLURSQ",
    "Shoreditch High Street":   "910GSRDCHSH",
    "Sloane Square":            "940GZZLUSSQ",
    "South Kensington":         "940GZZLUSKN",
    "Southwark":                "940GZZLUSWK",
    "St James's Park":          "940GZZLUSJP",
    "St Paul's":                "940GZZLUSPU",
    "Stepney Green":            "940GZZLUSGR",
    "Temple":                   "940GZZLUTEM",
    "Tower Gateway":            "940GZZLUTOG",
    "Tower Hill":               "940GZZLUTOH",
    "Vauxhall":                 "910GVXHLMET",
    "Victoria":                 "910GVICTRIA",
    "Warren Street":            "940GZZLUWRR",
    "Waterloo":                 "910GWTRLMET",
    "Westminster":              "940GZZLUWSM",
    "Whitechapel":              "940GZZLUWCE",
}

BASE_URL = "https://api.tfl.gov.uk/Journey/JourneyResults"
DATE     = "20250311"   # Tuesday, off-peak
TIME_STR = "1000"       # 10:00 departure

def get_journey_time(from_id, to_id, retries=2):
    params = {
        "date": DATE,
        "time": TIME_STR,
        "timeIs": "Departing",
        "journeyPreference": "LeastTime",
        "mode": "tube,dlr,elizabeth-line,overground,national-rail",
        "walkingOptimization": "TotalTime",
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
    names = sorted(ZONE1_STATIONS.keys())
    total = len(names) * (len(names) - 1)
    done = 0
    results = {}

    # Key format for journey-times.json: station name → {dest_id → minutes}
    # dest_id is the slugified station name (lowercase, underscores)
    def slug(name):
        return name.lower().replace("'", "").replace(" ", "_").replace(".", "")

    print(f"NestFinder Journey Time Generator")
    print(f"Fetching {total} journeys from TfL API...")
    print(f"Estimated time: ~{round(total * 0.6 / 60)} minutes")
    print()

    for origin_name in names:
        origin_id = ZONE1_STATIONS[origin_name]
        results[origin_name] = {}

        for dest_name in names:
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
            "Journey times in minutes between Zone 1 stations. "
            "Generated from TfL Journey Planner API, off-peak Tuesday 10:00. "
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
