#!/usr/bin/env python3
"""
Apply the approved zone 1-6 merge plan to the live data files.

Backs up first. journey-times.json is currently UNCOMMITTED, so git holds the
pre-regeneration version, not the working state — a bad merge would otherwise
be unrecoverable.

Touches:
  data/stations.json        + 308 entries (name, lat, lng)
  data/origin-codes.json    + 308 entries (TfL station id)
  data/journey-times.json   + 308 areas   (73 destinations each)
"""

import json
import re
import shutil
from datetime import datetime

STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")
TARGETS = ["data/stations.json", "data/origin-codes.json", "data/journey-times.json"]

for t in TARGETS:
    dst = f"{t}.backup-{STAMP}"
    shutil.copy2(t, dst)
    print(f"backed up {t} -> {dst}")
print()

plan = json.load(open("data/zone16-merge-plan.json"))
keep = set(plan["keep"])
verified = json.load(open("data/zone16-verified.json"))
new_journeys = json.load(open("data/journey-times-zone16.json"))


def clean_display(name):
    n = re.sub(r"\s*\((?:London|for [^)]*)\)", "", name)
    for s in (" Underground Station", " Rail Station", " DLR Station",
              " Overground Station", " Station"):
        n = n.replace(s, "")
    return n.strip()


# cleaned display name -> verified record
byname = {}
for v in verified:
    byname[clean_display(v["name"])] = v

stations = json.load(open("data/stations.json"))
codes = json.load(open("data/origin-codes.json"))
journeys = json.load(open("data/journey-times.json"))

existing_names = {s["name"] for s in stations}
added, skipped = 0, []

for area in sorted(keep):
    if area in existing_names:
        skipped.append((area, "already in stations.json"))
        continue
    v = byname.get(area)
    if not v:
        skipped.append((area, "no verified record"))
        continue
    times = new_journeys.get(area)
    if not times:
        skipped.append((area, "no journey times"))
        continue

    stations.append({"name": area, "lat": v["lat"], "lng": v["lng"]})
    codes[area] = {"id": v["id"]}
    journeys[area] = times
    added += 1

print(f"added   : {added}")
print(f"skipped : {len(skipped)}")
for a, why in skipped[:20]:
    print(f"   {a} — {why}")

# write back, preserving each file's existing formatting style
stations.sort(key=lambda s: s["name"])
lines = [json.dumps(s, separators=(",", ":")) for s in stations]
open("data/stations.json", "w").write("[\n" + ",\n".join(lines) + "\n]\n")

json.dump(dict(sorted(codes.items())), open("data/origin-codes.json", "w"), indent=2)
json.dump(journeys, open("data/journey-times.json", "w"), indent=2)

print()
print("=" * 66)
print(f"stations.json      : {len(stations)} areas")
print(f"origin-codes.json  : {len(codes)} codes")
print(f"journey-times.json : {len([k for k in journeys if k != '_readme'])} areas")
print("=" * 66)
