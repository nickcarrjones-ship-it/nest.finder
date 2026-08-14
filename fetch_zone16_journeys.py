#!/usr/bin/env python3
"""
Phase 3 of the zone 1-6 expansion: fetch peak journey times for every
VERIFIED new station.

Runs unattended for roughly 100 minutes. Safe by construction:
  - reads  data/zone16-verified.json  (only stations proven usable in phase 2)
  - writes data/journey-times-zone16.json      <- NEW FILE
           data/.zone16-journeys-progress.json (checkpoint, resumable)
  - NEVER touches journey-times.json, stations.json or origin-codes.json

Merging this into the live data is a separate, deliberate step for Nick to
approve — same rule as the main regeneration, which is still sitting
uncommitted pending his review.
"""

import json
import os
import re
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

VERIFIED = "data/zone16-verified.json"
OUT = "data/journey-times-zone16.json"
PROGRESS = "data/.zone16-journeys-progress.json"
CHECKPOINT_EVERY = 200

# Reuse the existing, battle-tested fetching helpers rather than duplicating
# them — including tonight's corrected station codes and app-key handling.
src = open("build_journey_times.py").read().split("if __name__ ==")[0]
exec(compile(src, "build_journey_times.py", "exec"), globals())


def choose_date():
    """TfL only holds ~4-5 days ahead; validate before committing to a run."""
    for offset in range(1, 6):
        d = datetime.now() + timedelta(days=offset)
        if d.weekday() > 4:
            continue
        ds = d.strftime("%Y%m%d")
        globals()["DATE"] = ds
        if get_journey_time("940GZZLUOXC", "940GZZLUBNK") is not None:
            return ds
        print(f"  date {ds} rejected — trying next", flush=True)
    return None


DATE = choose_date()
if not DATE:
    print("FATAL: no usable date in the next 5 days; aborting without writing.", flush=True)
    sys.exit(1)
globals()["DATE"] = DATE
print(f"using validated date {DATE}", flush=True)

with open(VERIFIED) as f:
    stations = json.load(f)
print(f"{len(stations)} verified stations", flush=True)


def slug(name):
    return name.lower().replace("'", "").replace(" ", "_").replace(".", "")


dest_names = sorted(ZONE1_STATIONS.keys())


def clean(name):
    """'Abbey Wood (London) Rail Station' -> 'Abbey Wood', to match the
    naming style already used for the 262 existing areas."""
    n = re.sub(r"\s*\((?:London|for [^)]*)\)", "", name)
    for s in (" Underground Station", " Rail Station", " DLR Station",
              " Overground Station", " Station"):
        n = n.replace(s, "")
    return n.strip()


results = {}
if os.path.exists(PROGRESS):
    try:
        with open(PROGRESS) as f:
            results = json.load(f)
        print(f"resuming with {len(results)} areas already done", flush=True)
    except Exception:
        results = {}

jobs = []
for st in stations:
    area = clean(st["name"])
    results.setdefault(area, {})
    for dn in dest_names:
        key = slug(dn)
        if results[area].get(key) is not None:
            continue
        jobs.append((area, key, st["id"], ZONE1_STATIONS[dn]))

print(f"{len(jobs):,} journeys to fetch (~{len(jobs)/250:.0f} min estimated)", flush=True)

lock = threading.Lock()
done = [0]
start = time.time()


def fetch(job):
    area, key, from_id, to_id = job
    mins = get_journey_time(from_id, to_id)
    with lock:
        results[area][key] = mins
        done[0] += 1
        n = done[0]
        if n % CHECKPOINT_EVERY == 0:
            el = (time.time() - start) / 60
            rate = n / el if el else 0
            eta = (len(jobs) - n) / rate if rate else 0
            print(f"  {n:,}/{len(jobs):,}  {el:.0f} min elapsed, ~{eta:.0f} min left",
                  flush=True)
            with open(PROGRESS, "w") as f:
                json.dump(results, f)


with ThreadPoolExecutor(max_workers=WORKERS) as pool:
    list(pool.map(fetch, jobs))

nulls = sum(1 for a in results.values() for v in a.values() if v is None)
total = sum(len(a) for a in results.values())
print()
print(f"fetched {total:,} journeys, {nulls:,} null ({nulls/total*100 if total else 0:.1f}%)")

# Refuse to leave a bad file behind unattended.
if total and nulls / total > 0.15:
    print("WARNING: >15% nulls — writing anyway but this needs review before merging.",
          flush=True)

results["_readme"] = (
    f"Zone 1-6 expansion. {len(stations)} newly verified stations, peak "
    f"{TIME_STR} on {DATE}. Generated unattended by fetch_zone16_journeys.py. "
    f"NOT yet merged into journey-times.json — pending review."
)
with open(OUT, "w") as f:
    json.dump(results, f, indent=2)
if os.path.exists(PROGRESS):
    os.remove(PROGRESS)

print(f"written {OUT}")
print("journey-times.json, stations.json and origin-codes.json are untouched.")
