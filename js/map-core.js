// NestFinder map.js
/**
 * map.js
 * ─────────────────────────────────────────────────────────────
 * Core map logic for NestFinder.
 * Depends on: config.js, profile.js, stations.json, journey-times.json
 * External libs: Leaflet, MarkerCluster (loaded via CDN in map.html)
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

// ── Module-level state ────────────────────────────────────────
var map;                    // Leaflet map instance
var layers = {};            // Named layer groups
var zoomCircles = [];       // All visible commute circles (so we can resize on zoom)
var greenAreas  = [];       // Areas that work for BOTH people after a search
var AREAS = [];             // Station list — loaded from stations.json
var JOURNEY_TIMES = {};     // Journey times — loaded from journey-times.json
var currentArea = null;     // Name of the area currently open in the sidebar
var currentUser = 'guest';  // 'p1' | 'p2' | 'guest'
var ratingsCache = {};      // Firebase ratings cache
var vetoedAreas  = {};      // { 'veto_<sanitizedAreaKey>': true }

function vetoStorageKey(areaName) {
  if (typeof AuthManager !== 'undefined' && AuthManager.sanitizeAreaKey) {
    return 'veto_' + AuthManager.sanitizeAreaKey(areaName);
  }
  return 'veto_' + String(areaName).replace(/[^a-z0-9_]/gi, '_').toLowerCase();
}
var top5Cache    = {};      // Top-5 rated stations
var db           = null;    // Firebase database reference (set by auth.js)
var p1Score = 0, p2Score = 0; // Scores for the currently open area
var gymToggles = { p1: false, p2: false };
var propertySearch = { type: 'rent', maxPrice: 'any', beds: 'any', radius: '1' }; // Rightmove/Zoopla filter state
var gymLayers  = {};        // Set up after map init

// ── Pin legend helper ─────────────────────────────────────────
function _pinLegendRow(colour, label) {
  return '<div style="display:flex;align-items:center;gap:6px">' +
    '<div style="width:16px;height:16px;border-radius:3px 3px 0 0;background:' + colour + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px">🏠</div>' +
    '<span>' + label + '</span>' +
    '</div>';
}

// ── Map initialisation ────────────────────────────────────────
function initMap() {
  var cfg = window.APP_CONFIG || {};

  map = L.map('map', {
    center: cfg.mapCenter || [51.505, -0.06],
    zoom:   cfg.mapZoom   || 11,
    zoomControl: false
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Stadia Alidade Smooth — premium-quality minimal tiles, no API key needed
  // Crisp, warm-toned, designed for data visualisation overlays.
  // Swap URL to 'alidade_smooth_dark' for a dark mode version.
  // CartoDB Positron — free, no API key needed on any domain, clean minimal style
  // Designed specifically for data visualisation overlays like ours.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  var renderer = L.svg({ padding: 0.5 });

  layers = {
    commute:    L.layerGroup().addTo(map),
    markers:    L.layerGroup().addTo(map),
    thirdspace: L.layerGroup().addTo(map),
    aiTop5:     L.layerGroup().addTo(map),
    viewings:   L.layerGroup().addTo(map),
    wishlist:   L.layerGroup().addTo(map)
  };

  // Expose map + layers for use by other modules (e.g. map-filter.js)
  window.nfMap    = map;
  window.nfLayers = layers;

  gymLayers = {
    p1: L.layerGroup().addTo(map),
    p2: L.layerGroup().addTo(map)
  };

  map.on('zoomend', updateCircleRadii);

  // ── Property pin legend ───────────────────────────────────────
  var legend = L.control({ position: 'bottomleft' });
  legend.onAdd = function() {
    var div = L.DomUtil.create('div');
    div.style.cssText = 'background:rgba(26,23,20,0.85);backdrop-filter:blur(4px);color:#fff;padding:7px 10px;border-radius:8px;font-size:11px;font-family:Outfit,sans-serif;line-height:1.8;box-shadow:0 2px 8px rgba(0,0,0,0.4);pointer-events:none';
    div.innerHTML =
      '<div style="font-weight:600;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">Properties</div>' +
      _pinLegendRow('#f59e0b', 'Want to view') +
      _pinLegendRow('#3b82f6', 'Upcoming viewing') +
      _pinLegendRow('#6b7280', 'Viewed');
    return div;
  };
  legend.addTo(map);

  // Apply the stored profile to the UI
  applyProfile();

  // Build gym pickers on setup overlay
  if (document.getElementById('gym-picker-p1')) {
    buildGymPicker('gym-picker-p1', 'p1');
    buildGymPicker('gym-picker-p2', 'p2');
  }

  rebuildTop5();

  // Auto-run on every page load so the user sees results immediately
  computeZones();
}

// ── Circle radius — scales with zoom ─────────────────────────
function getRadiusForZoom(z) {
  return 550 * Math.pow(2, 11 - z);
}
function updateCircleRadii() {
  var r = getRadiusForZoom(map.getZoom());
  zoomCircles.forEach(function(c) { c.setRadius(r); });
}

// ── Compute overlap zones ─────────────────────────────────────
function computeZones() {
  var profile = ProfileManager.get();
  if (!profile) { alert('Please complete setup first.'); return; }
  if (typeof nfLoadingStart === 'function') nfLoadingStart('Finding your areas\u2026');

  var lim = getCommuteMaxLimits();
  var p1Max = lim.p1Max;
  var p2Max = lim.p2Max;
  var walkKm = getWalkKmValues();
  var p1WalkKm = walkKm.p1WalkKm;
  var p2WalkKm = walkKm.p2WalkKm;
  var p1Walk = Math.round(p1WalkKm * 12);
  var p2Walk = Math.round(p2WalkKm * 12);

  // Keys into JOURNEY_TIMES — set from profile workId
  var p1Key = profile.p1.workId;
  var p2Key = profile.p2.workId;

  layers.commute.clearLayers();
  layers.markers.clearLayers();
  zoomCircles = [];
  greenAreas  = [];
  document.getElementById('results-section').style.display = 'none';

  var ideal = 0, reach = 0;
  var r = getRadiusForZoom(map.getZoom());
  var renderer = L.svg({ padding: 0.5 });

  AREAS.forEach(function(area) {
    var jt = JOURNEY_TIMES[area.name];
    if (!jt) return;  // No data for this station — skip silently

    // Check both destinations have data
    if (jt[p1Key] === undefined || jt[p2Key] === undefined) return;

    var t1 = jt[p1Key] + p1Walk + (profile.p1.offWalk || 0);
    var t2 = jt[p2Key] + p2Walk + (profile.p2.offWalk || 0);
    var inP1 = t1 <= p1Max;
    var inP2 = t2 <= p2Max;
    // Green-only mode: only show areas reachable by BOTH people
    if (!inP1 || !inP2) return;

    // Gym proximity filter — if a gym toggle is ON, only show areas
    // within 1 mile of at least one location of that gym brand
    var profile2 = ProfileManager.get();
    if (gymToggles.p1 && profile2 && profile2.p1.gym) {
      var brand1 = GYM_BRANDS[profile2.p1.gym];
      if (brand1) {
        var nearGym1 = brand1.locations.some(function(loc) {
          return haversine(area.lat, area.lng, loc.lat, loc.lng) <= 1;
        });
        if (!nearGym1) return;
      }
    }
    if (gymToggles.p2 && profile2 && profile2.p2.gym) {
      var brand2 = GYM_BRANDS[profile2.p2.gym];
      if (brand2) {
        var nearGym2 = brand2.locations.some(function(loc) {
          return haversine(area.lat, area.lng, loc.lat, loc.lng) <= 1;
        });
        if (!nearGym2) return;
      }
    }

    var both = inP1 && inP2;
    var vetoed = isVetoed(area.name);
    if (both) {
      if (!vetoed) ideal++;
      greenAreas.push({ area: area, t1: t1, t2: t2, lat: area.lat, lng: area.lng, circle: null, marker: null });
    }
    reach++;

    var ranked   = top5Cache[area.name];
    var rank     = ranked ? ranked.rank : null;
    var isTop    = rank && both;
    var color       = isTop ? '#f59e0b' : '#84cc16';
    var borderColor = isTop ? '#d97706' : '#65a30d';
    var safeN  = area.name.replace(/'/g, "\\'");
    var isGuest = currentUser === 'guest';

    var circle = null;
    var rankMarker = null;

    if (!vetoed) {
      var neverBtn =
        '<div style="margin-top:8px;border-top:1px solid #f1f5f9;padding-top:8px">' +
        '<button type="button" onclick="closePopupOpenArea(\'' + safeN + '\',' + t1 + ',' + t2 + ',' + both + ')" ' +
          'style="width:100%;padding:6px 4px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;background:#1a1f36;color:#a3e635">' +
          (isGuest ? 'View →' : 'Score →') + '</button>' +
        '</div>';

      circle = L.circle([area.lat, area.lng], {
        renderer:    renderer,
        radius:      r,
        fillColor:   color,
        color:       borderColor,
        weight:      2,
        fillOpacity: isTop ? 0.75 : 0.45
      }).bindPopup(
        '<b style="color:' + (isTop ? '#d97706' : '#16a34a') + '">' +
          (isTop ? (rank === 1 ? '👑' : rank + ' ') : '') +
          (both && !isTop ? '★ ' : '') + area.name +
        '</b>' +
        (isTop
          ? '<div style="font-size:11px;color:#d97706;font-weight:700;margin:1px 0 5px">Rank #' + rank + ' — Combined score ' + ranked.total + '/20</div>'
          : '<div style="font-size:11px;color:#6b7280;margin:2px 0 6px">Ideal for both</div>') +
        '<div style="font-size:12px;margin-bottom:2px">' + profile.p1.name + ': <b>' + t1 + ' min total</b> (' + jt[p1Key] + ' train + ' + p1Walk + ' walk)</div>' +
        '<div style="font-size:12px">' + profile.p2.name + ': <b>' + t2 + ' min total</b> (' + jt[p2Key] + ' train + ' + p2Walk + ' walk)</div>' +
        neverBtn,
        { minWidth: 200 }
      ).addTo(layers.commute);

      circle.on('click', function() {
        circle.openPopup();
        openAreaInfo(area, t1, t2, both);
      });

      if (both) {
        var gaItem = greenAreas[greenAreas.length - 1];
        if (gaItem && gaItem.area.name === area.name) gaItem.circle = circle;
      }

      if (isTop) {
        var label    = rank === 1 ? '👑' : (rank + '');
        var rankIcon = L.divIcon({
          html: '<div style="background:#d97706;color:#fff;border:2px solid #fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:' + (rank === 1 ? '12' : '11') + 'px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.4);pointer-events:none">' + label + '</div>',
          className: '', iconSize: [22, 22], iconAnchor: [11, 11]
        });
        rankMarker = L.marker([area.lat, area.lng], { icon: rankIcon, interactive: false }).addTo(layers.commute);
        if (both) {
          var gaItem2 = greenAreas[greenAreas.length - 1];
          if (gaItem2 && gaItem2.area.name === area.name) gaItem2.marker = rankMarker;
        }
      }

      zoomCircles.push(circle);
    }
  });

  // Work location markers
  var destinations = window.DESTINATIONS || [];
  function mkIcon(lbl, col) {
    return L.divIcon({
      html: '<div style="background:' + col + ';width:32px;height:32px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">' + lbl + '</div>',
      className: '', iconSize: [32, 32], iconAnchor: [16, 16]
    });
  }

  // Find lat/lng for each work station from AREAS
  function findStation(id) {
    var dest = destinations.find(function(d) { return d.id === id; });
    if (!dest) return null;
    return AREAS.find(function(a) {
      return a.name.toLowerCase().replace(/[^a-z]/g, '') === dest.label.toLowerCase().replace(/[^a-z]/g, '');
    });
  }

  var p1Station = findStation(p1Key);
  var p2Station = findStation(p2Key);
  if (p1Station) L.marker([p1Station.lat, p1Station.lng], { icon: mkIcon(profile.p1.name.substring(0,1).toUpperCase(), '#2563eb') }).bindPopup('<b>' + profile.p1.workLabel + '</b><br>' + profile.p1.name + '\'s workplace').addTo(layers.markers);
  if (p2Station) L.marker([p2Station.lat, p2Station.lng], { icon: mkIcon(profile.p2.name.substring(0,1).toUpperCase(), '#2563eb') }).bindPopup('<b>' + profile.p2.workLabel + '</b><br>' + profile.p2.name + '\'s workplace').addTo(layers.markers);

  document.getElementById('stat-ideal').textContent     = ideal;
  document.getElementById('stat-reachable').textContent = reach;
  document.getElementById('results-section').style.display = 'block';
  var hdrRes = document.getElementById('header-results');
  if (hdrRes) hdrRes.textContent = ideal + ' ideal · ' + reach + ' reachable';
  var hdrClr = document.getElementById('header-clear-btn');
  if (hdrClr) hdrClr.style.display = 'block';
  document.getElementById('clear-btn').style.display    = 'block';
  document.getElementById('data-note').textContent      = ideal + ' areas work for both within your limits. Tap any bubble to explore.';

  // Apply gym distance filter — also re-fits the map to all visible bubbles
  applyGymFilter();

  if (typeof nfLoadingDone === 'function') nfLoadingDone();

  // Kick off neighbourhood data enrichment in the background
  // (used by the AI filter tab to make data-backed classifications)
  if (typeof enrichAreas === 'function') enrichAreas(greenAreas);

  // Re-apply AI filter colours if they were active before this redraw.
  // This prevents veto actions (which trigger computeZones) from wiping
  // the green/amber/red classification from remaining circles.
  if (typeof reapplyFilterColors === 'function') reapplyFilterColors();

  // On first search after new setup, auto-classify using onboarding profile
  if (typeof runInitialAiClassification === 'function') runInitialAiClassification();
}

function clearResults() {
  layers.commute.clearLayers();
  layers.markers.clearLayers();
  zoomCircles = [];
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('clear-btn').style.display = 'none';
  var hdrRes = document.getElementById('header-results');
  if (hdrRes) hdrRes.textContent = '';
  var hdrClr = document.getElementById('header-clear-btn');
  if (hdrClr) hdrClr.style.display = 'none';
}

// ── Firebase init (called from auth.js when user logs in) ─────
function initFirebase() {
  if (typeof firebase === 'undefined') return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.database();
  } catch(e) {
    console.warn('[NestFinder] Firebase not available:', e);
  }
}
window.initFirebase = initFirebase;

// Make compute/clear global
window.computeZones = computeZones;
window.clearResults = clearResults;

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  loadData();
});
