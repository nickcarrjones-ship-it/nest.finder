#!/usr/bin/env python3
"""
Build a manifest describing the data files the app needs.

The app ships with a copy of every file so it works instantly and offline.
On launch it compares this manifest against the one on the server and
downloads only what has actually changed — which is why we can fix journey
times without shipping an app update, and why a fix does not force every
user to re-download 5MB.

Run this whenever data/ changes, before deploying.
"""

import hashlib
import json
import os
import shutil
from datetime import datetime

FILES = ["stations.json", "journey-times.json"] + [
    f"isochrones/budget-{b}.json" for b in range(3, 16)
]
SRC = "data"
BUNDLE = "mobile/assets/data"


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


entries = {}
total = 0
for rel in FILES:
    p = os.path.join(SRC, rel)
    if not os.path.exists(p):
        print(f"  MISSING {rel}")
        continue
    size = os.path.getsize(p)
    total += size
    entries[rel] = {"sha": sha(p), "bytes": size}

manifest = {
    "version": datetime.now().strftime("%Y%m%d-%H%M%S"),
    "generated": datetime.now().isoformat(timespec="seconds"),
    "files": entries,
}

with open(os.path.join(SRC, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)
print(f"wrote data/manifest.json — {len(entries)} files, {total/1048576:.1f} MB")

# Copy the same files into the app bundle so a fresh install works offline.
os.makedirs(os.path.join(BUNDLE, "isochrones"), exist_ok=True)
for rel in entries:
    dst = os.path.join(BUNDLE, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(os.path.join(SRC, rel), dst)
shutil.copy2(os.path.join(SRC, "manifest.json"),
             os.path.join(BUNDLE, "manifest.json"))
print(f"copied into {BUNDLE}/ for bundling")
print(f"  version {manifest['version']}")
