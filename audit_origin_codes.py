#!/usr/bin/env python3
"""
Re-audit every one of the 262 existing origin codes against TfL's own record.

Written because a first audit on 2026-08-13 claimed to have caught all the
wrong-station matches (it found 8) and was WRONG — 'Chiswick' was still
pointing at Chiswick Park Underground, 1.5km away, and was only caught later
by a coincidental duplicate-coordinate check.

So this doesn't trust name-similarity heuristics. For each stored code it
asks TfL what that code actually IS, and compares against the area name we
have filed under it. Anything that doesn't match cleanly is reported for a
human decision rather than auto-corrected.

Read-only. Writes data/origin-code-audit.json and changes nothing else.
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import os


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
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception:
        return None


def norm(n):
    n = (n or "").lower()
    n = re.sub(r"\s*\([^)]*\)", "", n)
    n = n.replace("&", "and").replace(".", "").replace("'", "").replace("-", " ")
    for s in (" underground station", " rail station", " dlr station",
              " overground station", " station"):
        n = n.replace(s, " ")
    return " ".join(n.split())


codes = json.load(open("data/origin-codes.json"))
stations = {s["name"]: (s["lat"], s["lng"]) for s in json.load(open("data/stations.json"))}
print(f"auditing {len(codes)} origin codes against TfL ...", flush=True)


def check(item):
    area, info = item
    sid = info.get("id")
    d = get(f"https://api.tfl.gov.uk/StopPoint/{sid}")
    if not d:
        return {"area": area, "id": sid, "status": "LOOKUP_FAILED"}
    official = d.get("commonName") or ""
    ok = norm(official) == norm(area)
    rec = {"area": area, "id": sid, "tfl_name": official,
           "status": "ok" if ok else "NAME_MISMATCH"}
    # also compare the coordinate we hold against TfL's own
    lat, lon = d.get("lat"), d.get("lon")
    if lat and lon and area in stations:
        import math
        a, b = stations[area], (lat, lon)
        R = 6371000.0
        dp = math.radians(b[0] - a[0]); dl = math.radians(b[1] - a[1])
        h = (math.sin(dp / 2) ** 2 +
             math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dl / 2) ** 2)
        rec["metres_from_tfl_position"] = round(2 * R * math.asin(math.sqrt(h)))
    return rec


with ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(check, sorted(codes.items())))

mismatch = [r for r in results if r["status"] == "NAME_MISMATCH"]
failed = [r for r in results if r["status"] == "LOOKUP_FAILED"]
faroff = [r for r in results
          if r.get("metres_from_tfl_position", 0) > 300 and r["status"] == "ok"]

print()
print("=" * 78)
print(f"NAME MISMATCHES (stored code is a different station): {len(mismatch)}")
print("=" * 78)
for r in sorted(mismatch, key=lambda x: x["area"]):
    d = r.get("metres_from_tfl_position")
    print(f"  {r['area'][:34]:<34} -> code is '{r['tfl_name']}'"
          + (f"  ({d}m from our stored position)" if d is not None else ""))

print()
print(f"COORDINATE DRIFT >300m on otherwise-correct codes: {len(faroff)}")
for r in sorted(faroff, key=lambda x: -x["metres_from_tfl_position"]):
    print(f"  {r['area'][:34]:<34} {r['metres_from_tfl_position']}m from TfL's position")

print()
print(f"LOOKUP FAILURES: {len(failed)}")
for r in failed:
    print("  ", r["area"], r["id"])

json.dump({"mismatches": mismatch, "coordinate_drift": faroff,
           "lookup_failures": failed, "all": results},
          open("data/origin-code-audit.json", "w"), indent=2)
print()
print(f"clean: {len(results) - len(mismatch) - len(failed)}/{len(results)}")
print("wrote data/origin-code-audit.json — nothing else modified")
