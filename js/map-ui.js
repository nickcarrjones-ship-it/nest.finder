// ── Apply stored profile to all UI elements ───────────────────
function applyProfile() {
  var profile = window.ProfileManager && ProfileManager.get();
  if (!profile) return;
  var members = profile.members || [];

  // Build per-member gym layers now that profile is available
  if (typeof map !== 'undefined' && map) {
    // Clear old layers
    gymLayers.forEach(function(l) { if (l) map.removeLayer(l); });
    gymLayers = members.map(function() { return L.layerGroup().addTo(map); });
    gymToggles = members.map(function() { return false; });
  }

  updateJourneySearchUI();

  // Render dynamic score rows in the area panel
  _buildScoreRows(members);

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

/**
 * _buildScoreRows(members)
 * Dynamically generates one score row per member inside #score-rows-container.
 * Replaces the old hardcoded p1/p2 HTML blocks.
 */
function _buildScoreRows(members) {
  var container = document.getElementById('score-rows-container');
  if (!container) return;
  var html = members.map(function(m, i) {
    return '<div style="margin-bottom:6px">' +
      '<div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px" id="member-rating-title-' + i + '">' + m.name + '</div>' +
      '<div class="score-row" id="member-scores-' + i + '"></div>' +
    '</div>';
  }).join('');
  container.innerHTML = html;
}

function setEl(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getCommuteMaxLimits() {
  var profile = ProfileManager.get();
  var def = (window.APP_CONFIG && window.APP_CONFIG.commuteDefault) || 30;
  var members = (profile && profile.members) || [];
  if (!window.NFCommuteSettings) {
    // Fallback: try per-member DOM selects, then shared select
    var sharedEl = document.getElementById('commute-max-shared');
    var sharedV = sharedEl ? parseInt(sharedEl.value, 10) : def;
    var maxMins = members.map(function(m, i) {
      var el = document.getElementById('member-max-' + i);
      var v = el ? parseInt(el.value, 10) : sharedV;
      return isNaN(v) ? sharedV : v;
    });
    if (!maxMins.length) maxMins = [def, def];
    return { maxMins: maxMins, p1Max: maxMins[0], p2Max: maxMins[1] || def };
  }
  var cm = NFCommuteSettings.resolveCommute(profile);
  if (cm.sharedCommuteLimit) {
    var el = document.getElementById('commute-max-shared');
    var v = el ? parseInt(el.value, 10) : cm.maxCommuteMins;
    if (isNaN(v)) v = cm.maxCommuteMins;
    var maxMinsShared = members.map(function() { return v; });
    return { maxMins: maxMinsShared, p1Max: v, p2Max: v };
  }
  var maxMins = members.map(function(m, i) {
    var el = document.getElementById('member-max-' + i);
    var fallback = cm.maxMins && cm.maxMins[i] != null ? cm.maxMins[i] : def;
    var v = el ? parseInt(el.value, 10) : fallback;
    return isNaN(v) ? fallback : v;
  });
  return { maxMins: maxMins, p1Max: maxMins[0] || def, p2Max: maxMins[1] || def };
}

function getWalkKmValues() {
  var profile = ProfileManager.get();
  var def = (window.APP_CONFIG && window.APP_CONFIG.walkDistanceDefault != null) ? window.APP_CONFIG.walkDistanceDefault : 1.5;
  var members = (profile && profile.members) || [];
  if (!window.NFCommuteSettings) {
    var sharedEl = document.getElementById('walk-shared');
    var sharedV = sharedEl ? parseFloat(sharedEl.value) : def;
    var walkKms = members.map(function(m, i) {
      var el = document.getElementById('member-walk-' + i);
      var v = el ? parseFloat(el.value) : sharedV;
      return isNaN(v) ? sharedV : v;
    });
    if (!walkKms.length) walkKms = [def, def];
    return { walkKms: walkKms, p1WalkKm: walkKms[0], p2WalkKm: walkKms[1] || def };
  }
  var wm = NFCommuteSettings.resolveWalk(profile);
  if (wm.sharedWalkLimit) {
    var el = document.getElementById('walk-shared');
    var v = el ? parseFloat(el.value) : wm.walkHomeKm;
    if (isNaN(v)) v = wm.walkHomeKm;
    var walkKmsShared = members.map(function() { return v; });
    return { walkKms: walkKmsShared, p1WalkKm: v, p2WalkKm: v };
  }
  var walkKms = members.map(function(m, i) {
    var el = document.getElementById('member-walk-' + i);
    var fallback = wm.walkKms && wm.walkKms[i] != null ? wm.walkKms[i] : def;
    var v = el ? parseFloat(el.value) : fallback;
    return isNaN(v) ? fallback : v;
  });
  return { walkKms: walkKms, p1WalkKm: walkKms[0] || def, p2WalkKm: walkKms[1] || def };
}

function updateJourneySearchUI() {
  var profile = ProfileManager.get();
  if (!profile || !window.NFCommuteSettings) return;
  var cm = NFCommuteSettings.resolveCommute(profile);
  var wm = NFCommuteSettings.resolveWalk(profile);
  var members = profile.members || [];

  // Header shared dropdowns
  var sel = document.getElementById('commute-max-shared');
  if (sel && sel.options.length) {
    sel.value = String(cm.maxCommuteMins);
  }
  var wsel = document.getElementById('walk-shared');
  if (wsel && wsel.options.length) {
    wsel.value = String(wm.walkHomeKm);
  }

  // Per-member split controls — generated dynamically into #member-commute-controls / #member-walk-controls
  var splitWrap  = document.getElementById('commute-search-split-wrap');
  var walkSplitW = document.getElementById('walk-search-split-wrap');
  var commuteCtrl = document.getElementById('member-commute-controls');
  var walkCtrl    = document.getElementById('member-walk-controls');

  if (commuteCtrl && !cm.sharedCommuteLimit && commuteCtrl.children.length === 0) {
    // Generate per-member commute selects
    var cHtml = '';
    members.forEach(function(m, i) {
      cHtml += '<div style="margin-bottom:6px"><label id="lbl-member-max-' + i + '" style="font-size:11px;color:#6b7280">' + m.name + ' max</label>' +
        '<select id="member-max-' + i + '" onchange="onJourneySearchChange()"></select></div>';
    });
    commuteCtrl.innerHTML = cHtml;
    members.forEach(function(m, i) {
      if (window.NFCommuteSettings) NFCommuteSettings.fillCommuteSelect(document.getElementById('member-max-' + i), cm.maxMins && cm.maxMins[i]);
    });
  }
  if (walkCtrl && !wm.sharedWalkLimit && walkCtrl.children.length === 0) {
    var wHtml = '';
    members.forEach(function(m, i) {
      wHtml += '<div style="margin-bottom:6px"><label id="lbl-member-walk-' + i + '" style="font-size:11px;color:#6b7280">' + m.name + ' walk</label>' +
        '<select id="member-walk-' + i + '" onchange="onJourneySearchChange()"></select></div>';
    });
    walkCtrl.innerHTML = wHtml;
    members.forEach(function(m, i) {
      if (window.NFCommuteSettings) NFCommuteSettings.fillWalkSelect(document.getElementById('member-walk-' + i), wm.walkKms && wm.walkKms[i]);
    });
  }

  if (splitWrap) {
    splitWrap.style.display = cm.sharedCommuteLimit ? 'none' : 'block';
    if (!cm.sharedCommuteLimit) {
      members.forEach(function(m, i) {
        var e = document.getElementById('member-max-' + i);
        if (e && e.options.length && cm.maxMins[i] != null) e.value = String(cm.maxMins[i]);
        setEl('lbl-member-max-' + i, m.name + ' max');
      });
    }
  }
  if (walkSplitW) {
    walkSplitW.style.display = wm.sharedWalkLimit ? 'none' : 'block';
    if (!wm.sharedWalkLimit) {
      members.forEach(function(m, i) {
        var w = document.getElementById('member-walk-' + i);
        if (w && w.options.length && wm.walkKms[i] != null) w.value = String(wm.walkKms[i]);
        setEl('lbl-member-walk-' + i, m.name + ' walk');
      });
    }
  }
}

function onJourneySearchChange() {
  var profile = ProfileManager.get();
  if (!profile || !window.NFCommuteSettings) return;
  var members = profile.members || [];
  var cm = NFCommuteSettings.resolveCommute(profile);
  if (cm.sharedCommuteLimit) {
    var el = document.getElementById('commute-max-shared');
    if (el) profile.maxCommuteMins = parseInt(el.value, 10);
  } else {
    members.forEach(function(m, i) {
      var e = document.getElementById('member-max-' + i);
      if (e) m.maxCommuteMins = parseInt(e.value, 10);
    });
  }
  var wm = NFCommuteSettings.resolveWalk(profile);
  if (wm.sharedWalkLimit) {
    var ws = document.getElementById('walk-shared');
    if (ws) {
      profile.walkHomeKm = parseFloat(ws.value);
      profile.sharedWalkLimit = true;
    }
  } else {
    members.forEach(function(m, i) {
      var w = document.getElementById('member-walk-' + i);
      if (w) m.walkHomeKm = parseFloat(w.value);
    });
    profile.sharedWalkLimit = false;
  }
  ProfileManager.save(profile);
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
  var profile = ProfileManager.get();
  var members = (profile && profile.members) || [];
  memberScores = members.map(function() { return 0; });
  // Keep legacy aliases in sync for any code still referencing them
  p1Score = 0; p2Score = 0;

  // Always rebuild score containers here so buttons are guaranteed to exist
  _buildScoreRows(members);

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
    var allRated = (savedForRank.memberScores || []).every(function(s) { return s > 0; });
    var maxScore = members.length * 10;
    if (ranked && allRated) {
      rankEl.textContent = 'Ranked #' + ranked.rank + ' — Combined score ' + ranked.total + '/' + maxScore;
      rankEl.style.display = 'block';
    } else {
      rankEl.style.display = 'none';
    }
  }
  var groupLabel = profile && profile.groupType === 'group' ? 'everyone' : 'both';
  document.getElementById('ai-area-badge').textContent = both ? 'Ideal for ' + groupLabel : 'Reachable by some';

  renderCouncilTax(area.name);
  renderPropertyLinks(area.name);

  var aiSections = ['ai-transport','ai-lifestyle-content','ai-highstreet'];
  aiSections.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="lifestyle-loading">Loading…</div>';
  });
  if (typeof fetchTransport   === 'function') fetchTransport(area.name);
  if (typeof fetchLifestyle   === 'function') fetchLifestyle(area.name);
  if (typeof fetchHighStreet  === 'function') fetchHighStreet(area.name);

  var saved = getSaved(area.name);
  memberScores = members.map(function(m, i) {
    return (saved.memberScores && saved.memberScores[i]) || 0;
  });
  p1Score = memberScores[0] || 0;
  p2Score = memberScores[1] || 0;
  members.forEach(function(m, i) {
    renderScoreButtons('member-scores-' + i, i, memberScores[i] || 0);
  });

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
function _isMyRow(memberIndex) {
  // Returns true if the logged-in user owns this score row (by member index).
  // If role not yet set (null), allow editing all rows (graceful fallback).
  var role = typeof AuthManager !== 'undefined' && AuthManager.getMyRole && AuthManager.getMyRole();
  return role === null || role === undefined || role === memberIndex;
}

function renderScoreButtons(containerId, memberIndex, selected) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var mine = _isMyRow(memberIndex);
  var html = '';
  for (var i = 1; i <= 10; i++) {
    var cls = 'score-btn' + (selected === i ? ' active-member' : '');
    if (mine) {
      html += '<button class="' + cls + '" onclick="setScore(' + memberIndex + ',' + i + ')">' + i + '</button>';
    } else {
      html += '<button class="' + cls + '" disabled style="opacity:0.25;cursor:not-allowed">' + i + '</button>';
    }
  }
  el.innerHTML = html;
}

// Called by AuthManager once the role is known, so buttons update immediately.
function applyRoleLock() {
  if (!currentArea) return;
  var profile = ProfileManager.get();
  var members = (profile && profile.members) || [];
  members.forEach(function(m, i) {
    renderScoreButtons('member-scores-' + i, i, memberScores[i] || 0);
  });
}
window.applyRoleLock = applyRoleLock;

function setScore(memberIndex, val) {
  var loggedIn = typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn && AuthManager.isLoggedIn();
  if (!loggedIn) return;
  if (!_isMyRow(memberIndex)) return;
  memberScores[memberIndex] = val;
  p1Score = memberScores[0] || 0;
  p2Score = memberScores[1] || 0;
  renderScoreButtons('member-scores-' + memberIndex, memberIndex, val);
}
window.setScore = setScore;

// ── Save / load ratings ───────────────────────────────────────
function getSaved(name) {
  var key = 'area_' + name.replace(/[^a-zA-Z0-9]/g, '_');
  if (ratingsCache[key]) return ratingsCache[key];
  var data = {};
  try { data = JSON.parse(localStorage.getItem('area_' + name)) || {}; } catch(e) {}
  // Migrate old p1Score/p2Score to memberScores array
  if (!data.memberScores && (data.p1Score || data.p2Score)) {
    data.memberScores = [data.p1Score || 0, data.p2Score || 0];
  }
  if (!data.memberScores) data.memberScores = [];
  return data;
}

function saveRatings() {
  var loggedIn = typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn && AuthManager.isLoggedIn();
  if (!currentArea || !loggedIn) return;
  var key     = 'area_' + currentArea.replace(/[^a-zA-Z0-9]/g, '_');
  var existing = getSaved(currentArea);
  var data     = Object.assign({}, existing);

  // Only update the score for the row this user owns — never overwrite others' scores.
  var myRole = typeof AuthManager !== 'undefined' && AuthManager.getMyRole && AuthManager.getMyRole();
  var scores = data.memberScores ? data.memberScores.slice() : [];
  if (myRole === null || myRole === undefined) {
    // No role set — update all scores
    scores = memberScores.slice();
  } else {
    // Only update own score
    scores[myRole] = memberScores[myRole] || 0;
  }
  data.memberScores = scores;

  ratingsCache[key] = data;

  try { localStorage.setItem('area_' + currentArea, JSON.stringify(data)); } catch(e) {}

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
    var scores = saved.memberScores || [];
    var total = scores.reduce(function(sum, s) { return sum + (s || 0); }, 0);
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

  var profile = ProfileManager.get();
  var memberCount = (profile && profile.members) ? profile.members.length : 2;
  var maxScore = memberCount * 10;

  var rated = [];
  AREAS.forEach(function(a) {
    var saved = getSaved(a.name);
    var scores = saved.memberScores || [];
    var total = scores.reduce(function(sum, s) { return sum + (s || 0); }, 0);
    if (total > 0) rated.push({ name: a.name, total: total });
  });
  rated.sort(function(a, b) { return b.total - a.total; });

  if (!rated.length) { card.style.display = 'none'; return; }

  card.classList.remove('card-expanded');
  var expandBtn = document.getElementById('scores-expand-btn');
  if (expandBtn) expandBtn.textContent = '+';

  list.innerHTML = rated.map(function(r, i) {
    return '<li><div class="top5-row">' +
      '<span class="top5-rank-badge" style="background:#f59e0b">' + (i + 1) + '</span>' +
      nfEscapeHtml(r.name) +
      '<span class="nest-score-value">' + r.total + '/' + maxScore + '</span>' +
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
    var members = (profile && profile.members) || [];
    var wk = getWalkKmValues();
    var lim = getCommuteMaxLimits();
    var memberTimes = members.map(function(m, i) {
      var walkM = Math.round((wk.walkKms[i] || 1.5) * 12);
      return jt[m.workId] ? jt[m.workId] + walkM : 0;
    });
    var allInRange = members.every(function(m, i) {
      return memberTimes[i] <= (lim.maxMins[i] || 30);
    });
    openAreaInfo(area, memberTimes[0] || 0, memberTimes[1] || 0, allInRange);
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
  var members = profile.members || [];
  var section = document.getElementById('gym-toggle-section');
  if (!section) return;

  var membersWithGym = members.filter(function(m) { return m.gym; });
  if (!membersWithGym.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  function makeGymFilterRow(gymKey, memberIdx, personName) {
    var b = typeof GYM_BRANDS !== 'undefined' && GYM_BRANDS[gymKey];
    if (!b) return '';
    var imgHtml = '<img src="' + b.logo + '" alt="' + b.name + '" style="width:32px;height:32px;object-fit:contain;border-radius:4px;">';
    return '<div class="gym-filter-row" id="gfrow-' + memberIdx + '">' +
      '<div class="gym-filter-logo">' + imgHtml + '</div>' +
      '<div class="gym-filter-info">' +
        '<span class="gym-filter-name">' + personName + '</span>' +
        '<span class="gym-filter-brand">' + b.name + '</span>' +
      '</div>' +
      '<select class="gym-filter-select" id="gdist-' + memberIdx + '" onchange="setGymDist(' + memberIdx + ',this.value)">' +
        '<option value="off">Off</option>' +
        '<option value="1">Within 1km</option>' +
        '<option value="2">Within 2km</option>' +
        '<option value="3">Within 3km</option>' +
      '</select>' +
    '</div>';
  }

  var html = '';
  members.forEach(function(m, i) {
    if (m.gym) html += makeGymFilterRow(m.gym, i, m.name);
  });
  document.getElementById('gym-toggles').innerHTML = html;

  // Ensure gymFilter array is sized correctly
  if (!gymFilter || gymFilter.length !== members.length) {
    gymFilter = members.map(function() { return { brand: null, km: 1 }; });
  }
}

function setGymDist(memberIdx, value) {
  var profile = ProfileManager.get();
  if (!profile) return;
  var members = profile.members || [];
  if (!gymFilter || gymFilter.length !== members.length) {
    gymFilter = members.map(function() { return { brand: null, km: 1 }; });
  }
  if (value === 'off') {
    gymFilter[memberIdx].brand = null;
  } else {
    var m = members[memberIdx];
    if (m) {
      gymFilter[memberIdx].brand = m.gym;
      gymFilter[memberIdx].km = parseFloat(value);
    }
  }
  if (greenAreas.length > 0) applyGymFilter();
}
window.setGymDist = setGymDist;

function applyGymFilter() {
  var activeFilters = (gymFilter || []).map(function(f, i) {
    return f && f.brand ? { brand: f.brand, km: f.km, idx: i } : null;
  }).filter(Boolean);

  greenAreas.forEach(function(item) {
    var show = activeFilters.every(function(f) {
      var brand = typeof GYM_BRANDS !== 'undefined' && GYM_BRANDS[f.brand];
      if (!brand) return true;
      return brand.locations.some(function(loc) {
        return haversineKm(item.lat, item.lng, loc.lat, loc.lng) <= f.km;
      });
    });

    if (item.circle) item.circle.setStyle({ opacity: show ? 1 : 0, fillOpacity: show ? 0.55 : 0 });
    if (item.marker) item.marker.setOpacity(show ? 1 : 0);
  });

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
  gymLayers.forEach(function(l) { if (l) l.clearLayers(); });
  var profile = ProfileManager.get();
  if (!profile) return;
  var members = profile.members || [];

  function plotGyms(gymKey, layer) {
    var brand = typeof GYM_BRANDS !== 'undefined' && GYM_BRANDS[gymKey];
    if (!brand) return;
    var iconHtml = '<div style="width:24px;height:24px;border-radius:4px;overflow:hidden;border:1.5px solid ' + brand.color + ';background:#fff;display:flex;align-items:center;justify-content:center;">' +
      '<img src="' + brand.logo + '" style="width:20px;height:20px;object-fit:contain;"></div>';
    var icon = L.divIcon({ html: iconHtml, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
    brand.locations.forEach(function(loc) {
      L.marker([loc.lat, loc.lng], { icon: icon, zIndexOffset: -1000 })
        .bindPopup('<b style="font-size:12px">' + loc.name + '</b>')
        .addTo(layer);
    });
  }

  members.forEach(function(m, i) {
    if (m.gym && gymLayers[i]) plotGyms(m.gym, gymLayers[i]);
  });
}

// ── Gym brand map toggles (chips inside Gyms & Studios panel) ──
var gymBrandToggleState = {};  // { virginactive: false, ... }
var gymBrandMapLayers   = {};  // { virginactive: L.layerGroup, ... }

function toggleGymBrand(key) {
  gymBrandToggleState[key] = !gymBrandToggleState[key];
  var btn   = document.getElementById('gym-btn-' + key);
  var brand = GYM_BRANDS[key];
  if (!brand) return;

  if (gymBrandToggleState[key]) {
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
    if (btn) { btn.classList.add('active'); btn.style.background = brand.color; btn.style.color = '#fff'; btn.style.borderColor = 'transparent'; }
  } else {
    if (gymBrandMapLayers[key]) map.removeLayer(gymBrandMapLayers[key]);
    if (btn) { btn.classList.remove('active'); btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
  }
}
window.toggleGymBrand = toggleGymBrand;

// ── OSM Gym/Studio category layers ───────────────────────────
var _osmGymElements = null;  // cached raw OSM nodes (fetched once per session)
var _osmGymLayers   = {};    // { fitness: L.layerGroup, ... }
var _osmGymVisible  = {};    // { fitness: false, ... }

var _OSM_GYM_CATS = {
  fitness:  { tags: [['leisure','fitness_centre'],['leisure','gym']], color: '#0891b2', label: 'Gym'      },
  yoga:     { tags: [['sport','yoga']],                               color: '#8b5cf6', label: 'Yoga'     },
  pilates:  { tags: [['sport','pilates']],                            color: '#ec4899', label: 'Pilates'  },
  boxing:   { tags: [['sport','boxing'],['sport','martial_arts']],    color: '#f97316', label: 'Boxing'   },
  crossfit: { tags: [['sport','crossfit']],                           color: '#4f46e5', label: 'CrossFit' },
};

async function _loadOSMGyms() {
  if (_osmGymElements) return;
  var bbox  = '51.28,-0.51,51.72,0.35';
  var query =
    '[out:json][timeout:30];(' +
      'node["leisure"="fitness_centre"](' + bbox + ');' +
      'node["leisure"="gym"]('            + bbox + ');' +
      'node["sport"="yoga"]('             + bbox + ');' +
      'node["sport"="pilates"]('          + bbox + ');' +
      'node["sport"="crossfit"]('         + bbox + ');' +
      'node["sport"="boxing"]('           + bbox + ');' +
      'node["sport"="martial_arts"]('     + bbox + ');' +
    ');out body;';
  var resp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
  var data = await resp.json();
  _osmGymElements = data.elements || [];
}

function _buildOSMGymLayer(catKey) {
  var cat   = _OSM_GYM_CATS[catKey];
  var layer = L.layerGroup();
  _osmGymElements.forEach(function(node) {
    if (!node.lat || !node.lon || !node.tags) return;
    var matches = cat.tags.some(function(pair) { return node.tags[pair[0]] === pair[1]; });
    if (!matches) return;
    var name    = node.tags.name    || cat.label;
    var website = node.tags.website || node.tags['contact:website'] || '';
    var popupHtml = '<b style="font-size:12px">' + name + '</b>';
    if (website) {
      var href = website.match(/^https?:\/\//) ? website : 'https://' + website;
      popupHtml += '<br><a href="' + href + '" target="_blank" rel="noopener" style="font-size:11px;color:#0891b2">website ↗</a>';
    }
    var icon = L.divIcon({
      html: '<div style="width:9px;height:9px;border-radius:50%;background:' + cat.color + ';border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35)"></div>',
      className: '', iconSize: [9, 9], iconAnchor: [4, 4]
    });
    L.marker([node.lat, node.lon], { icon: icon, zIndexOffset: -900 })
      .bindPopup(popupHtml)
      .addTo(layer);
  });
  return layer;
}

async function toggleOSMGymCategory(catKey) {
  var cat = _OSM_GYM_CATS[catKey];
  var btn = document.getElementById('osm-gym-btn-' + catKey);
  _osmGymVisible[catKey] = !_osmGymVisible[catKey];

  if (_osmGymVisible[catKey]) {
    if (btn) { btn.classList.add('active'); btn.style.background = cat.color; btn.style.color = '#fff'; btn.style.borderColor = 'transparent'; }
    try {
      await _loadOSMGyms();
      if (!_osmGymLayers[catKey]) _osmGymLayers[catKey] = _buildOSMGymLayer(catKey);
      _osmGymLayers[catKey].addTo(map);
    } catch(e) {
      console.warn('[Maloca] OSM gym load error:', e);
      _osmGymVisible[catKey] = false;
      if (btn) { btn.classList.remove('active'); btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
    }
  } else {
    if (btn) { btn.classList.remove('active'); btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
    if (_osmGymLayers[catKey]) map.removeLayer(_osmGymLayers[catKey]);
  }
}
window.toggleOSMGymCategory = toggleOSMGymCategory;

document.addEventListener('DOMContentLoaded', function() {
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

