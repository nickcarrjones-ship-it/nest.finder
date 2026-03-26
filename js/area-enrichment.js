/**
 * area-enrichment.js
 * ─────────────────────────────────────────────────────────────
 * After a search runs, fetches real neighbourhood data for every
 * area in greenAreas and caches it. The AI filter then includes
 * this data in its prompt so classifications are data-backed
 * rather than pure LLM guesswork.
 *
 * Data sources (all free, no API key required):
 *   OpenStreetMap Overpass  — cafés, pubs, parks, gyms, schools (1 bbox call)
 *   Met Police API          — crime incident count last month
 *   Open-Meteo Air Quality  — European AQI index
 *   TfL StopPoint API       — tube zone + lines served
 *
 * Depends on: nothing (standalone module)
 * Exposes: enrichAreas(areas), getAreaContext(name),
 *          window.enrichmentInProgress, window.enrichmentDone
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

var areaEnrichmentCache   = {};
window.enrichmentInProgress = false;
window.enrichmentDone       = false;

// ── Main entry point ─────────────────────────────────────────
// Called by computeZones() in map-core.js after greenAreas is built.
async function enrichAreas(areas) {
  if (!areas || !areas.length) return;

  areaEnrichmentCache             = {};
  window.enrichmentInProgress     = true;
  window.enrichmentDone           = false;

  // Initialise cache slots so getAreaContext never returns stale data
  areas.forEach(function(item) {
    areaEnrichmentCache[item.area.name] = {};
  });

  try {
    // 1. One batch OSM call covers all areas at once
    await fetchOSMBatch(areas);

    // 2. Per-area calls run in parallel groups of 5
    await fetchPerAreaData(areas);
  } catch (e) {
    console.warn('[NestFinder] Enrichment error:', e);
  }

  window.enrichmentInProgress = false;
  window.enrichmentDone       = true;
}

// ── Format context string for the AI prompt ──────────────────
// Returns a pipe-separated summary for one area, e.g.:
// "Zone 2 | Central, Jubilee | Crime: 42/month | Air: Good (18) | Cafés: 14 | Pubs: 9 | Parks: 3 | Gyms: 2 | Schools: 5"
function getAreaContext(name) {
  var d = areaEnrichmentCache[name];
  if (!d) return '';
  var parts = [];
  if (d.tflZone)                   parts.push('Zone ' + d.tflZone);
  if (d.tflLines)                  parts.push(d.tflLines);
  if (d.crimeCount !== undefined)  parts.push('Crime: ' + d.crimeCount + '/month');
  if (d.aqiLabel)                  parts.push('Air: ' + d.aqiLabel);
  if (d.cafes  !== undefined)      parts.push('Cafés: '   + d.cafes);
  if (d.pubs   !== undefined)      parts.push('Pubs: '    + d.pubs);
  if (d.parks  !== undefined)      parts.push('Parks: '   + d.parks);
  if (d.gyms   !== undefined)      parts.push('Gyms: '    + d.gyms);
  if (d.schools !== undefined)     parts.push('Schools: ' + d.schools);
  return parts.join(' | ');
}

// ── OpenStreetMap batch fetch ─────────────────────────────────
// One Overpass query for the bounding box of all greenAreas.
// Nodes are then bucketed by proximity to each area (no Haversine —
// a simple degree-difference box check is accurate enough for counts).
async function fetchOSMBatch(areas) {
  // Compute bbox with 0.01° padding (~1 km)
  var minLat =  90, maxLat = -90, minLng =  180, maxLng = -180;
  areas.forEach(function(item) {
    if (item.lat < minLat) minLat = item.lat;
    if (item.lat > maxLat) maxLat = item.lat;
    if (item.lng < minLng) minLng = item.lng;
    if (item.lng > maxLng) maxLng = item.lng;
  });
  minLat -= 0.01; maxLat += 0.01;
  minLng -= 0.01; maxLng += 0.01;

  var bbox = minLat + ',' + minLng + ',' + maxLat + ',' + maxLng;

  // Query nodes for venues; ways (polygons) for parks and schools only.
  // Parks: ways only + must have a name — filters out tiny unnamed grass
  // patches, traffic islands and estate scraps that OSM tags as leisure=park.
  var query =
    '[out:json][timeout:30];(' +
      'node["amenity"="cafe"]('                    + bbox + ');' +
      'node["amenity"="pub"]('                     + bbox + ');' +
      'node["amenity"="bar"]('                     + bbox + ');' +
      'way["leisure"="park"]["name"]('             + bbox + ');' +
      'node["leisure"="fitness_centre"]('          + bbox + ');' +
      'node["amenity"="school"]('                  + bbox + ');' +
      'way["amenity"="school"]('                   + bbox + ');' +
    ');out center;';

  try {
    var resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    });
    var data = await resp.json();

    // Initialise counts to zero
    areas.forEach(function(item) {
      var c = areaEnrichmentCache[item.area.name];
      c.cafes = 0; c.pubs = 0; c.parks = 0; c.gyms = 0; c.schools = 0;
    });

    // ~0.007° ≈ 800 m latitude; ~0.011° ≈ 800 m longitude at London's lat
    var LAT_DEG = 0.007;
    var LNG_DEG = 0.011;

    (data.elements || []).forEach(function(el) {
      var lat = el.lat || (el.center && el.center.lat);
      var lng = el.lon || (el.center && el.center.lon);
      if (!lat || !lng) return;

      var amenity = el.tags && (el.tags.amenity || el.tags.leisure);

      areas.forEach(function(item) {
        if (Math.abs(lat - item.lat) > LAT_DEG) return;
        if (Math.abs(lng - item.lng) > LNG_DEG) return;

        var c = areaEnrichmentCache[item.area.name];
        if (amenity === 'cafe')             c.cafes++;
        if (amenity === 'pub' || amenity === 'bar') c.pubs++;
        if (amenity === 'park')             c.parks++;
        if (amenity === 'fitness_centre')   c.gyms++;
        if (amenity === 'school')           c.schools++;
      });
    });
  } catch (e) {
    console.warn('[NestFinder] OSM batch error:', e);
  }
}

// ── Per-area fetches (crime, air quality, TfL) ───────────────
// Runs in groups of 5 to avoid hammering the APIs.
async function fetchPerAreaData(areas) {
  var CONCURRENCY = 5;
  for (var i = 0; i < areas.length; i += CONCURRENCY) {
    var batch = areas.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(fetchSingleArea));
  }
}

async function fetchSingleArea(item) {
  await Promise.all([
    fetchCrime(item.area.name, item.lat, item.lng),
    fetchAirQuality(item.area.name, item.lat, item.lng),
    fetchTfl(item.area.name, item.lat, item.lng)
  ]);
}

// ── Met Police ───────────────────────────────────────────────
// Returns the number of crimes recorded within ~1 mile of the
// station in the most recently available month.
async function fetchCrime(name, lat, lng) {
  try {
    // Police data typically lags 2 months; go back 3 to be safe
    var d = new Date();
    d.setMonth(d.getMonth() - 3);
    var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

    var url = 'https://data.police.uk/api/crimes-street/all-crime' +
              '?lat=' + lat + '&lng=' + lng + '&date=' + dateStr;
    var resp = await fetch(url);
    var data = await resp.json();
    areaEnrichmentCache[name].crimeCount = Array.isArray(data) ? data.length : 0;
  } catch (e) { /* fail silently */ }
}

// ── Open-Meteo Air Quality ───────────────────────────────────
// Uses European Air Quality Index (0 = best, 100+ = very poor).
// Open-Meteo is free, no key required, sourced from DEFRA and
// Copernicus Atmosphere Monitoring Service.
async function fetchAirQuality(name, lat, lng) {
  try {
    var url = 'https://air-quality-api.open-meteo.com/v1/air-quality' +
              '?latitude=' + lat + '&longitude=' + lng +
              '&current=european_aqi';
    var resp = await fetch(url);
    var data = await resp.json();
    var aqi  = data.current && data.current.european_aqi;
    if (aqi !== undefined && aqi !== null) {
      areaEnrichmentCache[name].aqi      = aqi;
      areaEnrichmentCache[name].aqiLabel = aqiToLabel(aqi);
    }
  } catch (e) { /* fail silently */ }
}

function aqiToLabel(aqi) {
  if (aqi <= 20)  return 'Good ('        + aqi + ')';
  if (aqi <= 40)  return 'Fair ('        + aqi + ')';
  if (aqi <= 60)  return 'Moderate ('    + aqi + ')';
  if (aqi <= 80)  return 'Poor ('        + aqi + ')';
  if (aqi <= 100) return 'Very poor ('   + aqi + ')';
  return               'Extremely poor (' + aqi + ')';
}

// ── TfL StopPoint API ────────────────────────────────────────
// Finds the nearest tube/rail station and returns its zone and
// the lines that serve it. No API key required.
async function fetchTfl(name, lat, lng) {
  try {
    var url = 'https://api.tfl.gov.uk/StopPoint' +
              '?lat=' + lat + '&lng=' + lng +
              '&stopTypes=NaptanMetroStation,NaptanRailStation' +
              '&radius=500&returnLines=true';
    var resp = await fetch(url);
    var data = await resp.json();
    var stops = data.stopPoints || [];
    if (!stops.length) return;

    var stop = stops[0];

    // Zone
    var zoneProp = (stop.additionalProperties || []).find(function(p) {
      return p.key === 'Zone';
    });
    if (zoneProp && zoneProp.value) {
      areaEnrichmentCache[name].tflZone = zoneProp.value;
    }

    // Lines (up to 4 to keep the context string short)
    if (stop.lines && stop.lines.length) {
      areaEnrichmentCache[name].tflLines = stop.lines
        .slice(0, 4)
        .map(function(l) { return l.name; })
        .join(', ');
    }
  } catch (e) { /* fail silently */ }
}

// ── Expose globals ────────────────────────────────────────────
window.enrichAreas        = enrichAreas;
window.getAreaContext     = getAreaContext;
window.areaEnrichmentCache = areaEnrichmentCache;
