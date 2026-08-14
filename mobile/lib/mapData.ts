import type { Area, JourneyTimes } from './types';

/**
 * The live web app's data files — no need to duplicate ~500KB of JSON inside
 * the mobile bundle when the website already serves it. Fetched fresh on
 * first load; on-device caching (so a slow/offline launch still works) is
 * Week 3 work once a storage library is installed.
 */
const DATA_BASE_URL = 'https://maloca.homes/data';

export async function fetchStations(): Promise<Area[]> {
  const res = await fetch(`${DATA_BASE_URL}/stations.json`);
  if (!res.ok) throw new Error(`stations.json fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchJourneyTimes(): Promise<JourneyTimes> {
  const res = await fetch(`${DATA_BASE_URL}/journey-times.json`);
  if (!res.ok) throw new Error(`journey-times.json fetch failed: ${res.status}`);
  const data = await res.json();
  delete data._readme; // metadata field in the source file, not a real area
  return data;
}
