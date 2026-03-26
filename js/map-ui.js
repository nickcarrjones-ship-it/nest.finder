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
  setEl('lbl-p1-walk', p1.name + ' walk home→station');
  setEl('lbl-p2-walk', p2.name + ' walk home→station');
  updateJourneySearchUI();

  // Rating section titles
  setEl('p1-rating-title', p1.name + '\'s Rating');
  setEl('p2-rating-title', p2.name + '\'s Rating');
  setEl('p1-comment-placeholder', p1.name + '\'s thoughts...');
  setEl('p2-comment-placeholder', p2.name + '\'s thoughts...');

  var c1 = document.getElementById('p1-comment');
  if (c1) c1.placeholder = p1.name + '\'s thoughts on this area...';
  var c2 = document.getElementById('p2-comment');
  if (c2) c2.placeholder = p2.name + '\'s thoughts on this area...';

  // Property type from profile (rent/sale) — drives the price dropdown options
  if (profile.propertyType) {
    propertySearch.type = profile.propertyType;
  }
  updatePropertyPriceDropdown();

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
  var sharedWrap = document.getElementById('commute-search-shared-wrap');
  var splitWrap = document.getElementById('commute-search-split-wrap');
  var walkSharedW = document.getElementById('walk-search-shared-wrap');
  var walkSplitW = document.getElementById('walk-search-split-wrap');
  if (!sharedWrap || !splitWrap || !walkSharedW || !walkSplitW) return;
  var p1 = profile.p1, p2 = profile.p2;
  if (cm.sharedCommuteLimit) {
    sharedWrap.style.display = 'block';
    splitWrap.style.display = 'none';
    var sel = document.getElementById('commute-max-shared');
    if (sel && sel.options.length) sel.value = String(cm.maxCommuteMins);
  } else {
    sharedWrap.style.display = 'none';
    splitWrap.style.display = 'grid';
    var e1 = document.getElementById('p1-max');
    var e2 = document.getElementById('p2-max');
    if (e1 && e1.options.length) e1.value = String(cm.maxCommuteMinsP1);
    if (e2 && e2.options.length) e2.value = String(cm.maxCommuteMinsP2);
  }
  if (wm.sharedWalkLimit) {
    walkSharedW.style.display = 'block';
    walkSplitW.style.display = 'none';
    var wsel = document.getElementById('walk-shared');
    if (wsel && wsel.options.length) wsel.value = String(wm.walkHomeKm);
  } else {
    walkSharedW.style.display = 'none';
    walkSplitW.style.display = 'grid';
    var w1 = document.getElementById('p1-walk');
    var w2 = document.getElementById('p2-walk');
    if (w1 && w1.options.length) w1.value = String(wm.walkHomeKmP1);
    if (w2 && w2.options.length) w2.value = String(wm.walkHomeKmP2);
  }
  setEl('lbl-p1-max', p1.name + ' max door-to-door');
  setEl('lbl-p2-max', p2.name + ' max door-to-door');
  setEl('lbl-commute-shared', 'Max time');
  setEl('lbl-walk-shared', 'Walk to station');
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
  if (typeof updatePropertyPriceDropdown === 'function') updatePropertyPriceDropdown();
}
window.onJourneySearchChange = onJourneySearchChange;
window.onCommuteSearchChange = onJourneySearchChange;
window.updateJourneySearchUI = updateJourneySearchUI;

// ── Popup button handlers (global for inline onclick) ────────
var vetoHistory = []; // ordered list of set-aside area names, most recent first

function popupVeto(areaName) {
  if (isVetoed(areaName)) return;
  toggleVeto(areaName, true);
  map.closePopup();
}
function popupUnveto(areaName) {
  toggleVeto(areaName, false);
  map.closePopup();
}
window.popupUnveto = popupUnveto;
function closePopupOpenArea(areaName, t1, t2, both) {
  map.closePopup();
  var area = AREAS.find(function(a) { return a.name === areaName; });
  if (area) openAreaInfo(area, t1, t2, both);
}
window.popupVeto         = popupVeto;
window.closePopupOpenArea = closePopupOpenArea;

function sidebarVeto() {
  if (!currentArea) return;
  toggleVeto(currentArea, !isVetoed(currentArea));
  updateSidebarVetoBtn();
}
function updateSidebarVetoBtn() {
  var btn = document.getElementById('area-veto-btn');
  if (!btn || !currentArea) return;
  var vetoed = isVetoed(currentArea);
  if (vetoed) {
    btn.textContent = '↩ Restore';
    btn.style.fontSize = '11px';
    btn.style.background = '#dbeafe';
    btn.style.color = '#1e40af';
  } else {
    btn.textContent = '🚫';
    btn.style.fontSize = '18px';
    btn.style.background = '#f3f4f6';
    btn.style.color = '';
  }
  btn.style.opacity = '1';
  btn.style.cursor  = 'pointer';
  btn.title = vetoed ? 'Restore this area to the map' : 'Set this area aside';
  btn.disabled = false;
}
window.sidebarVeto = sidebarVeto;

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

  var profile = ProfileManager.get();
  var wk = getWalkKmValues();
  var p1WalkKm = wk.p1WalkKm;
  var p2WalkKm = wk.p2WalkKm;
  var p1WalkMin = Math.round(p1WalkKm * 12);
  var p2WalkMin = Math.round(p2WalkKm * 12);
  var trainTime1 = JOURNEY_TIMES[area.name] ? JOURNEY_TIMES[area.name][profile.p1.workId] : 0;
  var trainTime2 = JOURNEY_TIMES[area.name] ? JOURNEY_TIMES[area.name][profile.p2.workId] : 0;
  // Route labels: initial + total time (e.g. "N · 34 min")
  var lbl1 = document.getElementById('route-label-1');
  var lbl2 = document.getElementById('route-label-2');
  if (lbl1) lbl1.textContent = profile.p1.name.substring(0,1).toUpperCase() + ' · ' + t1 + ' min';
  if (lbl2) lbl2.textContent = profile.p2.name.substring(0,1).toUpperCase() + ' · ' + t2 + ' min';

  // Route traces — AI-inferred, cached after first load
  if (typeof fetchRouteTrace === 'function') {
    fetchRouteTrace(area.name, profile.p1.workId, profile.p1.workLabel, 'route-trace-1');
    fetchRouteTrace(area.name, profile.p2.workId, profile.p2.workLabel, 'route-trace-2');
  }

  renderCouncilTax(area.name);
  renderPropertyLinks(area.name);
  updateSidebarVetoBtn();

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

  var isGuest = !(typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn && AuthManager.isLoggedIn());
  var guestBanner = document.getElementById('guest-banner');
  if (guestBanner) guestBanner.style.display = isGuest ? 'block' : 'none';
  var saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.style.display = isGuest ? 'none' : 'block';
  if (c1) { c1.disabled = isGuest; c1.style.opacity = isGuest ? '0.5' : '1'; }
  if (c2) { c2.disabled = isGuest; c2.style.opacity = isGuest ? '0.5' : '1'; }

  renderBills(area.name);
  fetchEV(area.lat, area.lng);
  renderDataBox(area);
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
  console.log('[NestFinder] Zoopla URL:', zUrl, '| filters:', propertySearch);
  if (!zUrl) {
    el.innerHTML = '<div class="lifestyle-loading">Property search not available for this area.</div>';
    return;
  }
  el.innerHTML = '<a class="property-link zo-link" href="' + zUrl + '" target="_blank" rel="noopener">🔍 View on Zoopla</a>';
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
function renderScoreButtons(containerId, person, selected) {
  var html = '';
  for (var i = 1; i <= 10; i++) {
    var cls = 'score-btn' + (selected === i ? ' active-' + person : '');
    html += '<button class="' + cls + '" onclick="setScore(\'' + person + '\',' + i + ')">' + i + '</button>';
  }
  document.getElementById(containerId).innerHTML = html;
}
function setScore(person, val) {
  var loggedIn = typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn && AuthManager.isLoggedIn();
  if (!loggedIn) return;
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

  data.p1Score   = p1Score;
  data.p1Comment = document.getElementById('p1-comment').value;
  data.p2Score   = p2Score;
  data.p2Comment = document.getElementById('p2-comment').value;

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
  var kNew = vetoStorageKey(name);
  var kLegacy = 'veto_' + String(name).replace(/[^a-zA-Z0-9]/g, '_');
  return !!(vetoedAreas[kNew] || vetoedAreas[kLegacy]);
}

function persistVetoesLocal() {
  try { localStorage.setItem((APP_CONFIG.storagePrefix || 'nf_') + 'vetoes', JSON.stringify(vetoedAreas)); } catch(e) {}
}

function toggleVeto(name, checked) {
  var key = vetoStorageKey(name);
  var kLegacy = 'veto_' + String(name).replace(/[^a-zA-Z0-9]/g, '_');
  if (checked) {
    vetoedAreas[key] = true;
    delete vetoedAreas[kLegacy];
  } else {
    delete vetoedAreas[key];
    delete vetoedAreas[kLegacy];
  }

  // Track order for Set Aside tab — most recently added at front
  vetoHistory = vetoHistory.filter(function(n) { return n !== name; });
  if (checked) vetoHistory.unshift(name);

  var authed = typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn && AuthManager.isLoggedIn();
  if (authed && AuthManager.getUser()) {
    AuthManager.saveVeto(AuthManager.getUser().uid, name, checked);
  } else {
    persistVetoesLocal();
  }

  if (document.getElementById('results-section').style.display !== 'none') {
    rebuildTop5(); computeZones();
  }
  renderTable();
}
window.toggleVeto = toggleVeto;

// Batch undo — removes multiple vetoes and redraws the map only once
function batchUnveto(names) {
  if (!names || !names.length) return;
  var authed = typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn && AuthManager.isLoggedIn();
  names.forEach(function(name) {
    var key = vetoStorageKey(name);
    var kLegacy = 'veto_' + String(name).replace(/[^a-zA-Z0-9]/g, '_');
    delete vetoedAreas[key];
    delete vetoedAreas[kLegacy];
    if (authed && AuthManager.getUser()) {
      AuthManager.saveVeto(AuthManager.getUser().uid, name, false);
    }
  });
  if (!authed) persistVetoesLocal();
  // Clear from history
  var nameSet = {};
  names.forEach(function(n) { nameSet[n] = true; });
  vetoHistory = vetoHistory.filter(function(n) { return !nameSet[n]; });
  rebuildTop5();
  computeZones();
  renderTable();
}
window.batchUnveto = batchUnveto;

function toggleVetoFilter() {
  if (document.getElementById('results-section').style.display !== 'none') { rebuildTop5(); computeZones(); }
  renderTable();
}
window.toggleVetoFilter = toggleVetoFilter;

// ── Tab switching ─────────────────────────────────────────────
var sidebarOpen = true;

function switchTab(t) {
  ['search', 'filter', 'area', 'table', 'results'].forEach(function(n) {
    document.getElementById('tab-' + n).className = 'tab' + (n === t ? ' active' : '');
    document.getElementById('content-' + n).className = 'tab-content' + (n === t ? ' active' : '');
  });
  if (t === 'results') renderResults();
  if (t === 'table')   renderTable();
  if (t === 'filter')  { if (typeof initFilterTab === 'function') initFilterTab(); }
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
    if (isVetoed(a.name)) return;
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
        '<span>' + profile.p1.name + ': <b>' + r.p1Score + '/10</b></span>' +
        '<span>' + profile.p2.name + ': <b>' + r.p2Score + '/10</b></span>' +
      '</div>' +
      (comment ? '<div class="result-comment">"' + comment.substring(0, 60) + (comment.length > 60 ? '...' : '') + '"</div>' : '') +
    '</div>';
  }).join('');
}

// ── Set Aside tab — shows greyed-out areas, newest first ──────
function renderTable() {
  var el = document.getElementById('areas-table-inner');
  var countEl = document.getElementById('table-count');

  if (!greenAreas.length) {
    if (countEl) countEl.textContent = '';
    el.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:12px;line-height:1.6">Run a search first, then grey out areas you want to set aside.</div>';
    return;
  }

  var excluded = greenAreas.filter(function(i) { return isVetoed(i.area.name); });

  if (!excluded.length) {
    if (countEl) countEl.textContent = 'None set aside';
    el.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:12px;line-height:1.6">Nothing set aside yet.<br><br>Tap the 🚫 on any map bubble to grey it out — it will appear here.</div>';
    return;
  }

  // Sort: most recently set aside at the top
  var histIndex = {};
  vetoHistory.forEach(function(n, i) { histIndex[n] = i; });
  excluded.sort(function(a, b) {
    var ia = histIndex[a.area.name] !== undefined ? histIndex[a.area.name] : 9999;
    var ib = histIndex[b.area.name] !== undefined ? histIndex[b.area.name] : 9999;
    return ia - ib;
  });

  if (countEl) countEl.textContent = excluded.length + ' set aside';

  el.innerHTML = excluded.map(function(item) {
    var safeName = item.area.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--rule)">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:700;color:#9ca3af">' + nfEscapeHtml(item.area.name) + '</div>' +
        '<div style="font-size:11px;color:#d1d5db;margin-top:1px">' + item.t1 + ' min · ' + item.t2 + ' min</div>' +
      '</div>' +
      '<button type="button" onclick="toggleVeto(\'' + safeName + '\', false)" ' +
        'style="flex-shrink:0;padding:5px 12px;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;background:#dbeafe;color:#1e40af">↩ Restore</button>' +
    '</div>';
  }).join('');
}

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
function renderDataBox(area) {
  var box = document.getElementById('area-data-box');
  if (!box) return;

  var d = window.areaEnrichmentCache && window.areaEnrichmentCache[area.name];
  if (!d || !Object.keys(d).length) { box.style.display = 'none'; return; }

  box.style.display = 'block';

  // Pub header
  var pubCount = document.getElementById('data-pub-count');
  if (pubCount) {
    var pubs = d.pubs !== undefined ? d.pubs : 0;
    pubCount.textContent = pubs + ' pub' + (pubs !== 1 ? 's' : '') + ' nearby';
  }
  // Reset pub pick while loading
  var pubPick = document.getElementById('data-pub-pick');
  if (pubPick) { pubPick.style.display = 'none'; pubPick.innerHTML = ''; }

  // Crime stat
  var crimeEl = document.getElementById('data-crime-stat');
  if (crimeEl && d.crimeCount !== undefined) {
    var crCls = d.crimeCount < 30 ? 'stat-good' : d.crimeCount < 70 ? 'stat-mid' : 'stat-bad';
    var crLabel = d.crimeCount < 30 ? 'Low' : d.crimeCount < 70 ? 'Moderate' : 'High';
    var crDots = '';
    var crLevel = d.crimeCount < 30 ? 1 : d.crimeCount < 70 ? 3 : 5;
    for (var i = 0; i < 5; i++) {
      crDots += '<div class="data-box-dot' + (i < crLevel ? ' filled' : '') + '"></div>';
    }
    crimeEl.innerHTML =
      '<div class="data-box-stat-label">Crime</div>' +
      '<div class="data-box-stat-value ' + crCls + '">' + d.crimeCount + '</div>' +
      '<div class="data-box-stat-sub">incidents/month</div>' +
      '<div class="data-box-stat-dots ' + crCls + '">' + crDots + '</div>' +
      '<div class="data-box-stat-sub">' + crLabel + '</div>';
  }

  // Air quality stat
  var airEl = document.getElementById('data-air-stat');
  if (airEl && d.aqiLabel) {
    var aqCls = d.aqi <= 40 ? 'stat-good' : d.aqi <= 80 ? 'stat-mid' : 'stat-bad';
    airEl.innerHTML =
      '<div class="data-box-stat-label">Air Quality</div>' +
      '<div class="data-box-stat-value ' + aqCls + '">' + d.aqi + '</div>' +
      '<div class="data-box-stat-sub">European AQI</div>' +
      '<div class="data-box-stat-sub" style="margin-top:5px">' + nfEscapeHtml(d.aqiLabel.split(' (')[0]) + '</div>';
  }

  // Counts row
  var countsEl = document.getElementById('data-counts');
  if (countsEl) {
    var items = [];
    if (d.cafes  !== undefined) items.push('☕ ' + d.cafes + ' cafés');
    if (d.parks  !== undefined) items.push('🌳 ' + d.parks + ' parks');
    if (d.gyms   !== undefined) items.push('💪 ' + d.gyms + ' gyms');
    if (d.schools !== undefined) items.push('🏫 ' + d.schools + ' schools');
    if (d.tflZone)               items.push('🚇 Zone ' + nfEscapeHtml(d.tflZone));
    countsEl.innerHTML = items.map(function(i) {
      return '<span class="data-box-count-item">' + i + '</span>';
    }).join('');
  }

  // Trigger AI pub prediction if pubs exist
  if (d.pubs && d.pubs > 0 && typeof fetchPubPrediction === 'function') {
    fetchPubPrediction(area.name, area.lat, area.lng);
  }
}

async function fetchPubPrediction(areaName, lat, lng) {
  var pubPick = document.getElementById('data-pub-pick');
  if (!pubPick) return;

  try {
    // Fetch real pub names from OSM
    var query = '[out:json][timeout:10];node["amenity"="pub"]["name"](around:600,' + lat + ',' + lng + ');out 6;';
    var resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    var data = await resp.json();
    var names = (data.elements || []).map(function(el) { return el.tags && el.tags.name; }).filter(Boolean);
    if (!names.length) return;

    // Ask AI which sounds most characterful
    var aiResp = await callAnthropicMessages({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{
        role: 'user',
        content: 'Pubs near ' + areaName + ': ' + names.join(', ') + '.\nWhich sounds most characterful and popular? Reply with ONLY: pub name on line 1, one short sentence on line 2.'
      }]
    });

    var text = (aiResp.content[0].text || '').trim();
    var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return;

    var pubName = lines[0].replace(/^[*_"']+|[*_"']+$/g, '');
    var pubDesc = lines[1] ? lines[1].replace(/^[*_"']+|[*_"']+$/g, '') : '';

    pubPick.innerHTML =
      '<div class="data-box-pub-name">⭐ ' + nfEscapeHtml(pubName) + '</div>' +
      (pubDesc ? '<div class="data-box-pub-desc">' + nfEscapeHtml(pubDesc) + '</div>' : '');
    pubPick.style.display = 'block';
  } catch(e) { /* fail silently */ }
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

  // Always show gym markers
  renderGymMarkers();
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

