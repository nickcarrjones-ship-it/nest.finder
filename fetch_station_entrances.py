#!/usr/bin/env python3
"""
Phase 2 of the walking-catchment build: find where you actually walk INTO
each station.

Walking isochrones must start at a door, not at the middle of a platform.
A survey of 40 stations found the furthest entrance sits a median 43m from
the point we currently store, but up to 198m at West Hampstead Thameslink —
about two minutes, which is most of a small walk budget.

TfL hangs entrances off the interchange HUB rather than the station record,
so this drills: station -> hubNaptanCode -> children -> their children.

Stations with no published entrance fall back to the stored station point,
recorded honestly in the output so it is visible rather than silent.

Writes data/station-entrances.json. Reads nothing it can damage.
"""

import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ENTRANCE_TYPES = {"NaptanMetroEntrance", "NaptanRailEntrance"}
OUT = "data/station-entrances.json"


def _load_app_key():
    for p in ("tfl_key.txt", os.path.expanduser("~/.tfl_key")):
        try:
            with open(p) as f:
                k = f.read().strip()
                if k:
                    return k
        except OSError:
            pass
    return os.environ.get("TFL_APP_KEY", "").strip() or None


APP_KEY = _load_app_key()


def get(url):
    if APP_KEY:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({"app_key": APP_KEY})
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                continue
            return None
        except Exception:
            continue
    return None


def metres(a, b):
    R = 6371000.0
    dp = math.radians(b[0] - a[0])
    dl = math.radians(b[1] - a[1])
    h = (math.sin(dp / 2) ** 2 +
         math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dl / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


codes = json.load(open("data/origin-codes.json"))
stations = {s["name"]: (s["lat"], s["lng"]) for s in json.load(open("data/stations.json"))}
print(f"resolving entrances for {len(codes)} stations ...", flush=True)


def collect(name):
    info = codes.get(name)
    centre = stations.get(name)
    if not info or not centre:
        return name, {"entrances": [], "source": "missing", "spread_m": 0}

    found = []
    d = get(f"https://api.tfl.gov.uk/StopPoint/{info['id']}")
    if d:
        for c in d.get("children", []):
            if c.get("stopType") in ENTRANCE_TYPES and c.get("lat"):
                found.append((c["lat"], c["lon"]))
        hub = d.get("hubNaptanCode")
        if not found and hub:
            h = get(f"https://api.tfl.gov.uk/StopPoint/{hub}")
            if h:
                for ch in h.get("children", []):
                    if ch.get("stopType") in ENTRANCE_TYPES and ch.get("lat"):
                        found.append((ch["lat"], ch["lon"]))
                    for gc in ch.get("children", []):
                        if gc.get("stopType") in ENTRANCE_TYPES and gc.get("lat"):
                            found.append((gc["lat"], gc["lon"]))

    # de-duplicate entrances sitting essentially on top of each other; routing
    # from both would cost twice and produce the same shape
    unique = []
    for p in found:
        if all(metres(p, q) > 25 for q in unique):
            unique.append(p)

    if not unique:
        return name, {"entrances": [list(centre)], "source": "station-point", "spread_m": 0}

    spread = max((metres(p, q) for p in unique for q in unique), default=0)
    furthest = max(metres(centre, p) for p in unique)
    return name, {
        "entrances": [[round(a, 6), round(b, 6)] for a, b in unique],
        "source": "tfl-entrances",
        "spread_m": round(spread),
        "furthest_from_centre_m": round(furthest),
    }


with ThreadPoolExecutor(max_workers=6) as pool:
    results = dict(pool.map(collect, sorted(codes)))

real = [v for v in results.values() if v["source"] == "tfl-entrances"]
fallback = [k for k, v in results.items() if v["source"] == "station-point"]
total_points = sum(len(v["entrances"]) for v in results.values())

print()
print(f"stations with published entrances : {len(real)}")
print(f"falling back to the station point : {len(fallback)}")
print(f"total routing origins             : {total_points:,}")
print(f"  (average {total_points/len(results):.1f} per station)")

if real:
    far = sorted(real, key=lambda v: -v.get("furthest_from_centre_m", 0))
    print("\nbiggest gaps between the stored point and a real door:")
    for name, v in sorted(results.items(),
                          key=lambda kv: -kv[1].get("furthest_from_centre_m", 0))[:8]:
        if v["source"] != "tfl-entrances":
            continue
        print(f"   {name[:34]:<34} {len(v['entrances'])} doors, "
              f"furthest {v['furthest_from_centre_m']}m (~{v['furthest_from_centre_m']/80:.0f} min)")

if fallback:
    print(f"\nno entrance data (using the station point) — first 10 of {len(fallback)}:")
    for n in fallback[:10]:
        print("   ", n)

json.dump(results, open(OUT, "w"), indent=2)
print(f"\nwritten {OUT}")
