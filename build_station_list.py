#!/usr/bin/env python3
"""
Phase 1 of the zone 1-6 expansion: work out WHICH stations we're missing.

Deliberately split from the slow journey-fetching phase so the scale of the
job is known before anything long-running starts, and so this part can be
re-run freely (it's ~10 API calls, not thousands).

Writes:
  data/zone16-candidates.json   stations we don't already cover, ready to fetch
  data/zone16-ambiguous.json    anything needing a human eye (see below)

It does NOT touch stations.json or journey-times.json. Nothing here is
destructive.

On ambiguity: tonight's session found 8 cases where a naive name match picked
the wrong station (Arsenal -> Woolwich Arsenal, Hampstead -> West Hampstead,
Putney -> East Putney, and so on), some only 400m apart. So this script never
resolves a doubtful name by guessing — it sets it aside for review.
"""

import json
import urllib.request
from collections import defaultdict

MODES = "tube,dlr,overground,elizabeth-line,national-rail"
# Station-level stop types only. Entrances and platforms are children of these
# and would otherwise produce many duplicates per site.
STATION_TYPES = {"NaptanMetroStation", "NaptanRailStation"}
WANTED_ZONES = {"1", "2", "3", "4", "5", "6"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def zones_of(sp):
    """A station can span two zones ('2/3'); keep every zone it touches."""
    for p in sp.get("additionalProperties", []):
        if p.get("key") == "Zone":
            return {z.strip() for z in str(p.get("value", "")).replace("+", "/").split("/") if z.strip()}
    return set()


print("fetching all stations by mode ...", flush=True)
raw = {}
page = 1
while page <= 15:
    d = get(f"https://api.tfl.gov.uk/StopPoint/Mode/{MODES}?page={page}")
    sps = d.get("stopPoints", [])
    if not sps:
        break
    for sp in sps:
        if sp.get("stopType") not in STATION_TYPES:
            continue
        if not (sp.get("lat") and sp.get("lon")):
            continue
        raw[sp["id"]] = sp
    print(f"  page {page}: {len(sps)} stops, {len(raw)} stations so far", flush=True)
    if len(sps) < d.get("pageSize", 1000):
        break
    page += 1

print(f"{len(raw)} station-level stop points found")

# Keep those inside zones 1-6. Stations with no zone data are usually outside
# the London fare area, but a few genuine ones lack it — those go to review
# rather than being silently dropped.
in_zone, no_zone = {}, {}
for sid, sp in raw.items():
    z = zones_of(sp)
    if not z:
        no_zone[sid] = sp
    elif z & WANTED_ZONES:
        in_zone[sid] = sp

print(f"  {len(in_zone)} in zones 1-6")
print(f"  {len(no_zone)} with no zone data (-> review, not dropped)")


def norm(name):
    n = (name or "").lower()
    for suffix in (" underground station", " rail station", " dlr station", " station"):
        n = n.replace(suffix, "")
    return " ".join(n.replace("'", "").replace("-", " ").split())


# What we already cover.
with open("data/origin-codes.json") as f:
    existing_codes = json.load(f)
existing_norm = {norm(n): n for n in existing_codes}

# Group by normalised name so the several stop points that make up one
# interchange collapse into a single candidate.
by_name = defaultdict(list)
for sid, sp in in_zone.items():
    by_name[norm(sp.get("commonName"))].append(sp)

candidates, ambiguous = [], []
already = 0
for nname, sps in sorted(by_name.items()):
    if nname in existing_norm:
        already += 1
        continue
    display = sps[0].get("commonName", "")
    # Several distinct stop points sharing a normalised name is exactly the
    # trap that produced tonight's 8 wrong matches — never auto-pick.
    if len({s["id"] for s in sps}) > 1:
        ambiguous.append({
            "name": display,
            "reason": "multiple station-level stop points share this name",
            "options": [
                {"id": s["id"], "commonName": s.get("commonName"),
                 "lat": s.get("lat"), "lng": s.get("lon"), "modes": s.get("modes")}
                for s in sps
            ],
        })
        continue
    sp = sps[0]
    candidates.append({
        "name": display,
        "id": sp["id"],
        "lat": sp["lat"],
        "lng": sp["lon"],
        "modes": sp.get("modes", []),
        "zones": sorted(zones_of(sp)),
    })

for sid, sp in no_zone.items():
    if norm(sp.get("commonName")) in existing_norm:
        continue
    ambiguous.append({
        "name": sp.get("commonName"),
        "reason": "no zone data on TfL record — may be outside zones 1-6",
        "options": [{"id": sid, "commonName": sp.get("commonName"),
                     "lat": sp.get("lat"), "lng": sp.get("lon"), "modes": sp.get("modes")}],
    })

print()
print(f"already covered : {already}")
print(f"NEW candidates  : {len(candidates)}")
print(f"needs review    : {len(ambiguous)}")

with open("data/zone16-candidates.json", "w") as f:
    json.dump(candidates, f, indent=2)
with open("data/zone16-ambiguous.json", "w") as f:
    json.dump(ambiguous, f, indent=2)

print()
print("sample of new candidates:")
for c in candidates[:25]:
    print(f"  {c['name'][:46]:<46} z{'/'.join(c['zones']):<5} {','.join(c['modes'])}")
print()
print("wrote data/zone16-candidates.json and data/zone16-ambiguous.json")
