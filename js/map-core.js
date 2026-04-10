// Maloca map.js
/**
 * map.js
 * ─────────────────────────────────────────────────────────────
 * Core map logic for Maloca.
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
var memberScores = [];       // Scores per member for the currently open area (replaces p1Score/p2Score)
var p1Score = 0, p2Score = 0; // Legacy aliases — kept so older callers don't break
var gymToggles = [];        // Per-member gym toggle state (array of booleans)
var propertySearch = { type: 'rent', maxPrice: 'any', beds: 'any', radius: '1' }; // Rightmove/Zoopla filter state
var gymLayers  = [];        // Per-member gym layer groups (array, set up after map init)

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

  // Gym layers are initialised per-member in applyProfile() once profile is loaded
  gymLayers = [];

  map.on('zoomend', updateCircleRadii);

  // ── Property pin legend ───────────────────────────────────────
  var legend = L.control({ position: 'bottomleft' });
  legend.onAdd = function() {
    var div = L.DomUtil.create('div');
    div.id = 'map-pin-legend';
    div.style.cssText = 'background:rgba(26,23,20,0.85);backdrop-filter:blur(4px);color:#fff;padding:7px 10px;border-radius:8px;font-size:11px;font-family:Outfit,sans-serif;line-height:1.8;box-shadow:0 2px 8px rgba(0,0,0,0.4);pointer-events:none';
    div.innerHTML =
      '<div style="font-weight:600;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">Properties</div>' +
      _pinLegendRow('#f59e0b', 'Top 3 rated') +
      _pinLegendRow('#6b7280', 'Viewed') +
      _pinLegendRow('#3b82f6', 'Upcoming viewing') +
      _pinLegendRow('#f9a8d4', 'Want to view');
    return div;
  };
  legend.addTo(map);

  // Apply the stored profile to the UI
  applyProfile();

  // Gym pickers are built per-member in applyProfile() once profile is loaded

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

  var members = profile.members;
  var lim = getCommuteMaxLimits();   // returns { maxMins: [] }
  var walkVals = getWalkKmValues();  // returns { walkKms: [] }
  var maxMins = lim.maxMins || members.map(function() { return 30; });
  var walkKms = walkVals.walkKms || members.map(function() { return 1.5; });
  var walkMins = walkKms.map(function(km) { return Math.round(km * 12); });

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
    if (!jt) return;

    // Calculate commute time for each member; bail if any member's data is missing
    var memberTimes = [];
    var allInRange = members.every(function(m, i) {
      if (jt[m.workId] === undefined) return false;
      var t = jt[m.workId] + walkMins[i] + (m.offWalk || 0);
      memberTimes[i] = t;
      return t <= maxMins[i];
    });
    if (!allInRange) return;

    // Gym proximity filter — if a member's gym toggle is ON, only show areas
    // within 1 mile of at least one location of that gym brand
    var gymBlocked = gymToggles.some(function(on, i) {
      if (!on) return false;
      var m = members[i];
      if (!m || !m.gym) return false;
      var brand = typeof GYM_BRANDS !== 'undefined' && GYM_BRANDS[m.gym];
      if (!brand) return false;
      return !brand.locations.some(function(loc) {
        return haversine(area.lat, area.lng, loc.lat, loc.lng) <= 1;
      });
    });
    if (gymBlocked) return;

    var vetoed = isVetoed(area.name);
    if (!vetoed) ideal++;
    greenAreas.push({ area: area, memberTimes: memberTimes, t1: memberTimes[0], t2: memberTimes[1] || 0, lat: area.lat, lng: area.lng, circle: null, marker: null });
    reach++;

    var ranked   = top5Cache[area.name];
    var rank     = ranked ? ranked.rank : null;
    var isTop    = !!rank;
    var color       = isTop ? '#f59e0b' : '#84cc16';
    var borderColor = isTop ? '#d97706' : '#65a30d';
    var safeN  = area.name.replace(/'/g, "\\'");
    var isGuest = currentUser === 'guest';

    var circle = null;
    var rankMarker = null;

    if (!vetoed) {
      // Build per-member commute lines for popup
      var commuteLines = members.map(function(m, i) {
        return '<div style="font-size:12px;margin-bottom:2px">' +
          m.name + ': <b>' + memberTimes[i] + ' min total</b>' +
          ' (' + jt[m.workId] + ' train + ' + walkMins[i] + ' walk)</div>';
      }).join('');

      var maxScore = members.length * 10;
      var neverBtn =
        '<div style="margin-top:8px;border-top:1px solid #f1f5f9;padding-top:8px">' +
        '<button type="button" onclick="closePopupOpenArea(\'' + safeN + '\',' + (memberTimes[0] || 0) + ',' + (memberTimes[1] || 0) + ',true)" ' +
          'style="width:100%;padding:6px 4px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;background:#1a1f36;color:#a3e635">' +
          (isGuest ? 'View →' : 'Score →') + '</button>' +
        '</div>';

      var gymDivId = 'ngym-' + area.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
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
          (!isTop ? '★ ' : '') + area.name +
        '</b>' +
        (isTop
          ? '<div style="font-size:11px;color:#d97706;font-weight:700;margin:1px 0 5px">Rank #' + rank + ' — Combined score ' + ranked.total + '/' + maxScore + '</div>'
          : '<div style="font-size:11px;color:#6b7280;margin:2px 0 6px">Ideal for everyone</div>') +
        commuteLines +
        neverBtn +
        '<div id="' + gymDivId + '" style="margin-top:8px;border-top:1px solid #f3f4f6;padding-top:6px">' +
          '<button onclick="loadNearbyGyms(' + area.lat + ',' + area.lng + ',\'' + gymDivId + '\')" ' +
            'style="background:none;border:none;font-size:11px;color:#0891b2;cursor:pointer;padding:0;font-family:inherit;font-weight:600">\uD83C\uDFCB\uFE0F Nearest gyms</button>' +
        '</div>',
        { minWidth: 200 }
      ).addTo(layers.commute);

      circle.on('click', function() {
        circle.openPopup();
        openAreaInfo(area, memberTimes[0] || 0, memberTimes[1] || 0, true);
      });

      var gaItem = greenAreas[greenAreas.length - 1];
      if (gaItem && gaItem.area.name === area.name) gaItem.circle = circle;

      if (isTop) {
        var label    = rank === 1 ? '👑' : (rank + '');
        var rankIcon = L.divIcon({
          html: '<div style="background:#d97706;color:#fff;border:2px solid #fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:' + (rank === 1 ? '12' : '11') + 'px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.4);pointer-events:none">' + label + '</div>',
          className: '', iconSize: [22, 22], iconAnchor: [11, 11]
        });
        rankMarker = L.marker([area.lat, area.lng], { icon: rankIcon, interactive: false }).addTo(layers.commute);
        var gaItem2 = greenAreas[greenAreas.length - 1];
        if (gaItem2 && gaItem2.area.name === area.name) gaItem2.marker = rankMarker;
      }

      zoomCircles.push(circle);
    }
  });

  // Work location markers — one per member
  var destinations = window.DESTINATIONS || [];
  function mkIcon(lbl, col) {
    return L.divIcon({
      html: '<div style="background:' + col + ';width:32px;height:32px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">' + lbl + '</div>',
      className: '', iconSize: [32, 32], iconAnchor: [16, 16]
    });
  }
  function findStation(id) {
    var dest = destinations.find(function(d) { return d.id === id; });
    if (!dest) return null;
    return AREAS.find(function(a) {
      return a.name.toLowerCase().replace(/[^a-z]/g, '') === dest.label.toLowerCase().replace(/[^a-z]/g, '');
    });
  }

  members.forEach(function(m) {
    var station = findStation(m.workId);
    if (station) {
      L.marker([station.lat, station.lng], { icon: mkIcon(m.name.substring(0,1).toUpperCase(), '#2563eb') })
        .bindPopup('<b>' + m.workLabel + '</b><br>' + m.name + '\'s workplace')
        .addTo(layers.markers);
    }
  });

  document.getElementById('stat-ideal').textContent     = ideal;
  document.getElementById('stat-reachable').textContent = reach;
  document.getElementById('results-section').style.display = 'block';
  var hdrRes = document.getElementById('header-results');
  if (hdrRes) hdrRes.textContent = ideal + ' ideal · ' + reach + ' reachable';
  var hdrClr = document.getElementById('header-clear-btn');
  if (hdrClr) hdrClr.style.display = 'block';
  document.getElementById('clear-btn').style.display    = 'block';
  var groupLabel = profile.groupType === 'group' ? 'everyone' : 'both';
  document.getElementById('data-note').textContent      = ideal + ' areas work for ' + groupLabel + ' within your limits. Tap any bubble to explore.';

  // Apply gym distance filter — also re-fits the map to all visible bubbles
  applyGymFilter();

  if (typeof nfLoadingDone === 'function') nfLoadingDone();

  if (typeof enrichAreas === 'function') enrichAreas(greenAreas);

  if (typeof reapplyFilterColors === 'function') reapplyFilterColors();

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
    console.warn('[Maloca] Firebase not available:', e);
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
