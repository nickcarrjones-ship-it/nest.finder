#!/usr/bin/env python3
"""
Work out exactly how the zone 1-6 expansion should merge, WITHOUT merging.

Nick's hard requirement: no duplicate dots on the map. Name matching alone
doesn't achieve that — "Edgware Road (Bakerloo)" and "Edgware Road (Circle
Line)" are different strings, and the map would happily draw both ~250m
apart. So this checks geography as well as names, across the combined
existing + new set.

Writes data/zone16-merge-plan.json and prints a full report.
Changes nothing. stations.json, origin-codes.json and journey-times.json
are read-only here.
"""

import json
import math
import re

DUPLICATE_DOT_M = 250   # closer than this reads as one dot on the map


def haversine_m(a, b):
    R = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0] - a[0])
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def norm(n):
    """Aggressive normalisation for MATCHING only — never for display."""
    n = n.lower()
    n = re.sub(r"\s*\([^)]*\)", "", n)          # drop "(Circle Line)", "(London)"
    n = n.replace("&", "and").replace(".", "").replace("'", "")
    n = n.replace("-", " ")
    for s in (" underground station", " rail station", " dlr station",
              " overground station", " station"):
        n = n.replace(s, " ")
    n = n.replace("saint ", "st ")
    return " ".join(n.split())


existing = {s["name"]: (s["lat"], s["lng"]) for s in json.load(open("data/stations.json"))}
verified = {v["name"]: (v["lat"], v["lng"]) for v in json.load(open("data/zone16-verified.json"))}
journeys = json.load(open("data/journey-times-zone16.json"))


def clean_display(name):
    """Match the naming style of the existing 262 areas."""
    n = re.sub(r"\s*\((?:London|for [^)]*)\)", "", name)
    for s in (" Underground Station", " Rail Station", " DLR Station",
              " Overground Station", " Station"):
        n = n.replace(s, "")
    return n.strip()


# journey-times keys were already cleaned at fetch time; map them back to coords
new_coords = {}
for vname, pos in verified.items():
    new_coords[clean_display(vname)] = pos

new_areas = [a for a in journeys if a != "_readme"]
print(f"existing areas : {len(existing)}")
print(f"new areas      : {len(new_areas)}")
print()

existing_norm = {}
for name, pos in existing.items():
    existing_norm.setdefault(norm(name), []).append((name, pos))

drop_name, drop_geo, keep, unresolved = [], [], [], []
seen_norm = {}
accepted = []   # (name, pos) accepted so far, for geo checks against each other

for area in sorted(new_areas):
    pos = new_coords.get(area)
    if not pos:
        unresolved.append({"area": area, "why": "no coordinates found"})
        continue

    # --- name clash with an existing area
    hit = existing_norm.get(norm(area))
    if hit:
        ename, epos = hit[0]
        drop_name.append({"new": area, "existing": ename,
                          "metres_apart": round(haversine_m(pos, epos))})
        continue

    # --- name clash with another NEW area
    if norm(area) in seen_norm:
        drop_name.append({"new": area, "existing": seen_norm[norm(area)] + " (new)",
                          "metres_apart": round(haversine_m(pos, new_coords[seen_norm[norm(area)]]))})
        continue

    # --- geographic clash: different name, same dot
    clash = None
    for ename, epos in existing.items():
        d = haversine_m(pos, epos)
        if d <= DUPLICATE_DOT_M:
            clash = (ename, d, "existing")
            break
    if not clash:
        for aname, apos in accepted:
            d = haversine_m(pos, apos)
            if d <= DUPLICATE_DOT_M:
                clash = (aname, d, "new")
                break
    if clash:
        drop_geo.append({"new": area, "collides_with": clash[0],
                         "set": clash[2], "metres_apart": round(clash[1])})
        continue

    seen_norm[norm(area)] = area
    accepted.append((area, pos))
    keep.append(area)

print("=" * 78)
print(f"DROP — name clash            : {len(drop_name)}")
print("=" * 78)
for d in drop_name:
    print(f"  {d['new'][:40]:<40} -> already have '{d['existing']}' ({d['metres_apart']}m)")

print()
print("=" * 78)
print(f"DROP — would draw a duplicate dot ({DUPLICATE_DOT_M}m rule) : {len(drop_geo)}")
print("=" * 78)
for d in drop_geo:
    print(f"  {d['new'][:40]:<40} -> {d['metres_apart']:>4}m from '{d['collides_with']}' [{d['set']}]")

if unresolved:
    print()
    print(f"UNRESOLVED: {len(unresolved)}")
    for u in unresolved:
        print("  ", u)

print()
print("=" * 78)
print(f"KEEP: {len(keep)} genuinely new areas")
print(f"map would go from {len(existing)} to {len(existing) + len(keep)} areas")
print("=" * 78)

# nearest-neighbour sanity across the FINAL combined set
final = dict(existing)
for a in keep:
    final[a] = new_coords[a]
names = list(final)
closest = []
for i, n1 in enumerate(names):
    for n2 in names[i + 1:]:
        d = haversine_m(final[n1], final[n2])
        if d <= DUPLICATE_DOT_M:
            closest.append((round(d), n1, n2))
closest.sort()
print()
print(f"FINAL CHECK — pairs closer than {DUPLICATE_DOT_M}m in the merged set: {len(closest)}")
for d, a, b in closest[:20]:
    print(f"   {d:>4}m  {a}  <->  {b}")

json.dump({"keep": keep, "drop_name_clash": drop_name,
           "drop_duplicate_dot": drop_geo, "unresolved": unresolved,
           "final_area_count": len(existing) + len(keep),
           "residual_close_pairs": [{"m": d, "a": a, "b": b} for d, a, b in closest]},
          open("data/zone16-merge-plan.json", "w"), indent=2)
print()
print("wrote data/zone16-merge-plan.json — nothing else was modified")
