// ── Apply stored profile to all UI elements ───────────────────
function applyProfile() {
  var profile = window.ProfileManager && ProfileManager.get();
  if (!profile) return;

  var p1 = profile.p1, p2 = profile.p2;

  // Labels
  setEl('lbl-p1-walk', p1.name + ' walk home→station');
  setEl('lbl-p2-walk', p2.name + ' walk home→station');
  updateJourneySearchUI();

  // Rating label names
  setEl('p1-rating-title', p1.name);
  setEl('p2-rating-title', p2.name);

  // Property type from profile (rent/sale) — drives the price dropdown options
  if (profile.propertyType) {
    propertySearch.type = profile.propertyType;
  }
  if (profile.beds && profile.beds !== 'any') propertySearch.beds = profile.beds;
  if (profile.maxPrice && profile.maxPrice !== 'any') propertySearch.maxPrice = profile.maxPrice;
  updatePropertyPriceDropdown();
  var bedsSelect = document.getElementById('prop-beds');
  if (bedsSelect) bedsSelect.value = propertySearch.beds;
  var priceSelect = document.getElementById('prop-price');
  if (priceSelect) priceSelect.value = propertySearch.maxPrice;

  buildGymToggles();
}

function setEl(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getCommuteMaxLimits() {
  var profile = ProfileManager.get();
  var def = (window.APP_CONFIG && window.APP_CONFIG.commuteDefault) || 30;
  if (!window.NFCommuteSettings) {
    var a = document.getElementById('p1-max');
    var b = document.getElementById('p2-max');
    return {
      p1Max: a ? parseInt(a.value, 10) : def,
      p2Max: b ? parseInt(b.value, 10) : def
    };
  }
  var cm = NFCommuteSettings.resolveCommute(profile);
  if (cm.sharedCommuteLimit) {
    var el = document.getElementById('commute-max-shared');
    var v = el ? parseInt(el.value, 10) : cm.maxCommuteMins;
    if (isNaN(v)) v = cm.maxCommuteMins;
    return { p1Max: v, p2Max: v };
  }
  var e1 = document.getElementById('p1-max');
  var e2 = document.getElementById('p2-max');
  var p1 = e1 ? parseInt(e1.value, 10) : cm.maxCommuteMinsP1;
  var p2 = e2 ? parseInt(e2.value, 10) : cm.maxCommuteMinsP2;
  if (isNaN(p1)) p1 = cm.maxCommuteMinsP1;
  if (isNaN(p2)) p2 = cm.maxCommuteMinsP2;
  return { p1Max: p1, p2Max: p2 };
}

function getWalkKmValues() {
  var profile = ProfileManager.get();
  var def = (window.APP_CONFIG && window.APP_CONFIG.walkDistanceDefault != null) ? window.APP_CONFIG.walkDistanceDefault : 1.5;
  if (!window.NFCommuteSettings) {
    var a = document.getElementById('p1-walk');
    var b = document.getElementById('p2-walk');
    return {
      p1WalkKm: a ? parseFloat(a.value) : def,
      p2WalkKm: b ? parseFloat(b.value) : def
    };
  }
  var wm = NFCommuteSettings.resolveWalk(profile);
  if (wm.sharedWalkLimit) {
    var el = document.getElementById('walk-shared');
    var v = el ? parseFloat(el.value) : wm.walkHomeKm;
    if (isNaN(v)) v = wm.walkHomeKm;
    return { p1WalkKm: v, p2WalkKm: v };
  }
  var e1 = document.getElementById('p1-walk');
  var e2 = document.getElementById('p2-walk');
  var p1 = e1 ? parseFloat(e1.value) : wm.walkHomeKmP1;
  var p2 = e2 ? parseFloat(e2.value) : wm.walkHomeKmP2;
  if (isNaN(p1)) p1 = wm.walkHomeKmP1;
  if (isNaN(p2)) p2 = wm.walkHomeKmP2;
  return { p1WalkKm: p1, p2WalkKm: p2 };
}

function updateJourneySearchUI() {
  var profile = ProfileManager.get();
  if (!profile || !window.NFCommuteSettings) return;
  var cm = NFCommuteSettings.resolveCommute(profile);
  var wm = NFCommuteSettings.resolveWalk(profile);
  var p1 = profile.p1, p2 = profile.p2;

  // Header dropdowns — always visible; set value from profile
  var sel = document.getElementById('commute-max-shared');
  if (sel && sel.options.length) {
    sel.value = String(cm.sharedCommuteLimit ? cm.maxCommuteMins : (cm.maxCommuteMinsP1 || cm.maxCommuteMins));
  }
  var wsel = document.getElementById('walk-shared');
  if (wsel && wsel.options.length) {
    wsel.value = String(wm.sharedWalkLimit ? wm.walkHomeKm : (wm.walkHomeKmP1 || wm.walkHomeKm));
  }

  // Split controls in settings panel — only shown when users have different limits
  var splitWrap = document.getElementById('commute-search-split-wrap');
  var walkSplitW = document.getElementById('walk-search-split-wrap');
  if (splitWrap) {
    splitWrap.style.display = cm.sharedCommuteLimit ? 'none' : 'grid';
    if (!cm.sharedCommuteLimit) {
      var e1 = document.getElementById('p1-max');
      var e2 = document.getElementById('p2-max');
      if (e1 && e1.options.length) e1.value = String(cm.maxCommuteMinsP1);
      if (e2 && e2.options.length) e2.value = String(cm.maxCommuteMinsP2);
    }
  }
  if (walkSplitW) {
    walkSplitW.style.display = wm.sharedWalkLimit ? 'none' : 'grid';
    if (!wm.sharedWalkLimit) {
      var w1 = document.getElementById('p1-walk');
      var w2 = document.getElementById('p2-walk');
      if (w1 && w1.options.length) w1.value = String(wm.walkHomeKmP1);
      if (w2 && w2.options.length) w2.value = String(wm.walkHomeKmP2);
    }
  }

  setEl('lbl-p1-max', p1.name + ' max door-to-door');
  setEl('lbl-p2-max', p2.name + ' max door-to-door');
  setEl('lbl-p1-walk', p1.name + ' walk from home');
  setEl('lbl-p2-walk', p2.name + ' walk from home');
}

function onJourneySearchChange() {
  var profile = ProfileManager.get();
  if (!profile || !window.NFCommuteSettings) return;
  var cm = NFCommuteSettings.resolveCommute(profile);
  if (cm.sharedCommuteLimit) {
    var el = document.getElementById('commute-max-shared');
    if (el) profile.maxCommuteMins = parseInt(el.value, 10);
  } else {
    var e1 = document.getElementById('p1-max');
    var e2 = document.getElementById('p2-max');
    if (e1) profile.maxCommuteMinsP1 = parseInt(e1.value, 10);
    if (e2) profile.maxCommuteMinsP2 = parseInt(e2.value, 10);
  }
  var wm = NFCommuteSettings.resolveWalk(profile);
  if (wm.sharedWalkLimit) {
    var ws = document.getElementById('walk-shared');
    if (ws) {
      profile.walkHomeKm = parseFloat(ws.value);
      profile.sharedWalkLimit = true;
    }
  } else {
    var w1 = document.getElementById('p1-walk');
    var w2 = document.getElementById('p2-walk');
    if (w1) profile.walkHomeKmP1 = parseFloat(w1.value);
    if (w2) profile.walkHomeKmP2 = parseFloat(w2.value);
    profile.sharedWalkLimit = false;
  }
  ProfileManager.save(profile);
  // Sync changes to Firebase so they roam to other devices
  if (typeof AuthManager !== 'undefined' && AuthManager.getUser()) {
    ProfileManager.syncToFirebase(AuthManager.getUser().uid);
  }
  if (typeof updatePropertyPriceDropdown === 'function') updatePropertyPriceDropdown();
}
window.onJourneySearchChange = onJourneySearchChange;
window.onCommuteSearchChange = onJourneySearchChange;
window.updateJourneySearchUI = updateJourneySearchUI;

// ── Popup button handlers (global for inline onclick) ────────
function closePopupOpenArea(areaName, t1, t2, both) {
  map.closePopup();
  var area = AREAS.find(function(a) { return a.name === areaName; });
  if (area) openAreaInfo(area, t1, t2, both);
}
window.closePopupOpenArea = closePopupOpenArea;

// ── Area info panel ───────────────────────────────────────────
function openAreaInfo(area, t1, t2, both) {
  currentArea = area.name;
  p1Score = 0; p2Score = 0;

  switchTab('area');

  rebuildTop5();
  document.getElementById('area-placeholder').style.display = 'none';
  document.getElementById('area-detail').style.display = 'block';

  var nameEl = document.getElementById('ai-area-name');
  nameEl.textContent = area.name;
  var ranked = top5Cache[area.name];
  if (ranked) {
    nameEl.style.color = '#d97706';
    nameEl.style.fontWeight = '700';
  } else {
    nameEl.style.color = '';
    nameEl.style.fontWeight = '';
  }
  var rankEl = document.getElementById('ai-area-rank');
  if (rankEl) {
    var savedForRank = getSaved(area.name);
    var bothRated = (savedForRank.p1Score > 0) && (savedForRank.p2Score > 0);
    if (ranked && bothRated) {
      rankEl.textContent = 'Ranked #' + ranked.rank + ' — Combined score ' + ranked.total + '/20';
      rankEl.style.display = 'block';
    } else {
      rankEl.style.display = 'none';
    }
  }
  document.getElementById('ai-area-badge').textContent = both ? 'Ideal for both' : 'Reachable by one';

  renderCouncilTax(area.name);
  renderPropertyLinks(area.name);

  // Reset AI sections to loading state, then fetch fresh data
  var aiSections = ['ai-transport','ai-lifestyle-content','ai-highstreet'];
  aiSections.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="lifestyle-loading">Loading…</div>';
  });
  if (typeof fetchTransport   === 'function') fetchTransport(area.name);
  if (typeof fetchLifestyle   === 'function') fetchLifestyle(area.name);
  if (typeof fetchHighStreet  === 'function') fetchHighStreet(area.name);

  var saved = getSaved(area.name);
  p1Score = saved.p1Score || 0;
  p2Score = saved.p2Score || 0;
  renderScoreButtons('p1-scores', 'p1', p1Score);
  renderScoreButtons('p2-scores', 'p2', p2Score);

  document.getElementById('save-confirm').style.display = 'none';

  var isGuest = !(typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn && AuthManager.isLoggedIn());
  var guestBanner = document.getElementById('guest-banner');
  if (guestBanner) guestBanner.style.display = isGuest ? 'block' : 'none';
  var saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.style.display = isGuest ? 'none' : 'block';

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
  var rank = ct.data.rank;
  var rankClass = rank <= 5 ? 'ct-top5' : rank <= 20 ? 'ct-mid' : 'ct-expensive';
  el.innerHTML = '<div class="ct-row ' + rankClass + '">' +
    '<span class="ct-borough">' + ct.borough + '</span>' +
    '<span class="ct-rank-label">#' + rank + ' cheapest of 33 London boroughs</span>' +
    '</div>';
}

// ── Property search links ─────────────────────────────────────
function renderPropertyLinks(areaName) {
  var el = document.getElementById('ai-property-links');
  if (!el) return;
  var zUrl = getZooplaUrl(areaName, propertySearch.type, propertySearch.maxPrice, propertySearch.beds, propertySearch.radius);
  var rmUrl = getRightmoveUrl(areaName, propertySearch.type, propertySearch.maxPrice, propertySearch.beds, propertySearch.radius);
  var html = '';
  if (zUrl) html += '<a class="property-link zo-link" href="' + zUrl + '" target="_blank" rel="noopener">Search Zoopla</a>';
  if (rmUrl) html += '<a class="property-link rm-link" href="' + rmUrl + '" target="_blank" rel="noopener">Search Rightmove</a>';
  if (!html) html = '<div class="lifestyle-loading">Property search not available for this area.</div>';
  el.innerHTML = html;
}

// Called when property filters change — refreshes links and price dropdown
function updatePropertySearch(field, value) {
  propertySearch[field] = value;
  if (currentArea) {
    renderPropertyLinks(currentArea);
  }
}

function updatePropertyPriceDropdown() {
  var priceSelect = document.getElementById('prop-price');
  if (!priceSelect) return;
  var options = (window.PROPERTY_PRICE_OPTIONS && window.PROPERTY_PRICE_OPTIONS[propertySearch.type]) || [];
  priceSelect.innerHTML = '<option value="any">No limit</option>';
  options.forEach(function(opt) {
    var option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    priceSelect.appendChild(option);
  });
}

window.updatePropertySearch = updatePropertySearch;
window.updatePropertyPriceDropdown = updatePropertyPriceDropdown;


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
function _isMyRow(person) {
  // Returns true if the logged-in user owns this score row.
  // If role not yet set, allow editing both (graceful fallback).
  var role = typeof AuthManager !== 'undefined' && AuthManager.getMyRole && AuthManager.getMyRole();
  return !role || role === person;
}

function renderScoreButtons(containerId, person, selected) {
  var mine = _isMyRow(person);
  var html = '';
  for (var i = 1; i <= 10; i++) {
    var cls = 'score-btn' + (selected === i ? ' active-' + person : '');
    if (mine) {
      html += '<button class="' + cls + '" onclick="setScore(\'' + person + '\',' + i + ')">' + i + '</button>';
    } else {
      html += '<button class="' + cls + '" disabled style="opacity:0.25;cursor:not-allowed">' + i + '</button>';
    }
  }
  document.getElementById(containerId).innerHTML = html;
}

// Called by AuthManager once the role is known, so buttons update immediately.
function applyRoleLock() {
  if (!currentArea) return;
  renderScoreButtons('p1-scores', 'p1', p1Score);
  renderScoreButtons('p2-scores', 'p2', p2Score);
}
window.applyRoleLock = applyRoleLock;

function setScore(person, val) {
  var loggedIn = typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn && AuthManager.isLoggedIn();
  if (!loggedIn) return;
  if (!_isMyRow(person)) return; // silently block editing the other person's row
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
  var loggedIn = typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn && AuthManager.isLoggedIn();
  if (!currentArea || !loggedIn) return;
  var key     = 'area_' + currentArea.replace(/[^a-zA-Z0-9]/g, '_');
  var existing = getSaved(currentArea);
  var data     = Object.assign({}, existing);

  // Only update the score for the row this user owns — never overwrite partner's score.
  var myRole = typeof AuthManager !== 'undefined' && AuthManager.getMyRole && AuthManager.getMyRole();
  if (!myRole || myRole === 'p1') {
    data.p1Score   = p1Score;
    data.p1Comment = (data.p1Comment || '');
  }
  if (!myRole || myRole === 'p2') {
    data.p2Score   = p2Score;
    data.p2Comment = (data.p2Comment || '');
  }

  ratingsCache[key] = data;

  // Always save locally as a fast cache
  try { localStorage.setItem('area_' + currentArea, JSON.stringify(data)); } catch(e) {}

  // Save to Firebase when logged in
  var authUser = typeof AuthManager !== 'undefined' && AuthManager.getUser && AuthManager.getUser();
  if (authUser && typeof firebase !== 'undefined') {
    firebase.database().ref('users/' + authUser.uid + '/ratings/' + key).set(data)
      .catch(function(e) { console.warn('[NF] Firebase save failed:', e); });
  }

  if (document.getElementById('results-section').style.display !== 'none') {
    rebuildTop5(); computeZones();
  }
  renderNestScores();
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

// ── Veto logic (session-only — no Firebase/localStorage persistence) ──────────
function isVetoed(name) {
  var key = vetoStorageKey(name);
  return !!vetoedAreas[key];
}

function toggleVeto(name, checked) {
  var key = vetoStorageKey(name);
  if (checked) {
    vetoedAreas[key] = true;
  } else {
    delete vetoedAreas[key];
  }
  if (document.getElementById('results-section').style.display !== 'none') {
    rebuildTop5(); computeZones();
  }
  renderNestScores();
}
window.toggleVeto = toggleVeto;

// Batch undo — removes multiple vetoes and redraws the map only once
function batchUnveto(names) {
  if (!names || !names.length) return;
  names.forEach(function(name) {
    delete vetoedAreas[vetoStorageKey(name)];
  });
  rebuildTop5();
  computeZones();
}
window.batchUnveto = batchUnveto;

// ── Tab switching ─────────────────────────────────────────────
var sidebarOpen = true;

function switchTab(t) {
  ['search', 'filter', 'area', 'viewings', 'shortlist'].forEach(function(n) {
    var tabEl = document.getElementById('tab-' + n);
    var contentEl = document.getElementById('content-' + n);
    if (tabEl)    tabEl.className    = 'tab' + (n === t ? ' active' : '');
    if (contentEl) contentEl.className = 'tab-content' + (n === t ? ' active' : '');
  });
  if (t === 'filter')    { if (typeof initFilterTab === 'function') initFilterTab(); }
  if (t === 'viewings')  { if (typeof renderViewingsTab === 'function') renderViewingsTab(); }
  if (t === 'shortlist') { if (typeof renderShortlistTab === 'function') renderShortlistTab(); }
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

// ── Nest Scores card (map overlay, below Top Picks) ──────────
function renderNestScores() {
  var card = document.getElementById('nest-scores-card');
  var list = document.getElementById('nest-scores-list');
  if (!card || !list) return;

  var rated = [];
  AREAS.forEach(function(a) {
    var saved = getSaved(a.name);
    if (saved.p1Score || saved.p2Score) {
      rated.push({ name: a.name, total: (saved.p1Score || 0) + (saved.p2Score || 0) });
    }
  });
  rated.sort(function(a, b) { return b.total - a.total; });

  if (!rated.length) { card.style.display = 'none'; return; }

  // Reset to collapsed state each time scores are refreshed
  card.classList.remove('card-expanded');
  var expandBtn = document.getElementById('scores-expand-btn');
  if (expandBtn) expandBtn.textContent = '+';

  list.innerHTML = rated.map(function(r, i) {
    return '<li><div class="top5-row">' +
      '<span class="top5-rank-badge" style="background:#f59e0b">' + (i + 1) + '</span>' +
      nfEscapeHtml(r.name) +
      '<span class="nest-score-value">' + r.total + '/20</span>' +
      '</div></li>';
  }).join('');
  card.style.display = 'block';
}
window.renderNestScores = renderNestScores;


function jumpToArea(name) {
  var area = AREAS.find(function(a) { return a.name === name; });
  if (!area) return;
  map.panTo([area.lat, area.lng]);
  var jt = JOURNEY_TIMES[name];
  if (jt) {
    var profile = ProfileManager.get();
    var wk = getWalkKmValues();
    var p1Walk = Math.round(wk.p1WalkKm * 12);
    var p2Walk = Math.round(wk.p2WalkKm * 12);
    var t1 = jt[profile.p1.workId] + p1Walk;
    var t2 = jt[profile.p2.workId] + p2Walk;
    var lim = getCommuteMaxLimits();
    openAreaInfo(area, t1, t2, t1 <= lim.p1Max && t2 <= lim.p2Max);
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

// ── Real neighbourhood data strip ────────────────────────────
function renderRealData(areaName) {
  var section = document.getElementById('real-data-section');
  var strip   = document.getElementById('real-data-strip');
  if (!section || !strip) return;

  var d = window.areaEnrichmentCache && window.areaEnrichmentCache[areaName];
  if (!d || !Object.keys(d).length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  var chips = '';

  if (d.tflZone) {
    chips += '<span class="data-chip">Zone ' + nfEscapeHtml(d.tflZone) + '</span>';
  }
  if (d.tflLines) {
    chips += '<span class="data-chip">' + nfEscapeHtml(d.tflLines) + '</span>';
  }
  if (d.crimeCount !== undefined) {
    var crCls = d.crimeCount < 30 ? 'chip-good' : d.crimeCount < 70 ? 'chip-mid' : 'chip-bad';
    chips += '<span class="data-chip ' + crCls + '">' + d.crimeCount + ' crimes/month</span>';
  }
  if (d.aqiLabel) {
    var aqCls = d.aqi <= 40 ? 'chip-good' : d.aqi <= 80 ? 'chip-mid' : 'chip-bad';
    chips += '<span class="data-chip ' + aqCls + '">' + nfEscapeHtml(d.aqiLabel) + '</span>';
  }
  if (d.cafes  !== undefined) chips += '<span class="data-chip">' + d.cafes  + ' cafes</span>';
  if (d.pubs   !== undefined) chips += '<span class="data-chip">' + d.pubs   + ' pubs</span>';
  if (d.parks  !== undefined) chips += '<span class="data-chip">' + d.parks  + ' parks</span>';
  if (d.gyms   !== undefined) chips += '<span class="data-chip">' + d.gyms   + ' gyms</span>';
  if (d.schools !== undefined) chips += '<span class="data-chip">' + d.schools + ' schools</span>';

  strip.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:6px">' + chips + '</div>';
}

// ── Data-rich neighbourhood box ───────────────────────────────
// ── Gym toggles (search tab) ──────────────────────────────────
function buildGymToggles() {
  var profile = ProfileManager.get();
  if (!profile) return;
  var p1gym = profile.p1.gym, p2gym = profile.p2.gym;
  var section = document.getElementById('gym-toggle-section');
  if (!section) return;
  if (!p1gym && !p2gym) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  // Build distance-filter rows for each person's gym
  function makeGymFilterRow(gymKey, person, personName) {
    var b = GYM_BRANDS[gymKey];
    if (!b) return '';
    var imgHtml = '<img src="' + b.logo + '" alt="' + b.name + '" style="width:32px;height:32px;object-fit:contain;border-radius:4px;">';
    return '<div class="gym-filter-row" id="gfrow-' + person + '">' +
      '<div class="gym-filter-logo">' + imgHtml + '</div>' +
      '<div class="gym-filter-info">' +
        '<span class="gym-filter-name">' + personName + '</span>' +
        '<span class="gym-filter-brand">' + b.name + '</span>' +
      '</div>' +
      '<select class="gym-filter-select" id="gdist-' + person + '" onchange="setGymDist(\'' + person + '\',this.value)">' +
        '<option value="off">Off</option>' +
        '<option value="1">Within 1km</option>' +
        '<option value="2">Within 2km</option>' +
        '<option value="3">Within 3km</option>' +
      '</select>' +
    '</div>';
  }

  var html = '';
  if (p1gym) html += makeGymFilterRow(p1gym, 'p1', profile.p1.name);
  if (p2gym) html += makeGymFilterRow(p2gym, 'p2', profile.p2.name);
  document.getElementById('gym-toggles').innerHTML = html;

}

function setGymDist(person, value) {
  if (value === 'off') {
    gymFilter[person].brand = null;
  } else {
    var profile = ProfileManager.get();
    if (!profile) return;
    gymFilter[person].brand = profile[person].gym;
    gymFilter[person].km = parseFloat(value);
  }
  // Re-run the last search if results exist
  if (greenAreas.length > 0) applyGymFilter();
}
window.setGymDist = setGymDist;

function applyGymFilter() {
  // Show/hide green area circles based on gym distance filters
  var p1Active = gymFilter.p1.brand !== null;
  var p2Active = gymFilter.p2.brand !== null;

  greenAreas.forEach(function(item) {
    var show = true;

    if (p1Active) {
      var brand = GYM_BRANDS[gymFilter.p1.brand];
      if (brand) {
        var withinDist = brand.locations.some(function(loc) {
          return haversineKm(item.lat, item.lng, loc.lat, loc.lng) <= gymFilter.p1.km;
        });
        if (!withinDist) show = false;
      }
    }

    if (p2Active && show) {
      var brand2 = GYM_BRANDS[gymFilter.p2.brand];
      if (brand2) {
        var withinDist2 = brand2.locations.some(function(loc) {
          return haversineKm(item.lat, item.lng, loc.lat, loc.lng) <= gymFilter.p2.km;
        });
        if (!withinDist2) show = false;
      }
    }

    if (item.circle) item.circle.setStyle({ opacity: show ? 1 : 0, fillOpacity: show ? 0.55 : 0 });
    if (item.marker) item.marker.setOpacity(show ? 1 : 0);
  });

  // Re-fit map to whichever circles are now visible
  var visibleItems = greenAreas.filter(function(item) {
    return item.circle && item.circle.options.opacity > 0;
  });
  if (visibleItems.length && window.nfMap) {
    var bounds = L.latLngBounds(visibleItems.map(function(i) { return [i.lat, i.lng]; }));
    window.nfMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }
}
window.applyGymFilter = applyGymFilter;

function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function renderGymMarkers() {
  gymLayers.p1.clearLayers();
  gymLayers.p2.clearLayers();
  var profile = ProfileManager.get();
  if (!profile) return;

  function plotGyms(gymKey, layer) {
    var brand = GYM_BRANDS[gymKey];
    if (!brand) return;
    // Small logo markers, zIndexOffset negative so green bubbles always appear on top
    var iconHtml = '<div style="width:24px;height:24px;border-radius:4px;overflow:hidden;border:1.5px solid ' + brand.color + ';background:#fff;display:flex;align-items:center;justify-content:center;">' +
      '<img src="' + brand.logo + '" style="width:20px;height:20px;object-fit:contain;"></div>';
    var icon = L.divIcon({ html: iconHtml, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
    brand.locations.forEach(function(loc) {
      L.marker([loc.lat, loc.lng], { icon: icon, zIndexOffset: -1000 })
        .bindPopup('<b style="font-size:12px">' + loc.name + '</b>')
        .addTo(layer);
    });
  }

  if (profile.p1.gym) plotGyms(profile.p1.gym, gymLayers.p1);
  if (profile.p2.gym) plotGyms(profile.p2.gym, gymLayers.p2);
}

// ── Gym brand map toggles (floating buttons above running parks) ──
var gymBrandToggleState = {};  // { virginactive: false, ... }
var gymBrandMapLayers   = {};  // { virginactive: L.layerGroup, ... }

function initGymBrandToggles() {
  var container = document.getElementById('gym-map-toggles');
  if (!container || typeof GYM_BRANDS === 'undefined') return;

  var labels = { virginactive: 'Virgin Active', onerebe: '1Rebel', f45: 'F45', thirdspace: 'Third Space', psycle: 'Psycle' };

  Object.keys(GYM_BRANDS).forEach(function(key) {
    gymBrandToggleState[key] = false;
    var btn = document.createElement('button');
    btn.id = 'gym-btn-' + key;
    btn.className = 'gym-brand-btn';
    btn.textContent = labels[key] || GYM_BRANDS[key].name;
    btn.onclick = function() { toggleGymBrand(key); };
    container.appendChild(btn);
  });
}

function toggleGymBrand(key) {
  gymBrandToggleState[key] = !gymBrandToggleState[key];
  var btn = document.getElementById('gym-btn-' + key);
  var brand = GYM_BRANDS[key];
  if (!brand) return;

  if (gymBrandToggleState[key]) {
    // Create layer if needed, populate with markers, add to map
    if (!gymBrandMapLayers[key]) {
      var layer = L.layerGroup();
      var iconHtml = '<div style="width:24px;height:24px;border-radius:4px;overflow:hidden;border:1.5px solid ' + brand.color + ';background:#fff;display:flex;align-items:center;justify-content:center;">' +
        '<img src="' + brand.logo + '" style="width:20px;height:20px;object-fit:contain;"></div>';
      var icon = L.divIcon({ html: iconHtml, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
      brand.locations.forEach(function(loc) {
        L.marker([loc.lat, loc.lng], { icon: icon, zIndexOffset: -1000 })
          .bindPopup('<b style="font-size:12px">' + loc.name + '</b>')
          .addTo(layer);
      });
      gymBrandMapLayers[key] = layer;
    }
    gymBrandMapLayers[key].addTo(map);
    if (btn) btn.classList.add('active');
  } else {
    if (gymBrandMapLayers[key]) map.removeLayer(gymBrandMapLayers[key]);
    if (btn) btn.classList.remove('active');
  }
}
window.toggleGymBrand = toggleGymBrand;

document.addEventListener('DOMContentLoaded', function() {
  initGymBrandToggles();
  renderNestScores();
});

// ── Mobile layout helpers (Phase 1) ──────────────────────────

function isMobile() {
  return window.innerWidth < 768;
}
window.isMobile = isMobile;

function openMobileSheet() {
  document.getElementById('sidebar').classList.add('sheet-open');
}
window.openMobileSheet = openMobileSheet;

function closeMobileSheet() {
  document.getElementById('sidebar').classList.remove('sheet-open');
}
window.closeMobileSheet = closeMobileSheet;

function mobileNavTap(tabName) {
  switchTab(tabName);
  if (isMobile()) {
    openMobileSheet();
    ['filter','area','viewings','shortlist'].forEach(function(t) {
      var btn = document.getElementById('mob-nav-' + t);
      if (btn) btn.classList.toggle('active', t === tabName);
    });
  }
}
window.mobileNavTap = mobileNavTap;

function openMobileSettings() {
  var backdrop = document.getElementById('mobile-settings-backdrop');
  var drawer   = document.getElementById('mobile-settings-drawer');
  if (backdrop) backdrop.classList.add('open');
  if (drawer)   drawer.classList.add('open');
  // Sync drawer selects to the current values in the header selects
  var mc = document.getElementById('commute-max-shared');
  var md = document.getElementById('mob-commute-max');
  if (mc && md) md.value = mc.value;
  var wc = document.getElementById('walk-shared');
  var wd = document.getElementById('mob-walk');
  if (wc && wd) wd.value = wc.value;
}
window.openMobileSettings = openMobileSettings;

function closeMobileSettings() {
  var backdrop = document.getElementById('mobile-settings-backdrop');
  var drawer   = document.getElementById('mobile-settings-drawer');
  if (backdrop) backdrop.classList.remove('open');
  if (drawer)   drawer.classList.remove('open');
}
window.closeMobileSettings = closeMobileSettings;

function initMobileDrawerSelects() {
  // Copies options from the header selects into the drawer selects.
  // Called after NFCommuteSettings.fillCommuteSelect() has already populated the originals.
  [['commute-max-shared','mob-commute-max'],['walk-shared','mob-walk']].forEach(function(pair) {
    var src  = document.getElementById(pair[0]);
    var dest = document.getElementById(pair[1]);
    if (!src || !dest) return;
    dest.innerHTML = src.innerHTML;
    dest.value     = src.value;
  });
}
window.initMobileDrawerSelects = initMobileDrawerSelects;

function toggleMobileCard(cardId) {
  var card = document.getElementById(cardId);
  if (card) card.classList.toggle('mob-expanded');
}
window.toggleMobileCard = toggleMobileCard;

function toggleCard(cardId) {
  var card = document.getElementById(cardId);
  if (!card) return;
  var expanded = card.classList.toggle('card-expanded');
  var btn = card.querySelector('.card-expand-btn');
  if (btn) btn.textContent = expanded ? '−' : '+';
}
window.toggleCard = toggleCard;

// Wrap switchTab so that ANY caller (openAreaInfo, viewings marker click, tutorial, etc.)
// automatically opens the bottom sheet on mobile — without needing to modify those files.
(function() {
  var _orig = window.switchTab;
  window.switchTab = function(t) {
    _orig(t);
    if (isMobile()) {
      openMobileSheet();
      ['filter','area','viewings','shortlist'].forEach(function(n) {
        var btn = document.getElementById('mob-nav-' + n);
        if (btn) btn.classList.toggle('active', n === t);
      });
    }
  };
})();

