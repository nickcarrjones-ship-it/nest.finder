#!/usr/bin/env python3
"""
v2: give every station area a real neighbourhood identity using ACTUAL
boundary polygons, not nearest-point matching.

Why v1 (build_area_identities.py) has a structural problem
------------------------------------------------------------
v1 matches each station to the nearest OSM place=* NODE (a single lat/lng
pin, not a shape). Nearest-point matching is a Voronoi tessellation of those
pins, so two stations either side of a Voronoi edge can land in different
neighbourhoods even when they're a couple of hundred metres apart and any
Londoner would call them the same place. Clapham North and Clapham High
Street (178m apart) are the motivating example: each is nearest to a
different pin, so they got split across Stockwell/Clapham.

The fix asked for: point-in-POLYGON containment against real boundaries.

What this script does
----------------------
1. Loads cached Overpass data (data/osm-place-polys-raw.json) — every OSM
   way/relation tagged place=suburb|town|village|neighbourhood|quarter in
   Greater London, fetched with geometry. Assembles relation members into
   closed rings (multipolygon support, incl. holes).
2. Loads London's 2024 electoral ward boundaries (data/london-wards-2024.geojson,
   from ONS Open Geography Portal / geoportal.statistics.gov.uk) as a
   FULL-COVERAGE fallback layer — see the note in fetch_polygons() on why
   this is needed at all: OSM's own hand-drawn colloquial-neighbourhood
   polygons turn out to cover only ~15 real places across all of Greater
   London (confirmed empirically, see report). Wards are electoral, not
   colloquial, but they tile the whole of London with no gaps, and LGBCE's
   post-2022 boundary review named most of them after the local area
   (Larkhall, Herne Hill & Loughborough, Brixton Hill...).
3. For each of the 570 stations, resolves a neighbourhood by, in order:
   a. contained in an OSM colloquial place polygon (tier "osm-polygon")
   b. contained in a ward polygon (tier "ward")
   c. nearest OSM place point within 300m (tier "nearest-point-300m")
   d. nearest OSM place point within 800m, same radius/logic as v1
      (tier "nearest-point-800m")
   e. the station's own name (tier "station-name")

Writes data/area-identities-v2.json in the same shape as v1's
data/area-identities.json (does NOT touch the v1 file).
"""

import json
import math
import re
import sys
from collections import defaultdict

from shapely.geometry import Point, Polygon, MultiPolygon, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

RAW_OSM = "data/osm-place-polys-raw.json"
WARDS_GEOJSON = "data/london-wards-2024.geojson"
POINTS_JSON = "data/london-neighbourhoods.json"   # v1's 803-point fallback layer
STATIONS_JSON = "data/stations.json"
OUT_JSON = "data/area-identities-v2.json"

NEAR_TIGHT_KM = 0.3   # matches v1's GRANULAR_MAX_KM for neighbourhood/quarter-grade fallback
NEAR_WIDE_KM = 0.8    # matches v1's MAX_MATCH_KM

# place=neighbourhood/quarter in OSM London turns out to be dominated by
# housing-estate and new-build-marketing names, not colloquial neighbourhoods:
# "Loughborough Estate", "Chelsea Waterfront", "Goodluck Hope", "London City
# Island", "Fish Island Village", "Circus West Village"... A suffix blacklist
# was tried first (estate/court/gardens/...) and still let through ~180
# single-development names ("Riverlight", "Keybridge", "Parkhaus"). No
# reasonably-scoped heuristic separates the small number of genuine
# neighbourhood-grade names (Angell Town, Harringay Ladder, Maitland Park) from
# that tail without manual curation, so tier 1 below only uses suburb/village/
# town kinds — the ones OSM mappers draw for an actual named place, not a
# single housing scheme. See the report for the full accounting.


def km(a, b):
    R = 6371.0
    dp = math.radians(b[0] - a[0])
    dl = math.radians(b[1] - a[1])
    h = (math.sin(dp / 2) ** 2 +
         math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dl / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def norm(s):
    s = s.lower().replace("'", "").replace("-", " ").replace("&", "and")
    return " ".join(s.split())


# ---------------------------------------------------------------------------
# Ring assembly: turn a relation's member ways (each an open or closed
# polyline of lon/lat pairs) into closed rings by chaining shared endpoints.
# ---------------------------------------------------------------------------

def assemble_rings(segments):
    """segments: list of [(lon,lat), ...] polylines. Returns list of closed rings."""
    remaining = [list(s) for s in segments if len(s) >= 2]
    rings = []
    while remaining:
        ring = remaining.pop(0)
        changed = True
        guard = 0
        while changed and ring[0] != ring[-1] and guard < 2000:
            changed = False
            guard += 1
            for i, seg in enumerate(remaining):
                if seg[0] == ring[-1]:
                    ring = ring + seg[1:]
                    remaining.pop(i)
                    changed = True
                    break
                if seg[-1] == ring[-1]:
                    ring = ring + list(reversed(seg))[1:]
                    remaining.pop(i)
                    changed = True
                    break
                if seg[-1] == ring[0]:
                    ring = seg[:-1] + ring
                    remaining.pop(i)
                    changed = True
                    break
                if seg[0] == ring[0]:
                    ring = list(reversed(seg))[:-1] + ring
                    remaining.pop(i)
                    changed = True
                    break
        rings.append(ring)
    return rings


def poly_from_rings(rings):
    """rings: list of closed [(lon,lat), ...] rings, each >=4 points. Biggest
    ring by point count becomes the shell if more than one is unclosed-huge;
    normally there's exactly one outer here (call handles inner separately)."""
    good = [r for r in rings if len(r) >= 4 and r[0] == r[-1]]
    if not good:
        return None
    polys = []
    for r in good:
        try:
            p = Polygon(r)
            if not p.is_valid:
                p = make_valid(p)
            polys.append(p)
        except Exception:
            continue
    if not polys:
        return None
    if len(polys) == 1:
        return polys[0]
    return unary_union(polys)


def element_to_geom(el):
    """Build a shapely (Multi)Polygon for one raw Overpass element, or None."""
    if el["type"] == "way":
        coords = [(pt["lon"], pt["lat"]) for pt in el.get("geometry", []) if pt]
        if len(coords) < 4:
            return None
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        try:
            p = Polygon(coords)
            return p if p.is_valid else make_valid(p)
        except Exception:
            return None

    if el["type"] == "relation":
        outer_segs, inner_segs = [], []
        for m in el.get("members", []):
            geom = m.get("geometry")
            if not geom:
                continue
            coords = [(pt["lon"], pt["lat"]) for pt in geom]
            if len(coords) < 2:
                continue
            (inner_segs if m.get("role") == "inner" else outer_segs).append(coords)
        outer = poly_from_rings(assemble_rings(outer_segs)) if outer_segs else None
        if outer is None:
            return None
        if inner_segs:
            inner = poly_from_rings(assemble_rings(inner_segs))
            if inner is not None:
                try:
                    outer = outer.difference(inner)
                except Exception:
                    pass
        return outer

    return None


# ---------------------------------------------------------------------------
# Load layers
# ---------------------------------------------------------------------------

def load_wards():
    gj = json.load(open(WARDS_GEOJSON))
    wards = []
    for f in gj["features"]:
        try:
            geom = shape(f["geometry"])
            if not geom.is_valid:
                geom = make_valid(geom)
        except Exception:
            continue
        wards.append({
            "name": f["properties"]["WD24NM"],
            "borough": f["properties"]["LAD24NM"],
            "geom": geom,
        })
    return wards


def load_osm_polygons(ward_geoms_union):
    raw = json.load(open(RAW_OSM))
    # Only suburb/village/town: see the ESTATE_SUFFIXES comment above for why
    # neighbourhood/quarter are excluded wholesale rather than filtered.
    RANK = {"town": 0, "suburb": 1, "village": 1}
    out = []
    dropped_estates = []
    dropped_outside_london = []
    for el in raw["elements"]:
        tags = el.get("tags", {})
        name = tags.get("name")
        kind = tags.get("place")
        if not name or kind not in RANK:
            continue
        geom = element_to_geom(el)
        if geom is None or geom.is_empty or geom.area == 0:
            continue
        # Keep only polygons actually inside Greater London (drops the Surrey/
        # Kent "town" relations e.g. Weybridge, Chertsey, Esher that a
        # bounding-box-only query pulls in along the M25 fringe).
        centroid = geom.centroid
        if not ward_geoms_union.contains(centroid):
            dropped_outside_london.append(name)
            continue
        out.append({"name": name, "kind": kind, "rank": RANK[kind], "geom": geom, "area": geom.area})
    return out, dropped_estates, dropped_outside_london


def load_points():
    return json.load(open(POINTS_JSON))


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def match_station(lat, lng, name, osm_polys, wards, points):
    pt = Point(lng, lat)
    here = (lat, lng)

    # Tier 1: OSM colloquial place polygon containment. Prefer higher-rank
    # kind (town/suburb beats quarter/neighbourhood), then the smallest
    # (most specific) polygon among ties.
    candidates = [p for p in osm_polys if p["geom"].contains(pt)]
    if candidates:
        candidates.sort(key=lambda p: (p["rank"], p["area"]))
        best = candidates[0]
        return {
            "neighbourhood": best["name"],
            "source": "osm-polygon",
            "kind": best["kind"],
            "km": 0.0,
        }

    # Tier 2: ward containment (full coverage of Greater London).
    for w in wards:
        if w["geom"].contains(pt):
            # The City of London packs 25 ancient civic wards (Walbrook,
            # Dowgate, Candlewick, Bread Street...) into one square mile.
            # They're real, correctly-drawn boundaries, but nobody
            # house-hunting says "I want to live in Candlewick" — the
            # colloquial (and only practically useful) answer for all of
            # them is "the City". Collapse to the borough name here rather
            # than surface ward-level granularity nobody uses; the original
            # ward is kept in wardName for transparency.
            if w["borough"] == "City of London":
                return {
                    "neighbourhood": "City of London",
                    "source": "ward-borough",
                    "kind": "borough",
                    "km": 0.0,
                    "borough": w["borough"],
                    "wardName": w["name"],
                }
            return {
                "neighbourhood": w["name"],
                "source": "ward",
                "kind": "ward",
                "km": 0.0,
                "borough": w["borough"],
            }

    # Tier 3/4: nearest OSM place point, tight radius for granular kinds,
    # wider radius otherwise — same logic v1 used, kept here as a safety net
    # for the handful of stations that fall in gaps between generalised ward
    # boundary lines and the coastline/river clip.
    scored = []
    for p in points:
        d = km(here, (p["lat"], p["lng"]))
        if d > NEAR_WIDE_KM:
            continue
        if p["kind"] in ("neighbourhood", "quarter") and d > NEAR_TIGHT_KM:
            continue
        exact = norm(p["name"]) == norm(name)
        scored.append((0 if exact else 1, d, p))
    if scored:
        scored.sort(key=lambda t: (t[0], t[1]))
        _, d, p = scored[0]
        return {
            "neighbourhood": p["name"],
            "source": "nearest-point-800m" if d > NEAR_TIGHT_KM else "nearest-point-300m",
            "kind": p["kind"],
            "km": round(d, 2),
        }

    # Tier 5: give up, keep the station's own name.
    return {"neighbourhood": name, "source": "station-name", "km": None}


def main():
    print("Loading ward boundaries (data/london-wards-2024.geojson)...")
    wards = load_wards()
    print(f"  {len(wards)} wards across {len(set(w['borough'] for w in wards))} boroughs")
    ward_union = unary_union([w["geom"] for w in wards])

    print("Loading + assembling OSM colloquial place polygons...")
    osm_polys, dropped_estates, dropped_outside = load_osm_polygons(ward_union)
    print(f"  {len(osm_polys)} usable polygons "
          f"(dropped {len(dropped_estates)} estate-like, {len(dropped_outside)} outside Greater London)")
    for p in sorted(osm_polys, key=lambda p: p["name"]):
        print(f"    {p['name']:<28} {p['kind']}")

    points = load_points()
    stations = json.load(open(STATIONS_JSON))

    identities = {}
    for s in stations:
        identities[s["name"]] = match_station(s["lat"], s["lng"], s["name"], osm_polys, wards, points)

    by_hood = defaultdict(list)
    for st, v in identities.items():
        by_hood[v["neighbourhood"]].append(st)

    counts = defaultdict(int)
    for v in identities.values():
        counts[v["source"]] += 1

    print(f"\n{len(stations)} station areas -> {len(by_hood)} neighbourhoods")
    for src in ("osm-polygon", "ward", "ward-borough", "nearest-point-300m", "nearest-point-800m", "station-name"):
        print(f"  {src:<22}: {counts.get(src, 0)}")

    json.dump(
        {
            "identities": identities,
            "byNeighbourhood": {k: sorted(v) for k, v in sorted(by_hood.items())},
            "meta": {
                "sources": {
                    "osm_place_polygons": RAW_OSM,
                    "wards": WARDS_GEOJSON + " (ONS Open Geography Portal, Dec 2024 boundaries)",
                    "point_fallback": POINTS_JSON,
                },
                "counts": dict(counts),
            },
        },
        open(OUT_JSON, "w"),
        indent=2,
    )
    print(f"\nwritten {OUT_JSON}")


if __name__ == "__main__":
    main()
