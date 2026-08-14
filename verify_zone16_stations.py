#!/usr/bin/env python3
"""
Phase 2 of the zone 1-6 expansion: prove every candidate station is real and
usable BEFORE any journey times are fetched for it.

Runs unattended. Safe by construction:
  - reads  data/zone16-candidates.json
  - writes data/zone16-verified.json   (passed, ready to fetch journeys for)
           data/zone16-rejected.json   (failed, with the reason)
           data/.zone16-verify-progress.json (checkpoint, resumable)
  - NEVER touches stations.json, origin-codes.json or journey-times.json

Why verification is its own phase: a session on 2026-08-13 found 8 stations
resolved to the WRONG place by naive name matching (Arsenal -> Woolwich
Arsenal, Hampstead -> West Hampstead, Putney -> East Putney, ...), some only
400m apart, plus a code that looked valid but was rejected by the journey
planner (New Cross Gate's Overground-side platform code). Fetching 25,000
journeys against an unchecked list would bake those errors in invisibly.

Each candidate must clear three gates:
  1. dedupe    - collapse the same physical station appearing under several
                 names/modes ("Abbey Wood" vs "Abbey Wood (London) Rail Station")
  2. resolve   - find an id the Journey Planner actually accepts, drilling into
                 hub children when a HUB id returns HTTP 300
  3. live test - a real journey request must return a real journey

Anything that fails is EXCLUDED and reported. Nothing is guessed.
"""

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

CANDIDATES = "data/zone16-candidates.json"
VERIFIED = "data/zone16-verified.json"
REJECTED = "data/zone16-rejected.json"
PROGRESS = "data/.zone16-verify-progress.json"

# A known-good, well-connected destination to test journeys against.
TEST_DEST = "940GZZLUBNK"          # Bank
TEST_DEST_ALT = "940GZZLUOXC"      # Oxford Circus, for second opinions
TIME_STR = "0830"
MODES = "tube,dlr,elizabeth-line,overground,national-rail,bus"

SAME_STATION_KM = 0.4   # closer than this + same name => one physical station


def _load_app_key():
    for path in ("tfl_key.txt", os.path.expanduser("~/.tfl_key")):
        try:
            with open(path) as f:
                k = f.read().strip()
                if k:
                    return k
        except OSError:
            pass
    return os.environ.get("TFL_APP_KEY", "").strip() or None


APP_KEY = _load_app_key()
WORKERS = 6 if APP_KEY else 2
print(f"TfL app key: {'yes' if APP_KEY else 'no (running slower)'}", flush=True)


def _get(url, timeout=30):
    if APP_KEY:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({"app_key": APP_KEY})
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, None
    except Exception:
        return 0, None


def haversine_km(lat1, lon1, lat2, lon2):
    import math
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


# --- pick a date the Journey Planner actually has data for -----------------
# TfL only holds roughly the next 4-5 days; beyond that every request 404s
# with "No journey found for your inputs" regardless of the stations. This
# steps forward from tomorrow until a control journey succeeds, so an
# overnight run can never silently produce a file full of nulls.
def choose_date():
    for offset in range(1, 6):
        d = datetime.now() + timedelta(days=offset)
        if d.weekday() > 4:            # keep it a weekday for peak-time realism
            continue
        ds = d.strftime("%Y%m%d")
        params = {"date": ds, "time": TIME_STR, "timeIs": "Departing",
                  "journeyPreference": "LeastTime", "mode": MODES}
        url = (f"https://api.tfl.gov.uk/Journey/JourneyResults/"
               f"940GZZLUOXC/to/{TEST_DEST}?{urllib.parse.urlencode(params)}")
        status, body = _get(url)
        if status == 200 and body and body.get("journeys"):
            print(f"date {ds} validated against a control journey", flush=True)
            return ds
        print(f"  date {ds} rejected (HTTP {status}) — trying next", flush=True)
    return None


DATE = choose_date()
if not DATE:
    print("FATAL: no usable date found in the next 5 days. Aborting so that "
          "nothing writes bad data.", flush=True)
    sys.exit(1)


def journey_ok(from_id, to_id):
    """True if the planner returns a real journey from this id."""
    params = {"date": DATE, "time": TIME_STR, "timeIs": "Departing",
              "journeyPreference": "LeastTime", "mode": MODES}
    url = (f"https://api.tfl.gov.uk/Journey/JourneyResults/"
           f"{from_id}/to/{to_id}?{urllib.parse.urlencode(params)}")
    status, body = _get(url)
    if status == 200 and body and body.get("journeys"):
        return True, body["journeys"][0].get("duration"), None
    if status == 300:
        return False, None, "HTTP 300 disambiguation (likely a hub id)"
    if status == 404:
        return False, None, "HTTP 404 no journey found"
    return False, None, f"HTTP {status}"


def hub_children(station_id):
    """A HUB id can't be planned from; its children can."""
    status, d = _get(f"https://api.tfl.gov.uk/StopPoint/{station_id}")
    if status != 200 or not d:
        return []
    return [c.get("id") for c in d.get("children", [])
            if c.get("stopType") in ("NaptanMetroStation", "NaptanRailStation") and c.get("id")]


# --- gate 1: dedupe --------------------------------------------------------
def norm(name):
    n = (name or "").lower()
    n = n.replace("(london)", " ")
    for s in (" underground station", " rail station", " dlr station",
              " overground station", " station"):
        n = n.replace(s, " ")
    n = n.replace("'", "").replace("-", " ").replace(".", " ").replace("&", "and")
    return " ".join(n.split())


with open(CANDIDATES) as f:
    raw_candidates = json.load(f)

groups = {}
for c in raw_candidates:
    groups.setdefault(norm(c["name"]), []).append(c)

deduped, split_names = [], []
for nname, members in groups.items():
    if len(members) == 1:
        deduped.append(members[0])
        continue
    # Same name — are they the same physical place, or genuinely different?
    base = members[0]
    if all(haversine_km(base["lat"], base["lng"], m["lat"], m["lng"]) <= SAME_STATION_KM
           for m in members[1:]):
        merged = dict(base)
        merged["name"] = min((m["name"] for m in members), key=len)
        merged["merged_from"] = [m["id"] for m in members]
        merged["modes"] = sorted({mode for m in members for mode in m.get("modes", [])})
        merged["_alt_ids"] = [m["id"] for m in members[1:]]
        deduped.append(merged)
    else:
        # Far apart but same name -> exactly the trap that caused tonight's
        # 8 bad matches. Never auto-pick between these.
        split_names.append({"name": base["name"], "reason":
                            "same name, geographically distinct stations",
                            "options": members})

print(f"{len(raw_candidates)} candidates -> {len(deduped)} after dedupe "
      f"({len(split_names)} name collisions set aside)", flush=True)

# --- resume ----------------------------------------------------------------
verified, rejected = [], []
done_names = set()
if os.path.exists(PROGRESS):
    try:
        with open(PROGRESS) as f:
            p = json.load(f)
        verified = p.get("verified", [])
        rejected = p.get("rejected", [])
        done_names = {v["name"] for v in verified} | {r["name"] for r in rejected}
        print(f"resuming: {len(done_names)} already checked", flush=True)
    except Exception:
        pass

pending = [c for c in deduped if c["name"] not in done_names]
print(f"{len(pending)} to verify against live journey planner", flush=True)

lock = threading.Lock()
counter = [0]


def verify(cand):
    ids_to_try = [cand["id"]] + cand.get("_alt_ids", [])
    reason = None
    for sid in ids_to_try:
        ok, dur, why = journey_ok(sid, TEST_DEST)
        if ok:
            return {**{k: v for k, v in cand.items() if not k.startswith("_")},
                    "id": sid, "verified_journey_mins": dur}, None
        reason = why
        if why and "300" in why:
            for child in hub_children(sid):
                ok2, dur2, _ = journey_ok(child, TEST_DEST)
                if ok2:
                    return {**{k: v for k, v in cand.items() if not k.startswith("_")},
                            "id": child, "verified_journey_mins": dur2,
                            "resolved_via": f"hub child of {sid}"}, None
    # Second opinion before rejecting — Bank may just be awkward from here.
    for sid in ids_to_try:
        ok, dur, _ = journey_ok(sid, TEST_DEST_ALT)
        if ok:
            return {**{k: v for k, v in cand.items() if not k.startswith("_")},
                    "id": sid, "verified_journey_mins": dur,
                    "resolved_via": "verified against Oxford Circus"}, None
    return None, {"name": cand["name"], "id": cand["id"],
                  "reason": reason or "no journey returned from any id"}


def worker(cand):
    v, r = verify(cand)
    with lock:
        if v:
            verified.append(v)
        else:
            rejected.append(r)
        counter[0] += 1
        n = counter[0]
        if n % 20 == 0:
            print(f"  {n}/{len(pending)}  ok={len(verified)} rejected={len(rejected)}", flush=True)
            with open(PROGRESS, "w") as f:
                json.dump({"verified": verified, "rejected": rejected}, f)


start = time.time()
with ThreadPoolExecutor(max_workers=WORKERS) as pool:
    list(pool.map(worker, pending))

with open(VERIFIED, "w") as f:
    json.dump(sorted(verified, key=lambda v: v["name"]), f, indent=2)
with open(REJECTED, "w") as f:
    json.dump({"rejected": sorted(rejected, key=lambda r: r["name"]),
               "name_collisions": split_names}, f, indent=2)
if os.path.exists(PROGRESS):
    os.remove(PROGRESS)

print()
print("=" * 70)
print(f"VERIFIED : {len(verified)}  -> {VERIFIED}")
print(f"REJECTED : {len(rejected)}  -> {REJECTED}")
print(f"COLLISIONS needing a human decision: {len(split_names)}")
print(f"elapsed  : {(time.time()-start)/60:.1f} min")
print("=" * 70)
print("Nothing else was modified. stations.json, origin-codes.json and")
print("journey-times.json are untouched.")
