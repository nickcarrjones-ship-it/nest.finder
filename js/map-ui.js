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
function popupVeto(areaName) {
  if (isVetoed(areaName)) return;
  toggleVeto(areaName, true);
  map.closePopup();
}
function closePopupOpenArea(areaName, t1, t2, both) {
  map.closePopup();
  var area = AREAS.find(function(a) { return a.name === areaName; });
  if (area) openAreaInfo(area, t1, t2, both);
}
window.popupVeto         = popupVeto;
window.closePopupOpenArea = closePopupOpenArea;

function sidebarVeto() {
  if (!currentArea) return;
  if (isVetoed(currentArea)) return;
  toggleVeto(currentArea, true);
  updateSidebarVetoBtn();
}
function updateSidebarVetoBtn() {
  var btn = document.getElementById('area-veto-btn');
  if (!btn || !currentArea) return;
  var vetoed = isVetoed(currentArea);
  btn.textContent = '🚫';
  btn.style.background = vetoed ? '#e5e7eb' : '#f3f4f6';
  btn.style.color      = vetoed ? '#9ca3af' : '#6b7280';
  btn.style.opacity    = vetoed ? '0.65' : '1';
  btn.style.cursor     = vetoed ? 'default' : 'pointer';
  btn.title = vetoed ? 'Excluded — undo in Areas tab' : 'Never live here';
  btn.disabled = !!vetoed;
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
  document.getElementById('ai-area-commute1').textContent = profile.p1.name + ' → ' + profile.p1.workLabel + ': ' + t1 + ' min (' + trainTime1 + ' train + ' + p1WalkMin + ' walk home + ' + (profile.p1.offWalk || 0) + ' walk office)';
  document.getElementById('ai-area-commute2').textContent = profile.p2.name + ' → ' + profile.p2.workLabel + ': ' + t2 + ' min (' + trainTime2 + ' train + ' + p2WalkMin + ' walk home + ' + (profile.p2.offWalk || 0) + ' walk office)';

  // Animated route trace — AI-inferred, cached after first load
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
  if (!rmUrl && !zUrl) {
    el.innerHTML = '<div class="lifestyle-loading">Property search not available for this area.</div>';
    return;
  }
  var html = '';
  if (rmUrl) {
    html += '<a class="property-link rm-link" href="' + rmUrl + '" target="_blank" rel="noopener">🔍 View on Rightmove</a>';
  }
  if (zUrl) {
    html += '<a class="property-link zo-link" href="' + zUrl + '" target="_blank" rel="noopener">🔍 View on Zoopla</a>';
  }
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
  var searchType = document.getElementById('prop-type').value;
  var priceSelect = document.getElementById('prop-price');
  var options = window.PROPERTY_PRICE_OPTIONS[searchType] || [];

  priceSelect.innerHTML = '<option value="any">No limit</option>';

  options.forEach(function(opt) {
    var option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    priceSelect.appendChild(option);
  });

  propertySearch.type = searchType;
  if (currentArea) {
    renderPropertyLinks(currentArea);
  }
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

// ── All Areas table ───────────────────────────────────────────
function renderTable() {
  var el = document.getElementById('areas-table-inner');
  var countEl = document.getElementById('table-count');
  if (!greenAreas.length) {
    el.innerHTML = '<div class="areas-table-empty">🔍 Run a search first to see all ideal areas here.</div>';
    if (countEl) countEl.textContent = 'Run a search to see areas';
    return;
  }
  var profile = ProfileManager.get() || { p1: { name: 'P1' }, p2: { name: 'P2' } };
  var sorted    = greenAreas.slice().sort(function(a, b) { return a.area.name.localeCompare(b.area.name); });
  var vetoCount = sorted.filter(function(i) { return isVetoed(i.area.name); }).length;
  var displayed = sorted;
  if (countEl) countEl.textContent = displayed.length + ' ideal areas' + (vetoCount > 0 ? ' · ' + vetoCount + ' excluded' : '');

  el.innerHTML = '<table class="areas-table">' +
    '<thead><tr>' +
      '<th>Area</th>' +
      '<th style="text-align:center">' + profile.p1.name + '</th>' +
      '<th style="text-align:center">' + profile.p2.name + '</th>' +
      '<th style="text-align:center">Rated</th>' +
      '<th style="text-align:center">Veto</th>' +
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
        '<td class="veto-cell" style="text-align:center">' +
          '<button type="button" onclick="toggleVeto(\'' + safeName + '\',' + (!vetoed) + ')" ' +
          'style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:3px 8px;border:1px solid;border-radius:4px;cursor:pointer;font-family:inherit;background:' +
          (vetoed ? '#fee2e2' : 'transparent') + ';color:' + (vetoed ? '#b91c1c' : '#9ca3af') + ';border-color:' +
          (vetoed ? '#fca5a5' : '#e5e7eb') + '">' + (vetoed ? 'Undo' : 'Veto') + '</button></td>' +
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

