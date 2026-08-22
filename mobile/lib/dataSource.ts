// The SDK 57 File/Directory API is the future, but the legacy module is
// still shipped and exported, and covers exactly what this needs. Swapping
// is a contained change if it is ever removed.
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

/**
 * Where the app's map data comes from.
 *
 * Three places, in order of preference:
 *
 *   1. A downloaded copy on the device, if we have fetched a newer one
 *   2. The copy bundled inside the app, which always exists
 *   3. The server, in the background, to produce (1) for next time
 *
 * The app therefore works instantly on first launch and offline forever,
 * while still allowing a data fix to reach people without an app-store
 * release. That mattered on 2026-08-22, when the journey times were
 * corrected twice in one day — under a bundle-only approach each fix would
 * have needed a release and days of review.
 *
 * Nothing here blocks the map. Updates are checked after the first render
 * and only take effect on the next launch, so a slow connection can never
 * delay someone seeing their areas.
 */

const REMOTE_BASE = 'https://maloca.homes/data';
const CACHE_DIR = `${FileSystem.documentDirectory}mapdata/`;
const MANIFEST = 'manifest.json';

export interface DataManifest {
  version: string;
  generated: string;
  files: Record<string, { sha: string; bytes: number }>;
}

/** Bundled fallbacks. Metro needs literal require paths, hence the map. */
const BUNDLED: Record<string, number> = {
  'manifest.json': require('../assets/data/manifest.json'),
  'stations.json': require('../assets/data/stations.json'),
  'journey-times.json': require('../assets/data/journey-times.json'),
  'isochrones/budget-3.json': require('../assets/data/isochrones/budget-3.json'),
  'isochrones/budget-4.json': require('../assets/data/isochrones/budget-4.json'),
  'isochrones/budget-5.json': require('../assets/data/isochrones/budget-5.json'),
  'isochrones/budget-6.json': require('../assets/data/isochrones/budget-6.json'),
  'isochrones/budget-7.json': require('../assets/data/isochrones/budget-7.json'),
  'isochrones/budget-8.json': require('../assets/data/isochrones/budget-8.json'),
  'isochrones/budget-9.json': require('../assets/data/isochrones/budget-9.json'),
  'isochrones/budget-10.json': require('../assets/data/isochrones/budget-10.json'),
  'isochrones/budget-11.json': require('../assets/data/isochrones/budget-11.json'),
  'isochrones/budget-12.json': require('../assets/data/isochrones/budget-12.json'),
  'isochrones/budget-13.json': require('../assets/data/isochrones/budget-13.json'),
  'isochrones/budget-14.json': require('../assets/data/isochrones/budget-14.json'),
  'isochrones/budget-15.json': require('../assets/data/isochrones/budget-15.json'),
};

async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

function cachePath(rel: string): string {
  // Flatten "isochrones/budget-9.json" so we never need nested directories.
  return CACHE_DIR + rel.replace(/\//g, '__');
}

async function readCached<T>(rel: string): Promise<T | null> {
  try {
    const p = cachePath(rel);
    const info = await FileSystem.getInfoAsync(p);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(p)) as T;
  } catch {
    return null;
  }
}

async function readBundled<T>(rel: string): Promise<T> {
  const mod = BUNDLED[rel];
  if (mod === undefined) throw new Error(`no bundled copy of ${rel}`);
  // Metro turns a required .json into a parsed object in dev, but into an
  // asset reference in some release configurations — handle both rather than
  // assuming, since getting this wrong only shows up in a production build.
  if (typeof mod === 'object') return mod as unknown as T;
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return JSON.parse(await FileSystem.readAsStringAsync(uri)) as T;
}

/** The data the app should use right now — cached if present, bundled otherwise. */
export async function loadData<T>(rel: string): Promise<T> {
  const cached = await readCached<T>(rel);
  if (cached !== null) return cached;
  return readBundled<T>(rel);
}

/**
 * Fetch anything the server has that we do not, comparing per-file hashes so
 * a change to one budget file does not re-download the other twelve.
 * Safe to call and ignore — it never throws into the caller.
 */
export async function syncData(
  onProgress?: (done: number, total: number) => void,
): Promise<{ updated: string[]; version: string | null }> {
  try {
    await ensureCacheDir();

    const res = await fetch(`${REMOTE_BASE}/${MANIFEST}`, { cache: 'no-store' });
    if (!res.ok) return { updated: [], version: null };
    const remote: DataManifest = await res.json();

    const localManifest =
      (await readCached<DataManifest>(MANIFEST)) ??
      (await readBundled<DataManifest>(MANIFEST));

    if (localManifest.version === remote.version) {
      return { updated: [], version: remote.version };
    }

    const stale = Object.entries(remote.files).filter(
      ([rel, meta]) => localManifest.files[rel]?.sha !== meta.sha,
    );

    const updated: string[] = [];
    for (let i = 0; i < stale.length; i++) {
      const [rel] = stale[i];
      try {
        const r = await fetch(`${REMOTE_BASE}/${rel}`, { cache: 'no-store' });
        if (!r.ok) continue;
        await FileSystem.writeAsStringAsync(cachePath(rel), await r.text());
        updated.push(rel);
      } catch {
        // One failed file should not abandon the rest; the manifest is only
        // written at the end, so a partial sync retries cleanly next launch.
      }
      onProgress?.(i + 1, stale.length);
    }

    // Only record the new version once every file landed, so an interrupted
    // sync does not leave us believing we are up to date when we are not.
    if (updated.length === stale.length) {
      await FileSystem.writeAsStringAsync(
        cachePath(MANIFEST), JSON.stringify(remote),
      );
    }
    return { updated, version: remote.version };
  } catch {
    return { updated: [], version: null };
  }
}

/** Used by the settings screen and by tests; also a quick way to force a re-sync. */
export async function clearDataCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  } catch {
    /* nothing cached */
  }
}

export async function currentDataVersion(): Promise<string> {
  const m = await loadData<DataManifest>(MANIFEST);
  return m.version;
}
