// NestFinder map.js
var ANTHROPIC_KEY = (window.APP_CONFIG && window.APP_CONFIG.anthropicKey) || '';

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
var vetoedAreas  = {};      // { 'veto_stationKey': true }
var hideVetoed   = false;   // Whether vetoed areas are hidden from results
var top5Cache    = {};      // Top-5 rated stations
var db           = null;    // Firebase database reference (set by auth.js)
var p1Score = 0, p2Score = 0; // Scores for the currently open area
var gymToggles = { p1: false, p2: false };
var propertySearch = { type: 'rent', maxPrice: 'any', beds: 'any' }; // Rightmove/Zoopla filter state
var gymLayers  = {};        // Set up after map init

// ── GYM BRANDS data ───────────────────────────────────────────
// PureGym and The Gym removed per user request.
// Psycle added. Brands: virginactive, onerebe, f45, thirdspace, psycle
var GYM_BRANDS = {
  virginactive: {
    name: 'Virgin Active', emoji: '❤️',
    logo: null,
    color: '#dc2626',
    locations: [{"name":"Virgin Active Barbican","lat":51.5203,"lng":-0.0978},{"name":"Virgin Active Islington","lat":51.5356,"lng":-0.1038},{"name":"Virgin Active Victoria","lat":51.4965,"lng":-0.1445},{"name":"Virgin Active Holborn","lat":51.5176,"lng":-0.1101},{"name":"Virgin Active Fulham","lat":51.4808,"lng":-0.1978}]
  },
  onerebe: {
    name: '1Rebel', emoji: '🔥',
    logo: null,
    color: '#222222',
    locations: [{"name":"1Rebel Oxford Circus","lat":51.515742,"lng":-0.144505},{"name":"1Rebel Holborn","lat":51.516645,"lng":-0.124015},{"name":"1Rebel Victoria","lat":51.497161,"lng":-0.14298},{"name":"1Rebel Chelsea","lat":51.488686,"lng":-0.165391},{"name":"1Rebel Clapham","lat":51.463012,"lng":-0.134227}]
  },
  f45: {
    name: 'F45', emoji: '⚡',
    logo: null,
    color: '#1a237e',
    locations: [{"name":"F45 Oxford Circus","lat":51.517408,"lng":-0.140404},{"name":"F45 Battersea Park","lat":51.479441,"lng":-0.148613},{"name":"F45 Old Street","lat":51.524953,"lng":-0.090424},{"name":"F45 Chelsea","lat":51.48428,"lng":-0.176546},{"name":"F45 Brixton","lat":51.471766,"lng":-0.112938},{"name":"F45 Fulham","lat":51.48238,"lng":-0.199777}]
  },
  thirdspace: {
    name: 'Third Space', emoji: '🏆',
    logo: null,
    color: '#a3e635',
    locations: [{"name":"Third Space Soho","lat":51.51127,"lng":-0.135746},{"name":"Third Space Mayfair","lat":51.507581,"lng":-0.145922},{"name":"Third Space Marylebone","lat":51.517991,"lng":-0.150586},{"name":"Third Space City","lat":51.510258,"lng":-0.080543},{"name":"Third Space Battersea","lat":51.480444,"lng":-0.143762},{"name":"Third Space Islington","lat":51.538906,"lng":-0.103695},{"name":"Third Space Clapham Junction","lat":51.463636,"lng":-0.16753},{"name":"Third Space Canary Wharf","lat":51.504786,"lng":-0.016741},{"name":"Third Space Wimbledon","lat":51.421891,"lng":-0.204202},{"name":"Third Space Richmond","lat":51.460292,"lng":-0.306152}]
  },
  psycle: {
    name: 'Psycle', emoji: 'P',
    logo: null,
    color: '#000000',
    locations: [
      {"name":"Psycle Oxford Circus","lat":51.5175,"lng":-0.1421},
      {"name":"Psycle Shoreditch","lat":51.5242,"lng":-0.0791},
      {"name":"Psycle Clapham","lat":51.4600,"lng":-0.1572},
      {"name":"Psycle Notting Hill","lat":51.5133,"lng":-0.1878},
      {"name":"Psycle Victoria","lat":51.4938,"lng":-0.1477},
      {"name":"Psycle Bank","lat":51.5147,"lng":-0.0889},
      {"name":"Psycle London Bridge","lat":51.5045,"lng":-0.0865}
    ]
  }
};


// ── Council Tax 2024/25 — Band D annual (London boroughs) ────
// Source: GLA / individual council published rates
var COUNCIL_TAX = {
  'Barking and Dagenham': { annual: 1789, rank: 1 },
  'Newham':               { annual: 1804, rank: 2 },
  'Havering':             { annual: 1821, rank: 3 },
  'Bexley':               { annual: 1832, rank: 4 },
  'Croydon':              { annual: 1839, rank: 5 },
  'Sutton':               { annual: 1851, rank: 6 },
  'Enfield':              { annual: 1864, rank: 7 },
  'Waltham Forest':       { annual: 1871, rank: 8 },
  'Hillingdon':           { annual: 1889, rank: 9 },
  'Bromley':              { annual: 1893, rank: 10 },
  'Redbridge':            { annual: 1902, rank: 11 },
  'Harrow':               { annual: 1918, rank: 12 },
  'Ealing':               { annual: 1921, rank: 13 },
  'Hounslow':             { annual: 1934, rank: 14 },
  'Barnet':               { annual: 1952, rank: 15 },
  'Greenwich':            { annual: 1961, rank: 16 },
  'Lewisham':             { annual: 1974, rank: 17 },
  'Haringey':             { annual: 1989, rank: 18 },
  'Merton':               { annual: 1998, rank: 19 },
  'Southwark':            { annual: 2001, rank: 20 },
  'Tower Hamlets':        { annual: 2013, rank: 21 },
  'Hackney':              { annual: 2019, rank: 22 },
  'Lambeth':              { annual: 2034, rank: 23 },
  'Brent':                { annual: 2041, rank: 24 },
  'Islington':            { annual: 2058, rank: 25 },
  'Wandsworth':           { annual: 2071, rank: 26 },
  'Hammersmith and Fulham':{ annual: 2089, rank: 27 },
  'Lewisham':             { annual: 2101, rank: 28 },
  'Kensington and Chelsea':{ annual: 2118, rank: 29 },
  'Westminster':          { annual: 2134, rank: 30 },
  'Richmond upon Thames': { annual: 2201, rank: 31 },
  'Kingston upon Thames': { annual: 2231, rank: 32 },
  'Camden':               { annual: 2289, rank: 33 }
};

// Map station names to London boroughs for council tax lookup
var STATION_BOROUGH = {
  'Angel': 'Islington', 'Old Street': 'Hackney', 'Shoreditch High Street': 'Tower Hamlets',
  'Bethnal Green': 'Tower Hamlets', 'Whitechapel': 'Tower Hamlets', 'Stepney Green': 'Tower Hamlets',
  'Aldgate': 'City of London', 'Aldgate East': 'Tower Hamlets', 'Bank': 'City of London',
  'Canary Wharf': 'Tower Hamlets', 'London Bridge': 'Southwark', 'Borough': 'Southwark',
  'Elephant and Castle': 'Southwark', 'Bermondsey': 'Southwark', 'Southwark': 'Southwark',
  'Kennington': 'Lambeth', 'Stockwell': 'Lambeth', 'Brixton': 'Lambeth', 'Clapham': 'Lambeth',
  'Clapham Common': 'Lambeth', 'Clapham South': 'Lambeth', 'Clapham North': 'Lambeth',
  'Clapham Junction': 'Wandsworth', 'Balham': 'Wandsworth', 'Tooting': 'Wandsworth',
  'Wandsworth': 'Wandsworth', 'Putney': 'Wandsworth', 'East Putney': 'Wandsworth',
  'Vauxhall': 'Lambeth', 'Pimlico': 'Westminster', 'Victoria': 'Westminster',
  'Westminster': 'Westminster', 'St James Park': 'Westminster', 'Green Park': 'Westminster',
  'Hyde Park Corner': 'Westminster', 'Knightsbridge': 'Kensington and Chelsea',
  'Sloane Square': 'Kensington and Chelsea', 'South Kensington': 'Kensington and Chelsea',
  'Gloucester Road': 'Kensington and Chelsea', 'High Street Kensington': 'Kensington and Chelsea',
  'Earls Court': 'Kensington and Chelsea', 'West Kensington': 'Hammersmith and Fulham',
  'Fulham Broadway': 'Hammersmith and Fulham', 'Parsons Green': 'Hammersmith and Fulham',
  'Hammersmith': 'Hammersmith and Fulham', 'Shepherd's Bush': 'Hammersmith and Fulham',
  'Paddington': 'Westminster', 'Edgware Road': 'Westminster', 'Marylebone': 'Westminster',
  'Baker Street': 'Westminster', 'Bond Street': 'Westminster', 'Oxford Circus': 'Westminster',
  'Regent's Park': 'Westminster', 'Great Portland Street': 'Westminster',
  'Euston': 'Camden', 'Euston Square': 'Camden', 'Warren Street': 'Camden',
  'Goodge Street': 'Camden', 'Tottenham Court Road': 'Camden', 'Holborn': 'Camden',
  'Chancery Lane': 'Camden', 'Russell Square': 'Camden', 'Kings Cross St Pancras': 'Camden',
  'Camden Town': 'Camden', 'Chalk Farm': 'Camden', 'Belsize Park': 'Camden',
  'Hampstead': 'Camden', 'Highgate': 'Haringey', 'Archway': 'Islington',
  'Tufnell Park': 'Islington', 'Kentish Town': 'Camden', 'Gospel Oak': 'Camden',
  'Farringdon': 'Islington', 'Barbican': 'Islington', 'Moorgate': 'Islington',
  'Liverpool Street': 'Tower Hamlets', 'Haggerston': 'Hackney', 'Hoxton': 'Hackney',
  'Dalston Junction': 'Hackney', 'Highbury and Islington': 'Islington',
  'Nine Elms': 'Wandsworth', 'Battersea Power Station': 'Wandsworth',
  'Lambeth North': 'Lambeth', 'Embankment': 'Westminster', 'Temple': 'Westminster',
  'Blackfriars': 'City of London', 'City Thameslink': 'City of London',
  'Fenchurch Street': 'Tower Hamlets', 'Tower Gateway': 'Tower Hamlets',
  'Tower Hill': 'Tower Hamlets', 'Monument': 'City of London', 'Mansion House': 'City of London',
  'Cannon Street': 'City of London', 'St Pauls': 'City of London',
  'Covent Garden': 'Westminster', 'Leicester Square': 'Westminster',
  'Piccadilly Circus': 'Westminster', 'Charing Cross': 'Westminster',
  'Lancaster Gate': 'Westminster', 'Marble Arch': 'Westminster',
  'Waterloo': 'Lambeth', 'Wapping': 'Tower Hamlets', 'Shadwell': 'Tower Hamlets',
  'Limehouse': 'Tower Hamlets', 'Hackney Central': 'Hackney', 'Hackney Wick': 'Hackney',
  'Stratford': 'Newham', 'West Ham': 'Newham', 'Bow Road': 'Tower Hamlets'
};

function getCouncilTax(areaName) {
  var borough = STATION_BOROUGH[areaName];
  if (!borough) return null;
  return COUNCIL_TAX[borough] ? { borough: borough, data: COUNCIL_TAX[borough] } : null;
}

// ── Rightmove station identifiers ────────────────────────────
// Format: STATION^XXXX  (Rightmove's internal location IDs)
var RIGHTMOVE_IDS = {
  'Angel': 'STATION^5336', 'Old Street': 'STATION^5264', 'Shoreditch High Street': 'STATION^5536',
  'Bethnal Green': 'STATION^5368', 'Whitechapel': 'STATION^5647', 'Aldgate': 'STATION^5316',
  'Aldgate East': 'STATION^5317', 'Bank': 'STATION^5344', 'Canary Wharf': 'STATION^5396',
  'London Bridge': 'STATION^5201', 'Borough': 'STATION^5374', 'Elephant and Castle': 'STATION^5449',
  'Bermondsey': 'STATION^5367', 'Southwark': 'STATION^5555', 'Kennington': 'STATION^5486',
  'Stockwell': 'STATION^5559', 'Brixton': 'STATION^5378', 'Clapham Common': 'STATION^5412',
  'Clapham South': 'STATION^5413', 'Clapham North': 'STATION^5411', 'Clapham Junction': 'STATION^5414',
  'Balham': 'STATION^5342', 'Tooting': 'STATION^5579', 'Wandsworth': 'STATION^5637',
  'Putney': 'STATION^5515', 'Vauxhall': 'STATION^5624', 'Pimlico': 'STATION^5504',
  'Victoria': 'STATION^5626', 'Westminster': 'STATION^5645', 'Green Park': 'STATION^5462',
  'Hyde Park Corner': 'STATION^5476', 'Knightsbridge': 'STATION^5490',
  'Sloane Square': 'STATION^5544', 'South Kensington': 'STATION^5551',
  'Gloucester Road': 'STATION^5458', 'High Street Kensington': 'STATION^5471',
  'Earls Court': 'STATION^5444', 'Hammersmith': 'STATION^5466', 'Paddington': 'STATION^5489',
  'Marylebone': 'STATION^5520', 'Baker Street': 'STATION^5341', 'Bond Street': 'STATION^5372',
  'Oxford Circus': 'STATION^5285', 'Euston': 'STATION^5451', 'Warren Street': 'STATION^5638',
  'Goodge Street': 'STATION^5459', 'Holborn': 'STATION^5473', 'Chancery Lane': 'STATION^5403',
  'Russell Square': 'STATION^5527', 'Kings Cross St Pancras': 'STATION^5491',
  'Farringdon': 'STATION^5453', 'Barbican': 'STATION^5346', 'Moorgate': 'STATION^5532',
  'Liverpool Street': 'STATION^5203', 'Haggerston': 'STATION^5464', 'Hoxton': 'STATION^5474',
  'Dalston Junction': 'STATION^5425', 'Highbury and Islington': 'STATION^5470',
  'Nine Elms': 'STATION^5261', 'Battersea Power Station': 'STATION^5352',
  'Lambeth North': 'STATION^5493', 'Embankment': 'STATION^5448', 'Temple': 'STATION^5572',
  'Blackfriars': 'STATION^5370', 'Tower Hill': 'STATION^5581', 'Monument': 'STATION^5531',
  'Cannon Street': 'STATION^5397', 'St Pauls': 'STATION^5561', 'Covent Garden': 'STATION^5420',
  'Leicester Square': 'STATION^5496', 'Piccadilly Circus': 'STATION^5503',
  'Charing Cross': 'STATION^5404', 'Lancaster Gate': 'STATION^5494', 'Marble Arch': 'STATION^5519',
  'Waterloo': 'STATION^5230', 'Stratford': 'STATION^5564', 'Hackney Central': 'STATION^5463',
  'Islington': 'REGION^87012'
};

function getRightmoveUrl(areaName, searchType, maxPrice, beds) {
  var id = RIGHTMOVE_IDS[areaName];
  if (!id) return null;
  var base = 'https://www.rightmove.co.uk/property-' + searchType + '/find.html';
  var params = '?locationIdentifier=' + id + '&radius=0.5';
  if (beds && beds !== 'any') params += '&minBedrooms=' + beds + '&maxBedrooms=' + beds;
  if (maxPrice && maxPrice !== 'any') params += '&maxPrice=' + maxPrice;
  params += '&sortType=6'; // most recent first
  return base + params;
}

function getZooplaUrl(areaName, searchType, maxPrice, beds) {
  // Zoopla uses outward postcode or area slug — we use area name as fallback
  var slug = areaName.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
  var type = searchType === 'rent' ? 'to-rent' : 'for-sale';
  var base = 'https://www.zoopla.co.uk/' + type + '/property/london/' + slug + '/';
  var params = '?q=' + encodeURIComponent(areaName + ', London') + '&search_source=refine';
  if (beds && beds !== 'any') params += '&beds_min=' + beds + '&beds_max=' + beds;
  if (maxPrice && maxPrice !== 'any') params += (searchType === 'rent' ? '&price_max=' + maxPrice : '&price_max=' + maxPrice);
  return base + params;
}

// ── Load data then initialise ─────────────────────────────────

/**
 * loadData()
 * Fetches stations.json and journey-times.json in parallel,
 * then calls initMap() once both are ready.
 *
 * WHY JSON FILES?  Keeping data separate means we can update
 * journey times or add stations without touching any JS code.
 */
function loadData() {
  Promise.all([
    fetch('data/stations.json').then(function(r) { return r.json(); }),
    fetch('data/journey-times.json').then(function(r) { return r.json(); })
  ])
  .then(function(results) {
    AREAS = results[0];
    JOURNEY_TIMES = results[1];
    initMap();
  })
  .catch(function(err) {
    console.error('[NestFinder] Failed to load data files:', err);
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#C0392B">' +
      '<h2>⚠️ Could not load map data</h2>' +
      '<p style="margin-top:12px">Make sure you are running this from a web server ' +
      '(not by double-clicking the file). See the README for instructions.</p></div>';
  });
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
    thirdspace: L.layerGroup().addTo(map)
  };

  gymLayers = {
    p1: L.layerGroup().addTo(map),
    p2: L.layerGroup().addTo(map)
  };

  map.on('zoomend', updateCircleRadii);

  // Apply the stored profile to the UI
  applyProfile();

  // Build gym pickers on setup overlay
  if (document.getElementById('gym-picker-p1')) {
    buildGymPicker('gym-picker-p1', 'p1');
    buildGymPicker('gym-picker-p2', 'p2');
  }

  // Load any stored veto data
  try {
    var storedVetoes = localStorage.getItem((cfg.storagePrefix || 'nf_') + 'vetoes');
    if (storedVetoes) vetoedAreas = JSON.parse(storedVetoes);
    var storedHide = localStorage.getItem((cfg.storagePrefix || 'nf_') + 'hideVetoed');
    if (storedHide) hideVetoed = storedHide === 'true';
  } catch(e) {}

  rebuildTop5();
}

// ── Circle radius — scales with zoom ─────────────────────────
function getRadiusForZoom(z) {
  return 550 * Math.pow(2, 11 - z);
}
function updateCircleRadii() {
  var r = getRadiusForZoom(map.getZoom());
  zoomCircles.forEach(function(c) { c.setRadius(r); });
}

// ── Apply stored profile to all UI elements ───────────────────
function applyProfile() {
  var profile = window.ProfileManager && ProfileManager.get();
  if (!profile) return;

  var p1 = profile.p1, p2 = profile.p2;

  // Header
  var logoEl = document.getElementById('app-logo');
  if (logoEl) logoEl.innerHTML = 'nest<span>.</span>finder &nbsp;·&nbsp; ' + p1.name + ' &amp; ' + p2.name + '\'s Hunt';

  // Person cards
  setEl('card-p1-name', p1.name);
  setEl('card-p1-work', '📍 ' + p1.workLabel + ' (+' + p1.offWalk + ' min walk to office)');
  setEl('card-p2-name', p2.name);
  setEl('card-p2-work', '📍 ' + p2.workLabel + ' (+' + p2.offWalk + ' min walk to office)');

  // Labels
  setEl('lbl-p1-max',  p1.name + ' max door-to-door');
  setEl('lbl-p2-max',  p2.name + ' max door-to-door');
  setEl('lbl-p1-walk', p1.name + ' walk home→station');
  setEl('lbl-p2-walk', p2.name + ' walk home→station');

  // Rating section titles
  setEl('p1-rating-title', '🔵 ' + p1.name + '\'s Rating');
  setEl('p2-rating-title', '🩷 ' + p2.name + '\'s Rating');
  setEl('p1-comment-placeholder', p1.name + '\'s thoughts...');
  setEl('p2-comment-placeholder', p2.name + '\'s thoughts...');

  var c1 = document.getElementById('p1-comment');
  if (c1) c1.placeholder = p1.name + '\'s thoughts on this area...';
  var c2 = document.getElementById('p2-comment');
  if (c2) c2.placeholder = p2.name + '\'s thoughts on this area...';

  buildGymToggles();
}

function setEl(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ── Compute overlap zones ─────────────────────────────────────
function computeZones() {
  var profile = ProfileManager.get();
  if (!profile) { alert('Please complete setup first.'); return; }

  var p1Max  = parseInt(document.getElementById('p1-max').value);
  var p2Max  = parseInt(document.getElementById('p2-max').value);
  var p1Walk = parseInt(document.getElementById('p1-walk').value);
  var p2Walk = parseInt(document.getElementById('p2-walk').value);

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

    var t1 = jt[p1Key] + p1Walk;
    var t2 = jt[p2Key] + p2Walk;
    var inP1 = t1 <= p1Max;
    var inP2 = t2 <= p2Max;
    // Green-only mode: only show areas reachable by BOTH people
    if (!inP1 || !inP2) return;

    // Veto filter
    if (hideVetoed && isVetoed(area.name)) return;

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
    if (both) {
      ideal++;
      greenAreas.push({ area: area, t1: t1, t2: t2 });
    }
    reach++;

    var ranked   = top5Cache[area.name];
    var rank     = ranked ? ranked.rank : null;
    var isTop    = rank && both;
    var color       = isTop ? '#f59e0b' : '#84cc16';
    var borderColor = isTop ? '#d97706' : '#65a30d';
    var vetoed = isVetoed(area.name);
    var safeN  = area.name.replace(/'/g, "\\'");
    var isGuest = currentUser === 'guest';

    var neverBtn =
      '<div style="margin-top:8px;border-top:1px solid #f1f5f9;padding-top:8px;display:flex;gap:6px;">' +
        '<button ' + (isGuest ? 'disabled title="Log in to veto areas"' : '') +
          ' onclick="popupVeto(\'' + safeN + '\')" ' +
          'style="flex:1;padding:6px 4px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:' +
          (isGuest ? 'not-allowed' : 'pointer') + ';font-family:inherit;opacity:' +
          (isGuest ? '0.4' : '1') + ';background:' +
          (vetoed ? '#fee2e2' : '#f3f4f6') + ';color:' +
          (vetoed ? '#b91c1c' : '#6b7280') + '">' +
          (vetoed ? '✓ Vetoed — undo' : '🚫 Never live here') + '</button>' +
        '<button onclick="closePopupOpenArea(\'' + safeN + '\',' + t1 + ',' + t2 + ',' + both + ')" ' +
          'style="flex:1;padding:6px 4px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;background:#1a1f36;color:#a3e635">' +
          (isGuest ? 'View →' : 'Score →') + '</button>' +
      '</div>';

    var circle = L.circle([area.lat, area.lng], {
      renderer:    renderer,
      radius:      r,
      fillColor:   color,
      color:       (both || isTop) ? borderColor : 'transparent',
      weight:      (both || isTop) ? 2 : 0,
      fillOpacity: isTop ? 0.75 : both ? 0.45 : 0.32
    }).bindPopup(
      '<b style="color:' + (isTop ? '#d97706' : both ? '#16a34a' : color) + '">' +
        (isTop ? (rank === 1 ? '👑' : rank + ' ') : '') +
        (both && !isTop ? '★ ' : '') + area.name +
      '</b>' +
      (isTop
        ? '<div style="font-size:11px;color:#d97706;font-weight:700;margin:1px 0 5px">Rank #' + rank + ' — Combined score ' + ranked.total + '/20</div>'
        : '<div style="font-size:11px;color:#6b7280;margin:2px 0 6px">' + (both ? 'Ideal for both' : 'Reachable by one') + '</div>') +
      '<div style="font-size:12px;margin-bottom:2px">🔵 ' + profile.p1.name + ': <b>' + t1 + ' min total</b> (' + jt[p1Key] + '+' + p1Walk + ' walk)</div>' +
      '<div style="font-size:12px">🩷 ' + profile.p2.name + ': <b>' + t2 + ' min total</b> (' + jt[p2Key] + '+' + p2Walk + ' walk)</div>' +
      neverBtn,
      { minWidth: 200 }
    ).addTo(layers.commute);

    circle.on('click', function() {
      circle.openPopup();
      openAreaInfo(area, t1, t2, both);
    });

    if (isTop) {
      var label    = rank === 1 ? '👑' : (rank + '');
      var rankIcon = L.divIcon({
        html: '<div style="background:#d97706;color:#fff;border:2px solid #fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:' + (rank === 1 ? '12' : '11') + 'px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.4);pointer-events:none">' + label + '</div>',
        className: '', iconSize: [22, 22], iconAnchor: [11, 11]
      });
      L.marker([area.lat, area.lng], { icon: rankIcon, interactive: false }).addTo(layers.commute);
    }

    zoomCircles.push(circle);
  });

  // Work location markers
  var destinations = window.DESTINATIONS || [];
  function mkIcon(lbl, col) {
    return L.divIcon({
      html: '<div style="background:' + col + ';width:32px;height:32px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:9px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">' + lbl + '</div>',
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
  if (p1Station) L.marker([p1Station.lat, p1Station.lng], { icon: mkIcon(profile.p1.name.substring(0,3).toUpperCase(), '#C8722A') }).bindPopup('<b>' + profile.p1.workLabel + '</b><br>' + profile.p1.name + '\'s workplace').addTo(layers.markers);
  if (p2Station) L.marker([p2Station.lat, p2Station.lng], { icon: mkIcon(profile.p2.name.substring(0,3).toUpperCase(), '#C8722A') }).bindPopup('<b>' + profile.p2.workLabel + '</b><br>' + profile.p2.name + '\'s workplace').addTo(layers.markers);

  document.getElementById('stat-ideal').textContent     = ideal;
  document.getElementById('stat-reachable').textContent = reach;
  document.getElementById('results-section').style.display = 'block';
  document.getElementById('header-status').textContent  = ideal + ' ideal areas found';
  document.getElementById('clear-btn').style.display    = 'block';
  document.getElementById('data-note').textContent      = ideal + ' areas work for both within your limits. Tap any bubble to explore.';
}

function clearResults() {
  layers.commute.clearLayers();
  layers.markers.clearLayers();
  zoomCircles = [];
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('clear-btn').style.display = 'none';
  document.getElementById('header-status').textContent = 'Find your overlap zone';
}

// ── Popup button handlers (global for inline onclick) ────────
function popupVeto(areaName) {
  toggleVeto(areaName, !isVetoed(areaName));
  map.closePopup();
}
function closePopupOpenArea(areaName, t1, t2, both) {
  map.closePopup();
  var area = AREAS.find(function(a) { return a.name === areaName; });
  if (area) openAreaInfo(area, t1, t2, both);
}
window.popupVeto         = popupVeto;
window.closePopupOpenArea = closePopupOpenArea;

// ── Area info panel ───────────────────────────────────────────
function openAreaInfo(area, t1, t2, both) {
  currentArea = area.name;
  p1Score = 0; p2Score = 0;

  switchTab('area');

  document.getElementById('area-placeholder').style.display = 'none';
  document.getElementById('area-detail').style.display = 'block';
  document.getElementById('ai-area-name').textContent  = (both ? '★ ' : '') + area.name;
  document.getElementById('ai-area-badge').textContent = both ? 'Ideal for both' : 'Reachable by one';

  var profile = ProfileManager.get();
  var w1 = parseInt(document.getElementById('p1-walk').value) || 0;
  var w2 = parseInt(document.getElementById('p2-walk').value) || 0;
  document.getElementById('ai-area-commute1').textContent = '🔵 ' + profile.p1.name + ' → ' + profile.p1.workLabel + ': ' + t1 + ' min (' + (t1 - w1) + ' train + ' + w1 + ' walk)';
  document.getElementById('ai-area-commute2').textContent = '🩷 ' + profile.p2.name + ' → ' + profile.p2.workLabel + ': ' + t2 + ' min (' + (t2 - w2) + ' train + ' + w2 + ' walk)';

  renderAgents(area.name);
  renderThirdSpace(area.lat, area.lng);
  renderCouncilTax(area.name);
  renderPropertyLinks(area.name);

  var saved = getSaved(area.name);
  p1Score = saved.p1Score || 0;
  p2Score = saved.p2Score || 0;
  renderScoreButtons('p1-scores', 'p1', p1Score);
  renderScoreButtons('p2-scores', 'p2', p2Score);

  var c1 = document.getElementById('p1-comment');
  var c2 = document.getElementById('p2-comment');
  if (c1) c1.value = saved.p1Comment || '';
  if (c2) c2.value = saved.p2Comment || '';
  document.getElementById('save-confirm').style.display = 'none';

  var isGuest = currentUser === 'guest';
  var guestBanner = document.getElementById('guest-banner');
  if (guestBanner) guestBanner.style.display = isGuest ? 'block' : 'none';
  var saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.style.display = isGuest ? 'none' : 'block';
  if (c1) { c1.disabled = isGuest; c1.style.opacity = isGuest ? '0.5' : '1'; }
  if (c2) { c2.disabled = isGuest; c2.style.opacity = isGuest ? '0.5' : '1'; }

  renderBills(area.name);

  // AI-powered lifestyle sections — each fetches independently
  setLoadingState('ai-lifestyle-content', area.name);
  setLoadingState('ai-datenight-content', '');
  setLoadingState('ai-crime-content', '');
  setLoadingState('ai-noise-content', '');
  document.getElementById('ai-parks').innerHTML = '';

  fetchLifestyle(area.name);
  fetchDateNight(area.name);
  fetchCrime(area.name);
  fetchNoise(area.name);
  fetchEV(area.lat, area.lng);
}

function setLoadingState(id, areaName) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = '<div class="lifestyle-loading">••• ' + (areaName ? 'Loading ' + areaName + '...' : 'Loading...') + '</div>';
}


// ── Council Tax display ───────────────────────────────────────
function renderCouncilTax(areaName) {
  var el = document.getElementById('ai-council-tax');
  if (!el) return;
  var ct = getCouncilTax(areaName);
  if (!ct) { el.innerHTML = '<div class="lifestyle-loading">Borough not mapped.</div>'; return; }
  var monthly = Math.round(ct.data.annual / 12);
  var rankClass = ct.data.rank <= 10 ? 'ct-cheap' : ct.data.rank <= 20 ? 'ct-mid' : 'ct-expensive';
  el.innerHTML = '<div class="ct-row ' + rankClass + '">' +
    '<span class="ct-borough">' + ct.borough + '</span>' +
    '<span class="ct-amount">Band D: £' + monthly + '/mo (£' + ct.data.annual.toLocaleString() + '/yr)</span>' +
    '<span class="ct-rank">Ranked <b>#' + ct.data.rank + '</b> cheapest of 33 London boroughs</span>' +
    '</div>';
}

// ── Property search links ─────────────────────────────────────
function renderPropertyLinks(areaName) {
  var el = document.getElementById('ai-property-links');
  if (!el) return;
  var rmUrl  = getRightmoveUrl(areaName, propertySearch.type, propertySearch.maxPrice, propertySearch.beds);
  var zUrl   = getZooplaUrl(areaName, propertySearch.type, propertySearch.maxPrice, propertySearch.beds);
  if (!rmUrl) {
    el.innerHTML = '<div class="lifestyle-loading">No Rightmove ID for this area yet.</div>';
    return;
  }
  el.innerHTML =
    '<a class="property-link rm-link" href="' + rmUrl + '" target="_blank" rel="noopener">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>' +
    ' Search Rightmove</a>' +
    '<a class="property-link zo-link" href="' + zUrl + '" target="_blank" rel="noopener">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>' +
    ' Search Zoopla</a>';
}

// Called when any property filter changes — refreshes links for currently open area
function updatePropertySearch(field, value) {
  propertySearch[field] = value;
  if (currentArea) {
    renderPropertyLinks(currentArea);
  }
}
window.updatePropertySearch = updatePropertySearch;

// ── Estate agents ─────────────────────────────────────────────
function renderAgents(areaName) {
  var agents = window.AGENTS ? (AGENTS[areaName] || []) : [];
  if (!agents.length && window.AGENTS) {
    var lower = areaName.toLowerCase();
    Object.keys(AGENTS).forEach(function(key) {
      if (!agents.length) {
        var lk = key.toLowerCase();
        if (lower.indexOf(lk) !== -1 || lk.indexOf(lower) !== -1) {
          agents = AGENTS[key];
        }
      }
    });
  }
  document.getElementById('ai-agents').innerHTML = agents.length
    ? agents.map(function(a) { return '<a class="agent-link" href="' + a.u + '" target="_blank">' + a.n + '</a>'; }).join('')
    : '<div class="lifestyle-loading">No agents listed for this area.</div>';
}

// ── Third Space ───────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  var R = 3958.8; // miles
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestThirdSpace(lat, lng) {
  var locs = GYM_BRANDS.thirdspace.locations;
  var best = locs[0], bestDist = Infinity;
  locs.forEach(function(ts) {
    var d = haversine(lat, lng, ts.lat, ts.lng);
    if (d < bestDist) { bestDist = d; best = ts; }
  });
  return { gym: best, miles: bestDist };
}

function renderThirdSpace(lat, lng) {
  var ts = nearestThirdSpace(lat, lng);
  var miles = ts.miles.toFixed(1);
  var cls = ts.miles <= 1.5 ? 'ts-nearby' : 'ts-far';
  var icon = ts.miles <= 1.5 ? '🏋️' : '📍';
  document.getElementById('ai-thirdspace').innerHTML =
    '<div class="' + cls + '">' + icon + ' Nearest Third Space: <b>' + ts.gym.name.replace('Third Space ', '') + '</b> (' + miles + ' miles)</div>';
}

// ── Score buttons ─────────────────────────────────────────────
function renderScoreButtons(containerId, person, selected) {
  var html = '';
  for (var i = 1; i <= 10; i++) {
    var cls = 'score-btn' + (selected === i ? ' active-' + person : '');
    html += '<button class="' + cls + '" onclick="setScore(\'' + person + '\',' + i + ')">' + i + '</button>';
  }
  document.getElementById(containerId).innerHTML = html;
}
function setScore(person, val) {
  if (currentUser === 'guest') return;
  if (person === 'p1') { p1Score = val; renderScoreButtons('p1-scores', 'p1', val); }
  else                 { p2Score = val; renderScoreButtons('p2-scores', 'p2', val); }
}
window.setScore = setScore;

// ── Save / load ratings ───────────────────────────────────────
function getSaved(name) {
  var key = 'area_' + name.replace(/[^a-zA-Z0-9]/g, '_');
  if (ratingsCache[key]) return ratingsCache[key];
  try { return JSON.parse(localStorage.getItem('area_' + name)) || {}; } catch(e) { return {}; }
}

function saveRatings() {
  if (!currentArea || currentUser === 'guest') return;
  var key     = 'area_' + currentArea.replace(/[^a-zA-Z0-9]/g, '_');
  var existing = getSaved(currentArea);
  var data     = Object.assign({}, existing);

  if (currentUser === 'p1') {
    data.p1Score   = p1Score;
    data.p1Comment = document.getElementById('p1-comment').value;
  } else if (currentUser === 'p2') {
    data.p2Score   = p2Score;
    data.p2Comment = document.getElementById('p2-comment').value;
  }

  ratingsCache[key] = data;

  if (db) {
    db.ref('ratings/' + key).set(data);
  } else {
    try { localStorage.setItem('area_' + currentArea, JSON.stringify(data)); } catch(e) {}
  }

  if (document.getElementById('results-section').style.display !== 'none') {
    rebuildTop5(); computeZones();
  }
  document.getElementById('save-confirm').style.display = 'block';
  setTimeout(function() { document.getElementById('save-confirm').style.display = 'none'; }, 2000);
}
window.saveRatings = saveRatings;

// ── Top-5 cache ───────────────────────────────────────────────
function rebuildTop5() {
  var allRated = [];
  AREAS.forEach(function(a) {
    var saved = getSaved(a.name);
    var total = (saved.p1Score || 0) + (saved.p2Score || 0);
    if (total > 0) allRated.push({ name: a.name, total: total });
  });
  allRated.sort(function(a, b) { return b.total - a.total; });
  top5Cache = {};
  allRated.slice(0, 5).forEach(function(r, i) { top5Cache[r.name] = { rank: i + 1, total: r.total }; });
}

// ── Veto logic ────────────────────────────────────────────────
function isVetoed(name) {
  return !!vetoedAreas['veto_' + name.replace(/[^a-zA-Z0-9]/g, '_')];
}
function toggleVeto(name, checked) {
  if (currentUser === 'guest') return;
  var key = 'veto_' + name.replace(/[^a-zA-Z0-9]/g, '_');
  if (checked) vetoedAreas[key] = true; else delete vetoedAreas[key];
  if (db) {
    db.ref('vetoes/' + key).set(checked ? true : null);
  } else {
    try { localStorage.setItem((APP_CONFIG.storagePrefix || 'nf_') + 'vetoes', JSON.stringify(vetoedAreas)); } catch(e) {}
  }
  if (document.getElementById('results-section').style.display !== 'none') {
    rebuildTop5(); computeZones();
  }
  renderTable();
}
window.toggleVeto = toggleVeto;

function toggleVetoFilter() {
  hideVetoed = !hideVetoed;
  try { localStorage.setItem((APP_CONFIG.storagePrefix || 'nf_') + 'hideVetoed', hideVetoed ? 'true' : 'false'); } catch(e) {}
  if (document.getElementById('results-section').style.display !== 'none') { rebuildTop5(); computeZones(); }
  renderTable();
}
window.toggleVetoFilter = toggleVetoFilter;

// ── Tab switching ─────────────────────────────────────────────
var sidebarOpen = true;

function switchTab(t) {
  ['search', 'area', 'table', 'results'].forEach(function(n) {
    document.getElementById('tab-' + n).className = 'tab' + (n === t ? ' active' : '');
    document.getElementById('content-' + n).className = 'tab-content' + (n === t ? ' active' : '');
  });
  if (t === 'results') renderResults();
  if (t === 'table')   renderTable();
}
window.switchTab = switchTab;

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('collapsed', !sidebarOpen);
  var btn = document.getElementById('toggle-btn');
  btn.innerHTML = sidebarOpen ? '&#8249;' : '&#8250;';
  btn.classList.toggle('collapsed', !sidebarOpen);
}
window.toggleSidebar = toggleSidebar;

// ── Results dashboard ─────────────────────────────────────────
function renderResults() {
  var profile = ProfileManager.get() || { p1: { name: 'Person 1' }, p2: { name: 'Person 2' } };
  var rated   = [];
  AREAS.forEach(function(a) {
    var saved = getSaved(a.name);
    if (saved.p1Score || saved.p2Score) {
      rated.push({
        name: a.name,
        p1Score: saved.p1Score || 0,
        p2Score: saved.p2Score || 0,
        p1Comment: saved.p1Comment || '',
        p2Comment: saved.p2Comment || '',
        total: (saved.p1Score || 0) + (saved.p2Score || 0)
      });
    }
  });
  rated.sort(function(a, b) { return b.total - a.total; });
  var el = document.getElementById('results-list');
  if (!rated.length) {
    el.innerHTML = '<div class="results-empty"><div style="font-size:32px;margin-bottom:10px">🏆</div><div style="font-size:13px">No areas rated yet.<br>Click a bubble on the map to start scoring.</div></div>';
    return;
  }
  var clsMap = ['top1', 'top2', 'top3'];
  el.innerHTML = rated.map(function(r, i) {
    var comment = r.p1Comment || r.p2Comment || '';
    return '<div class="result-card ' + (i < 3 ? clsMap[i] : '') + '" onclick="jumpToArea(\'' + r.name.replace(/'/g, "\\'") + '\')">' +
      '<div class="result-header">' +
        '<div class="result-name">' + (i === 0 ? '★ ' : '') + r.name + '<span class="rank-badge">#' + (i + 1) + '</span></div>' +
        '<div class="result-total" style="color:' + (i === 0 ? '#16a34a' : i === 1 ? '#d97706' : '#ea580c') + '">' + r.total + '/20</div>' +
      '</div>' +
      '<div class="result-scores">' +
        '<span>🔵 ' + profile.p1.name + ': <b>' + r.p1Score + '/10</b></span>' +
        '<span>🩷 ' + profile.p2.name + ': <b>' + r.p2Score + '/10</b></span>' +
      '</div>' +
      (comment ? '<div class="result-comment">"' + comment.substring(0, 60) + (comment.length > 60 ? '...' : '') + '"</div>' : '') +
    '</div>';
  }).join('');
}

// ── All Areas table ───────────────────────────────────────────
function renderTable() {
  var el = document.getElementById('areas-table-inner');
  var countEl = document.getElementById('table-count');
  var btn = document.getElementById('veto-toggle-btn');
  if (btn) {
    btn.className = 'veto-btn ' + (hideVetoed ? 'hiding' : 'showing');
    btn.textContent = hideVetoed ? '🚫 Hiding vetoed' : '👁 Showing all';
  }
  if (!greenAreas.length) {
    el.innerHTML = '<div class="areas-table-empty">🔍 Run a search first to see all ideal areas here.</div>';
    if (countEl) countEl.textContent = 'Run a search to see areas';
    return;
  }
  var profile = ProfileManager.get() || { p1: { name: 'P1' }, p2: { name: 'P2' } };
  var sorted    = greenAreas.slice().sort(function(a, b) { return a.area.name.localeCompare(b.area.name); });
  var vetoCount = sorted.filter(function(i) { return isVetoed(i.area.name); }).length;
  var displayed = hideVetoed ? sorted.filter(function(i) { return !isVetoed(i.area.name); }) : sorted;
  if (countEl) countEl.textContent = displayed.length + ' ideal areas' + (vetoCount > 0 ? ' · ' + vetoCount + ' vetoed' : '');

  el.innerHTML = '<table class="areas-table">' +
    '<thead><tr>' +
      '<th>Area</th>' +
      '<th style="text-align:center">🔵 ' + profile.p1.name + '</th>' +
      '<th style="text-align:center">🩷 ' + profile.p2.name + '</th>' +
      '<th style="text-align:center">Rated</th>' +
      '<th style="text-align:center">Never</th>' +
    '</tr></thead>' +
    '<tbody>' +
    displayed.map(function(item) {
      var vetoed = isVetoed(item.area.name);
      var saved  = getSaved(item.area.name);
      var rated  = saved.p1Score || saved.p2Score;
      var ratedHtml = rated
        ? '<span style="font-size:11px;font-weight:700;color:#16a34a">★ ' + (saved.p1Score || 0) + '+' + (saved.p2Score || 0) + '</span>'
        : '<span style="color:#d1d5db;font-size:11px">—</span>';
      var safeName = item.area.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return '<tr class="' + (vetoed ? 'veto-row' : '') + '">' +
        '<td onclick="jumpToArea(\'' + safeName + '\')" style="cursor:pointer"><span class="area-name-cell">' + item.area.name + '</span></td>' +
        '<td style="text-align:center;cursor:pointer" onclick="jumpToArea(\'' + safeName + '\')">' + item.t1 + 'm</td>' +
        '<td style="text-align:center;cursor:pointer" onclick="jumpToArea(\'' + safeName + '\')">' + item.t2 + 'm</td>' +
        '<td style="text-align:center;cursor:pointer" onclick="jumpToArea(\'' + safeName + '\')">' + ratedHtml + '</td>' +
        '<td class="veto-cell"><input type="checkbox" class="veto-check" ' +
          (vetoed ? 'checked' : '') + ' ' +
          (currentUser === 'guest' ? 'disabled' : '') +
          ' onchange="toggleVeto(\'' + safeName + '\',this.checked)"></td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>';
}

function jumpToArea(name) {
  var area = AREAS.find(function(a) { return a.name === name; });
  if (!area) return;
  map.panTo([area.lat, area.lng]);
  var jt = JOURNEY_TIMES[name];
  if (jt) {
    var profile = ProfileManager.get();
    var p1Walk = parseInt(document.getElementById('p1-walk').value) || 0;
    var p2Walk = parseInt(document.getElementById('p2-walk').value) || 0;
    var t1 = jt[profile.p1.workId] + p1Walk;
    var t2 = jt[profile.p2.workId] + p2Walk;
    var p1Max = parseInt(document.getElementById('p1-max').value);
    var p2Max = parseInt(document.getElementById('p2-max').value);
    openAreaInfo(area, t1, t2, t1 <= p1Max && t2 <= p2Max);
  } else {
    switchTab('search');
  }
}
window.jumpToArea = jumpToArea;

// ── Bills ─────────────────────────────────────────────────────
function renderBills(areaName) {
  var bills = window.BILLS_DATA ? BILLS_DATA[areaName] : null;
  var container = document.getElementById('ai-bills');
  if (!bills) {
    container.innerHTML = '<div class="lifestyle-loading">No bills data for this area yet.</div>';
    return;
  }
  container.innerHTML =
    '<div class="bills-card">' +
      '<div class="bills-card-title">Monthly Estimates</div>' +
      (bills.councilTax ? '<div class="bills-row"><span class="bills-label">Council Tax (Band D)</span><span class="bills-value">£' + bills.councilTax + '/mo</span></div>' : '') +
      (bills.broadband  ? '<div class="bills-row"><span class="bills-label">Broadband (avg)</span><span class="bills-value">£' + bills.broadband + '/mo</span></div>' : '') +
    '</div>';
}

// ── Gym toggles (search tab) ──────────────────────────────────
function buildGymToggles() {
  var profile = ProfileManager.get();
  if (!profile) return;
  var p1gym = profile.p1.gym, p2gym = profile.p2.gym;
  var section = document.getElementById('gym-toggle-section');
  if (!section) return;
  if (!p1gym && !p2gym) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  var html = '';
  function makeToggleBtn(gymKey, person, name) {
    var b = GYM_BRANDS[gymKey];
    if (!b) return '';
    var imgHtml = b.logo ? '<img src="' + b.logo + '" alt="' + b.name + '">' : '<span style="font-size:20px">' + b.emoji + '</span>';
    return '<button class="gym-toggle-btn" id="gtog-' + person + '" onclick="toggleGym(\'' + person + '\')">' + imgHtml + '<span class="gym-toggle-name">' + name + '</span></button>';
  }
  if (p1gym) html += makeToggleBtn(p1gym, 'p1', profile.p1.name);
  if (p2gym) html += makeToggleBtn(p2gym, 'p2', profile.p2.name);
  document.getElementById('gym-toggles').innerHTML = html;
}

function toggleGym(which) {
  gymToggles[which] = !gymToggles[which];
  var btn = document.getElementById('gtog-' + which);
  if (btn) btn.classList.toggle('active', gymToggles[which]);
  renderGymMarkers();
}
window.toggleGym = toggleGym;

function renderGymMarkers() {
  gymLayers.p1.clearLayers();
  gymLayers.p2.clearLayers();
  var profile = ProfileManager.get();
  if (!profile) return;

  function plotGyms(gymKey, layer) {
    var brand = GYM_BRANDS[gymKey];
    if (!brand) return;
    var iconHtml = brand.logo
      ? '<div class="gym-marker" style="background:#fff;border:2px solid ' + brand.color + '"><img src="' + brand.logo + '"></div>'
      : '<div class="ts-marker">' + brand.emoji + '</div>';
    var icon = L.divIcon({ html: iconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
    brand.locations.forEach(function(loc) {
      L.marker([loc.lat, loc.lng], { icon: icon })
        .bindPopup('<b style="font-size:12px">' + loc.name + '</b>')
        .addTo(layer);
    });
  }

  if (gymToggles.p1 && profile.p1.gym) plotGyms(profile.p1.gym, gymLayers.p1);
  if (gymToggles.p2 && profile.p2.gym) plotGyms(profile.p2.gym, gymLayers.p2);
}

// ── Gym picker (setup overlay) ────────────────────────────────
var setupGym = { p1: null, p2: null };

function buildGymPicker(containerId, person) {
  var brands = ['virginactive', 'onerebe', 'f45', 'thirdspace', 'psycle'];
  var html = '';
  brands.forEach(function(key) {
    var b = GYM_BRANDS[key];
    var imgHtml = b.logo ? '<img src="' + b.logo + '" alt="' + b.name + '">' : '<span style="font-size:20px;line-height:1">' + b.emoji + '</span>';
    var shortName = key === 'thirdspace' ? 'Third Space' : key === 'virginactive' ? 'Virgin' : key === 'onerebe' ? '1Rebel' : key === 'psycle' ? 'Psycle' : b.name.split(' ')[0];
    html += '<button class="gym-pick-btn" onclick="selectGym(\'' + person + '\',\'' + key + '\',this)" data-gym="' + key + '">' + imgHtml + '<span>' + shortName + '</span></button>';
  });
  html += '<button class="gym-pick-btn none-btn" onclick="selectGym(\'' + person + '\',null,this)" data-gym="none">None</button>';
  document.getElementById(containerId).innerHTML = html;
}
window.buildGymPicker = buildGymPicker;

function selectGym(person, gymKey, btn) {
  setupGym[person] = gymKey;
  var container = btn.parentElement;
  container.querySelectorAll('.gym-pick-btn').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
}
window.selectGym = selectGym;

// ── Setup overlay ─────────────────────────────────────────────
function openSetup() {
  var profile = ProfileManager.get();
  if (profile) {
    document.getElementById('s-p1-name').value    = profile.p1.name;
    document.getElementById('s-p1-work').value    = profile.p1.workId;
    document.getElementById('s-p1-offwalk').value = profile.p1.offWalk;
    document.getElementById('s-p2-name').value    = profile.p2.name;
    document.getElementById('s-p2-work').value    = profile.p2.workId;
    document.getElementById('s-p2-offwalk').value = profile.p2.offWalk;
    setupGym.p1 = profile.p1.gym;
    setupGym.p2 = profile.p2.gym;
    ['p1', 'p2'].forEach(function(p) {
      var g = setupGym[p];
      var sel = g ? '[data-gym="' + g + '"]' : '[data-gym="none"]';
      var btn = document.querySelector('#gym-picker-' + p + ' ' + sel);
      if (btn) btn.classList.add('selected');
    });
  }
  document.getElementById('setup-overlay').style.display = 'flex';
}
window.openSetup = openSetup;

function saveSetup() {
  var p1name   = document.getElementById('s-p1-name').value.trim();
  var p1workId = document.getElementById('s-p1-work').value;
  var p2name   = document.getElementById('s-p2-name').value.trim();
  var p2workId = document.getElementById('s-p2-work').value;
  var err      = document.getElementById('setup-error');

  if (!p1name || !p1workId || !p2name || !p2workId) {
    err.style.display = 'block'; return;
  }
  err.style.display = 'none';

  // Find the human-readable label for each destination
  var destinations = window.DESTINATIONS || [];
  function findLabel(id) {
    var d = destinations.find(function(x) { return x.id === id; });
    return d ? d.label : id;
  }

  ProfileManager.save({
    p1: { name: p1name, workId: p1workId, workLabel: findLabel(p1workId), offWalk: parseInt(document.getElementById('s-p1-offwalk').value) || 0, gym: setupGym.p1 },
    p2: { name: p2name, workId: p2workId, workLabel: findLabel(p2workId), offWalk: parseInt(document.getElementById('s-p2-offwalk').value) || 0, gym: setupGym.p2 }
  });

  document.getElementById('setup-overlay').style.display = 'none';
  applyProfile();
}
window.saveSetup = saveSetup;

// ── Claude API: lifestyle ─────────────────────────────────────
async function fetchLifestyle(areaName) {
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-iab-ash-pchd': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 300,
        system: 'You are a London local knowledge expert. Respond ONLY with valid JSON, no markdown. Format: {"pubs_bars_restaurants":NUMBER,"coffee_shops":NUMBER,"vibe":"2-3 word description","park_score":NUMBER_1_TO_10,"nearest_park":"park name"}',
        messages: [{ role: 'user', content: 'For ' + areaName + ' in London: estimate pubs/bars/restaurants within 1 mile, coffee shops, describe vibe in 2-3 words, green space score 1-10, nearest park. Return only JSON.' }]
      })
    });
    var data   = await resp.json();
    var text   = data.content && data.content[0] ? data.content[0].text : '';
    var parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    document.getElementById('ai-lifestyle-content').innerHTML =
      '<div class="lifestyle-grid">' +
        '<div class="lifestyle-stat"><div class="lifestyle-num">' + parsed.pubs_bars_restaurants + '</div><div class="lifestyle-lbl">Pubs, Bars &amp; Restaurants</div></div>' +
        '<div class="lifestyle-stat"><div class="lifestyle-num">' + parsed.coffee_shops + '</div><div class="lifestyle-lbl">Coffee Shops</div></div>' +
        '<div class="lifestyle-stat"><div class="lifestyle-num" style="font-size:12px;padding-top:4px">' + parsed.vibe + '</div><div class="lifestyle-lbl">Area Vibe</div></div>' +
      '</div>';
    var ps    = parsed.park_score || 0;
    var pc    = ps >= 7 ? '#16a34a' : ps >= 4 ? '#d97706' : '#dc2626';
    var dots  = '';
    for (var i = 1; i <= 10; i++) dots += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:2px;background:' + (i <= ps ? pc : '#e5e7eb') + '"></span>';
    document.getElementById('ai-parks').innerHTML =
      '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
          '<span style="font-size:12px;font-weight:600;color:#15803d">🌿 Green Space Score</span>' +
          '<span style="font-size:13px;font-weight:700;color:' + pc + '">' + ps + '/10</span>' +
        '</div>' +
        '<div style="margin-bottom:5px;">' + dots + '</div>' +
        '<div style="font-size:11px;color:#6b7280">Nearest: <b style="color:#1f2937">' + (parsed.nearest_park || 'Unknown') + '</b></div>' +
      '</div>';
  } catch(e) {
    document.getElementById('ai-lifestyle-content').innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">Could not load lifestyle data</div>';
  }
}

async function fetchDateNight(areaName) {
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-iab-ash-pchd': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 200,
        system: 'London local knowledge expert. Respond ONLY with valid JSON. Format: {"score":NUMBER_1_TO_10,"reason":"one short sentence"}',
        messages: [{ role: 'user', content: 'Give ' + areaName + ' in London a date night score out of 10 based on restaurants, bars, atmosphere, walkability and evening potential. Return only JSON.' }]
      })
    });
    var data   = await resp.json();
    var parsed = JSON.parse((data.content[0] ? data.content[0].text : '').replace(/```json|```/g, '').trim());
    document.getElementById('ai-datenight-content').innerHTML =
      '<div class="score-display">' +
        '<div class="score-circle datenight">' + parsed.score + '</div>' +
        '<div class="score-detail"><b style="color:#a855f7">' + parsed.score + '/10</b><br>' + parsed.reason + '</div>' +
      '</div>';
  } catch(e) {
    document.getElementById('ai-datenight-content').innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">Could not load data</div>';
  }
}

async function fetchCrime(areaName) {
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-iab-ash-pchd': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 200,
        system: 'London local knowledge expert. Respond ONLY with valid JSON. Format: {"score":NUMBER_1_TO_10,"level":"Low|Moderate|High","summary":"one short sentence"}. Score 1=very safe, 10=very high crime.',
        messages: [{ role: 'user', content: 'Rate the crime level in ' + areaName + ' London on 1-10 (1=very safe, 10=high crime). Return only JSON.' }]
      })
    });
    var data   = await resp.json();
    var parsed = JSON.parse((data.content[0] ? data.content[0].text : '').replace(/```json|```/g, '').trim());
    var s = parsed.score;
    var cls = s <= 4 ? 'crime-low' : s <= 7 ? 'crime-mid' : 'crime-high';
    document.getElementById('ai-crime-content').innerHTML =
      '<div class="score-display">' +
        '<div class="score-circle ' + cls + '">' + s + '</div>' +
        '<div class="score-detail"><b>' + s + '/10 — ' + parsed.level + '</b><br>' + parsed.summary + '</div>' +
      '</div>';
  } catch(e) {
    document.getElementById('ai-crime-content').innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">Could not load data</div>';
  }
}

async function fetchNoise(areaName) {
  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-iab-ash-pchd': 'true' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 200,
        system: 'London local knowledge expert. Respond ONLY with valid JSON. Format: {"score":NUMBER_1_TO_10,"summary":"one short sentence"}. Score 1=very quiet, 10=very noisy/polluted.',
        messages: [{ role: 'user', content: 'Rate noise and pollution in ' + areaName + ' London, 1-10 (1=quiet/clean, 10=noisy/polluted). Consider traffic, flight paths, rail. Return only JSON.' }]
      })
    });
    var data   = await resp.json();
    var parsed = JSON.parse((data.content[0] ? data.content[0].text : '').replace(/```json|```/g, '').trim());
    var s = parsed.score;
    var cls = s <= 4 ? 'noise-low' : s <= 7 ? 'noise-mid' : 'noise-high';
    var lbl = s <= 4 ? 'Low' : s <= 7 ? 'Moderate' : 'High';
    document.getElementById('ai-noise-content').innerHTML =
      '<div class="score-display">' +
        '<div class="score-circle ' + cls + '">' + s + '</div>' +
        '<div class="score-detail"><b>' + s + '/10 — ' + lbl + '</b><br>' + parsed.summary + '</div>' +
      '</div>';
  } catch(e) {
    document.getElementById('ai-noise-content').innerHTML = '<div class="lifestyle-loading" style="color:#f43f8e">Could not load data</div>';
  }
}

async function fetchEV(lat, lng) {
  try {
    var body = '[out:json][timeout:15];node["amenity"="charging_station"](around:1609,' + lat + ',' + lng + ');out body;';
    var resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: body });
    var data = await resp.json();
    var total = 0, bands = { u5: 0, u10: 0, u30: 0, u50: 0 };
    data.elements.forEach(function(el) {
      var tags = el.tags || {};
      var hasType2 = ['socket:type2','socket:type2_combo','socket:iec_62196_t2'].some(function(f) { return tags[f] && tags[f] !== 'no'; });
      var noInfo = !Object.keys(tags).some(function(k) { return k.startsWith('socket:'); });
      if (!hasType2 && !noInfo) return;
      var kw = 0;
      if (tags['socket:type2:output']) kw = parseFloat(tags['socket:type2:output']);
      else if (tags.maxpower) kw = parseFloat(tags.maxpower) / 1000;
      else if (tags.capacity) kw = 7.4;
      var count = Math.min(parseInt(tags['socket:type2'] || tags.capacity || 1) || 1, 10);
      for (var i = 0; i < count; i++) {
        if (kw >= 50) continue;
        total++;
        if (kw < 5) bands.u5++; else if (kw < 10) bands.u10++; else if (kw < 30) bands.u30++; else bands.u50++;
      }
    });
    var quality = total >= 20 ? '#16a34a' : total >= 8 ? '#d97706' : '#9ca3af';
    var breakdown = '';
    if (bands.u5)  breakdown += '<div class="ev-row"><span class="ev-band">&lt;5 kW</span><span class="ev-count">' + bands.u5 + '</span></div>';
    if (bands.u10) breakdown += '<div class="ev-row"><span class="ev-band">&lt;10 kW</span><span class="ev-count">' + bands.u10 + '</span></div>';
    if (bands.u30) breakdown += '<div class="ev-row"><span class="ev-band">&lt;30 kW</span><span class="ev-count">' + bands.u30 + '</span></div>';
    if (bands.u50) breakdown += '<div class="ev-row"><span class="ev-band">&lt;50 kW</span><span class="ev-count">' + bands.u50 + '</span></div>';
    if (!breakdown) breakdown = '<div style="font-size:11px;color:#9ca3af;margin-top:4px">No Type 2 chargers found nearby</div>';
    document.getElementById('ai-ev').innerHTML =
      '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;margin-top:8px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          '<span style="font-size:18px">⚡</span>' +
          '<div><div style="font-size:13px;font-weight:700;color:' + quality + '">' + total + ' EV charger' + (total === 1 ? '' : 's') + ' within 1 mile</div>' +
          '<div style="font-size:11px;color:#6b7280">OpenStreetMap data</div></div>' +
        '</div>' + breakdown +
      '</div>';
  } catch(e) {
    var ev = document.getElementById('ai-ev');
    if (ev) ev.innerHTML = '<div style="font-size:11px;color:#9ca3af;padding:4px 0">⚡ EV data unavailable</div>';
  }
}

// ── Firebase init (called from auth.js when user logs in) ─────
function initFirebase() {
  if (typeof firebase === 'undefined') return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.database();
    // Sync ratings from Firebase into local cache
    db.ref('ratings').on('value', function(snap) {
      if (snap.val()) ratingsCache = snap.val();
    });
    db.ref('vetoes').on('value', function(snap) {
      if (snap.val()) vetoedAreas = snap.val();
    });
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
