#!/usr/bin/env python3
"""
Phase 3: generate a walking catchment for every station at every walk budget.

Runs against a local Valhalla instance, so there are no rate limits and no
per-request cost — the reason self-hosting was worth the setup over the
OpenRouteService API, which would have needed roughly 50 days at these volumes.

For each station and each budget from 3 to 15 minutes:
  - route an isochrone from EVERY entrance (walks start at a door, not the
    middle of a platform)
  - union those into one shape per station-budget
  - simplify to ~8m, which is well under a screen pixel at city zoom

Writes data/isochrones/budget-{n}.json, one file per budget, so the app only
downloads the sizes it actually needs.

Resumable: completed station-budgets are checkpointed, so an interrupted run
picks up where it stopped rather than starting over.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

VALHALLA = "http://localhost:8002/isochrone"
OUT_DIR = "data/isochrones"
PROGRESS = "data/.isochrone-progress.json"
BUDGETS = range(3, 16)
SIMPLIFY_TOL = 0.0004          # ~8m
WORKERS = 8
CHECKPOINT_EVERY = 100


def isochrone(lat, lng, minutes, retries=3):
    """One walking catchment from one point."""
    body = {
        "locations": [{"lat": lat, "lon": lng}],
        "costing": "pedestrian",
        # Valhalla's default walking speed is 5.1km/h. Left as-is: it matches
        # the ~80m/minute figure used everywhere else in this project.
        "contours": [{"time": minutes}],
        "polygons": True,
        # Without this, Valhalla returns the convex-ish generalised shape and
        # we lose exactly the street-following detail we are here for.
        "denoise": 0.1,
        "generalize": 15,
    }
    req = urllib.request.Request(
        VALHALLA,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.loads(r.read())
            feats = d.get("features", [])
            polys = [shape(f["geometry"]) for f in feats
                     if f["geometry"]["type"] in ("Polygon", "MultiPolygon")]
            if not polys:
                return None
            return unary_union(polys)
        except urllib.error.HTTPError as e:
            if e.code >= 500 and attempt < retries - 1:
                time.sleep(1 + attempt)
                continue
            return None
        except Exception:
            if attempt < retries - 1:
                time.sleep(1 + attempt)
                continue
            return None
    return None


def main():
    entrances = json.load(open("data/station-entrances.json"))
    os.makedirs(OUT_DIR, exist_ok=True)

    done = {}
    if os.path.exists(PROGRESS):
        try:
            done = json.load(open(PROGRESS))
            print(f"resuming — {len(done)} station-budgets already built", flush=True)
        except Exception:
            done = {}

    jobs = [(name, b) for name in sorted(entrances) for b in BUDGETS
            if f"{name}|{b}" not in done]
    total = len(entrances) * len(list(BUDGETS))
    print(f"{len(jobs):,} of {total:,} station-budgets to build", flush=True)
    print(f"({sum(len(v['entrances']) for v in entrances.values()):,} entrances "
          f"x {len(list(BUDGETS))} budgets = "
          f"{sum(len(v['entrances']) for v in entrances.values())*len(list(BUDGETS)):,} routing calls)",
          flush=True)

    lock = Lock()
    counter = [0]
    failures = []
    start = time.time()

    def build(job):
        name, budget = job
        doors = entrances[name]["entrances"]
        shapes = []
        for lat, lng in doors:
            g = isochrone(lat, lng, budget)
            if g is not None and not g.is_empty:
                shapes.append(g)
        with lock:
            counter[0] += 1
            n = counter[0]
            if shapes:
                merged = unary_union(shapes).simplify(SIMPLIFY_TOL)
                done[f"{name}|{budget}"] = mapping(merged)
            else:
                failures.append((name, budget))
            if n % CHECKPOINT_EVERY == 0:
                el = (time.time() - start) / 60
                rate = n / el if el else 0
                left = (len(jobs) - n) / rate if rate else 0
                print(f"  {n:,}/{len(jobs):,}  {el:.0f} min elapsed, "
                      f"~{left:.0f} min left, {len(failures)} failed", flush=True)
                json.dump(done, open(PROGRESS, "w"))

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        list(pool.map(build, jobs))

    json.dump(done, open(PROGRESS, "w"))
    print(f"\nbuilt {len(done):,} station-budgets, {len(failures)} failed")
    if failures:
        print("  failures:", failures[:15])

    # Split by budget so the app fetches only the sizes it needs.
    print("\nwriting per-budget files:")
    for b in BUDGETS:
        payload = {}
        for key, geom in done.items():
            name, bb = key.rsplit("|", 1)
            if int(bb) == b:
                payload[name] = geom
        path = f"{OUT_DIR}/budget-{b}.json"
        json.dump(payload, open(path, "w"), separators=(",", ":"))
        print(f"  budget {b:>2}: {len(payload):>3} stations, "
              f"{os.path.getsize(path)/1024:>6.0f} KB")

    total_kb = sum(os.path.getsize(f"{OUT_DIR}/budget-{b}.json") for b in BUDGETS) / 1024
    print(f"\ntotal {total_kb/1024:.1f} MB across {len(list(BUDGETS))} files")


if __name__ == "__main__":
    main()
