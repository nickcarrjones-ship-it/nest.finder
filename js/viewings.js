/**
 * viewings.js
 * ─────────────────────────────────────────────────────────────
 * Viewing tracker for nest.finder
 * Handles: Firebase CRUD, Nominatim geocoding, month calendar,
 *          scrollable day panel, map pins via nfLayers.viewings
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

window.viewingsCache = {};   // { pushId: viewingObject }
window.nonNegotiables = [];  // ordered list of must-have strings

var _viewingEditId  = null;  // set when editing an existing viewing
var _pendingDoneId  = null;  // viewing to mark done after NN setup
var nnNotesTimers   = {};    // debounce timers for notes saves

var NN_SUGGESTIONS = ['Garden', 'Two bathrooms', 'Large living space', 'Off-street parking', 'Second bedroom'];

var viewingCalYear  = null;
var viewingCalMonth = null;
var viewingSelectedDate = null;  // "YYYY-MM-DD" of currently selected day
var viewingsFilter = 'upcoming'; // 'upcoming' | 'viewed'
var resolvedTiePairs = {};       // session-only: pairs already compared in tinder card

// ── Helpers ───────────────────────────────────────────────────

function viewingsSanitize(str) {
  return (str || '').replace(/[^a-z0-9_]/gi, '_').toLowerCase();
}

function viewingsFmtDate(isoDate) {
  if (!isoDate) return '';
  var parts = isoDate.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
}

function viewingsFmtTime(time24) {
  if (!time24) return '';
  var parts = time24.split(':');
  var h = parseInt(parts[0]);
  var m = parts[1] || '00';
  var ampm = h >= 12 ? 'pm' : 'am';
  var h12 = h % 12 || 12;
  return h12 + ':' + m + ' ' + ampm;
}

function viewingsFmtPrice(val) {
  if (!val || val === 'any') return '';
  var n = parseInt(val);
  if (isNaN(n)) return '';
  return '£' + n.toLocaleString();
}

function viewingsEscape(str) {
  if (typeof nfEscapeHtml === 'function') return nfEscapeHtml(str || '');
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function viewingsTodayISO() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

// ── Firebase ──────────────────────────────────────────────────

function loadViewingsFromFirebase(uid) {
  if (typeof firebase === 'undefined') return;
  firebase.database().ref('users/' + uid + '/viewings').on('value', function(snap) {
    window.viewingsCache = snap.val() || {};
    renderViewingsTab();
    renderViewingPins();
    console.log('[Viewings] Loaded', Object.keys(window.viewingsCache).length, 'viewings');
  });
}
window.loadViewingsFromFirebase = loadViewingsFromFirebase;

function saveViewing(formData) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) { alert('Sign in to save viewings.'); return; }

  var btn = document.getElementById('viewing-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  var form = document.getElementById('viewing-add-form');
  var cachedLat = form && form._geocodedLat;
  var cachedLng = form && form._geocodedLng;

  function proceedWithSave(lat, lng, geocoded) {
    var profile = typeof ProfileManager !== 'undefined' && ProfileManager.get();
    var addedBy = (profile && profile.p1 && profile.p1.name) || 'Nick';

    var payload = {
      address:    formData.address    || '',
      area:       formData.area       || '',
      date:       formData.date       || '',
      time:       formData.time       || '',
      price:      formData.price      || '',
      agentName:  formData.agentName  || '',
      listingUrl: formData.listingUrl || '',
      notes:      formData.notes      || '',
      status:     'scheduled',
      lat:        lat,
      lng:        lng,
      geocoded:   geocoded,
      addedBy:    addedBy,
      timestamp:  firebase.database.ServerValue.TIMESTAMP
    };

    firebase.database().ref('users/' + uid + '/viewings').push(payload)
      .then(function() {
        toggleAddForm(false);
        var f = document.getElementById('viewing-add-form');
        if (f) { f.reset(); f._geocodedLat = null; f._geocodedLng = null; }
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save viewing'; }
      })
      .catch(function(err) {
        console.error('[Viewings] Save failed:', err);
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save viewing'; }
      });
  }

  if (cachedLat && cachedLng) {
    proceedWithSave(cachedLat, cachedLng, true);
  } else {
    geocodeAddress(formData.address, formData.area, proceedWithSave);
  }
}

function updateViewingStatus(id, status) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  firebase.database().ref('users/' + uid + '/viewings/' + id + '/status').set(status)
    .catch(function(err) { console.error('[Viewings] Status update failed:', err); });
}
window.updateViewingStatus = updateViewingStatus;

function deleteViewing(id) {
  if (!confirm('Delete this viewing?')) return;
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  firebase.database().ref('users/' + uid + '/viewings/' + id).remove()
    .catch(function(err) { console.error('[Viewings] Delete failed:', err); });
}
window.deleteViewing = deleteViewing;

function updateViewing(id, data) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  var btn = document.getElementById('viewing-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  function proceedWithUpdate(lat, lng, geocoded) {
    var payload = {
      address:    data.address    || '',
      area:       data.area       || '',
      date:       data.date       || '',
      time:       data.time       || '',
      price:      data.price      || '',
      agentName:  data.agentName  || '',
      listingUrl: data.listingUrl || '',
      notes:      data.notes      || '',
      lat:        lat,
      lng:        lng,
      geocoded:   geocoded
    };
    firebase.database().ref('users/' + uid + '/viewings/' + id).update(payload)
      .then(function() {
        _viewingEditId = null;
        toggleAddForm(false);
        var f = document.getElementById('viewing-add-form');
        if (f) { f.reset(); f._geocodedLat = null; f._geocodedLng = null; }
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save viewing'; }
      })
      .catch(function(err) {
        console.error('[Viewings] Update failed:', err);
        if (btn) { btn.disabled = false; btn.textContent = '💾 Update viewing'; }
      });
  }

  var existing = window.viewingsCache[id];
  var form = document.getElementById('viewing-add-form');
  var cachedLat = form && form._geocodedLat;
  var cachedLng = form && form._geocodedLng;

  // Re-geocode only if address changed
  if (existing && existing.address === data.address && existing.lat) {
    proceedWithUpdate(existing.lat, existing.lng, existing.geocoded);
  } else if (cachedLat && cachedLng) {
    proceedWithUpdate(cachedLat, cachedLng, true);
  } else {
    geocodeAddress(data.address, data.area, proceedWithUpdate);
  }
}
window.updateViewing = updateViewing;

function editViewing(id) {
  var v = window.viewingsCache[id];
  if (!v) return;
  _viewingEditId = id;

  // Open the form
  toggleAddForm(true);

  // Populate fields
  var form = document.getElementById('viewing-add-form');
  if (!form) return;
  form.address.value    = v.address    || '';
  form.area.value       = v.area       || '';
  form.date.value       = v.date       || '';
  form.time.value       = v.time       || '';
  form.price.value      = v.price      || '';
  form.agentName.value  = v.agentName  || '';
  form.listingUrl.value = v.listingUrl || '';
  form.notes.value      = v.notes      || '';

  // Cache existing coords so we don't re-geocode if address unchanged
  form._geocodedLat = v.lat  || null;
  form._geocodedLng = v.lng  || null;

  // Update save button label
  var btn = document.getElementById('viewing-save-btn');
  if (btn) btn.textContent = '💾 Update viewing';

  // Scroll form into view
  var wrap = document.getElementById('vc-add-wrap');
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.editViewing = editViewing;

// ── Non-negotiables ───────────────────────────────────────────

function loadNonNegotiablesFromFirebase(uid) {
  if (typeof firebase === 'undefined') return;
  firebase.database().ref('users/' + uid + '/nonNegotiables').on('value', function(snap) {
    var val = snap.val();
    window.nonNegotiables = (val && Array.isArray(val)) ? val.filter(Boolean) : [];
    if (viewingSelectedDate) renderDayPanel(viewingSelectedDate);
  });
}
window.loadNonNegotiablesFromFirebase = loadNonNegotiablesFromFirebase;

function saveNonNegotiables(items) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  var clean = items.filter(function(s) { return s && s.trim(); }).map(function(s) { return s.trim(); });
  window.nonNegotiables = clean;
  firebase.database().ref('users/' + uid + '/nonNegotiables').set(clean.length ? clean : null);
  closeNNSetupModal();
}
window.saveNonNegotiables = saveNonNegotiables;

function markViewingDone(id) {
  if (!window.nonNegotiables || window.nonNegotiables.length === 0) {
    _pendingDoneId = id;
    showNNSetupModal();
  } else {
    updateViewingStatus(id, 'viewed');
  }
}
window.markViewingDone = markViewingDone;

function showNNSetupModal() {
  var existing = document.getElementById('nn-setup-overlay');
  if (existing) existing.remove();

  var chips = NN_SUGGESTIONS.map(function(s) {
    return '<button type="button" class="nn-chip" onclick="fillNNSuggestion(this,\'' + viewingsEscape(s) + '\')">' + viewingsEscape(s) + '</button>';
  }).join('');

  var inputs = '';
  for (var i = 1; i <= 5; i++) {
    inputs += '<input id="nn-input-' + i + '" class="nn-setup-input" type="text" placeholder="Must-have ' + i + '">';
  }

  var overlay = document.createElement('div');
  overlay.id = 'nn-setup-overlay';
  overlay.className = 'lm-overlay';
  overlay.innerHTML =
    '<div class="lm-modal">' +
      '<div class="lm-header"><span>Your must-haves</span><button class="lm-close" onclick="closeNNSetupModal()">✕</button></div>' +
      '<div style="padding:16px">' +
        '<p style="font-size:12px;color:var(--ink-mid);margin:0 0 12px">What are your non-negotiables? Add up to 5.</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">' + chips + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' + inputs + '</div>' +
        '<button type="button" class="save-btn" style="width:100%" onclick="submitNNSetup()">💾 Save must-haves</button>' +
        '<button type="button" style="width:100%;margin-top:8px;background:transparent;border:none;font-size:11px;color:var(--ink-ghost);cursor:pointer;font-family:inherit" onclick="closeNNSetupModal()">Skip for now</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeNNSetupModal(); });

  // Pre-fill existing must-haves when editing
  window.nonNegotiables.forEach(function(item, i) {
    var inp = document.getElementById('nn-input-' + (i + 1));
    if (inp) inp.value = item;
  });
}
window.showNNSetupModal = showNNSetupModal;

function closeNNSetupModal() {
  var overlay = document.getElementById('nn-setup-overlay');
  if (overlay) overlay.remove();
  if (_pendingDoneId) {
    updateViewingStatus(_pendingDoneId, 'viewed');
    _pendingDoneId = null;
  }
}
window.closeNNSetupModal = closeNNSetupModal;

function submitNNSetup() {
  var items = [];
  for (var i = 1; i <= 5; i++) {
    var input = document.getElementById('nn-input-' + i);
    if (input && input.value.trim()) items.push(input.value.trim());
  }
  saveNonNegotiables(items);
}
window.submitNNSetup = submitNNSetup;

function fillNNSuggestion(btn, text) {
  for (var i = 1; i <= 5; i++) {
    var input = document.getElementById('nn-input-' + i);
    if (input && !input.value.trim()) {
      input.value = text;
      btn.disabled = true;
      btn.style.opacity = '0.4';
      return;
    }
  }
}
window.fillNNSuggestion = fillNNSuggestion;

function toggleNNResult(viewingId, item, action) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  var v = window.viewingsCache[viewingId];
  var nnResults = (v && v.nnResults) || {};
  var key = viewingsSanitize(item);
  var current = nnResults[key];
  var newVal = (action === 'tick') ? (current === true ? null : true) : (current === false ? null : false);
  firebase.database().ref('users/' + uid + '/viewings/' + viewingId + '/nnResults/' + key).set(newVal);
}
window.toggleNNResult = toggleNNResult;

function saveNNNotes(viewingId, val) {
  clearTimeout(nnNotesTimers[viewingId]);
  nnNotesTimers[viewingId] = setTimeout(function() {
    var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
    if (!uid) return;
    firebase.database().ref('users/' + uid + '/viewings/' + viewingId + '/nnNotes').set(val || null);
  }, 800);
}
window.saveNNNotes = saveNNNotes;

// ── Nominatim geocoding ───────────────────────────────────────

function geocodeAddress(address, areaFallback, callback) {
  if (!address) {
    var fallbackCoords = getAreaCoords(areaFallback);
    callback(fallbackCoords.lat, fallbackCoords.lng, false);
    return;
  }

  var query = address;
  if (query.toLowerCase().indexOf('london') === -1) query += ', London';

  var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);

  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'Nestr/1.0' } })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.length > 0) {
        callback(parseFloat(data[0].lat), parseFloat(data[0].lon), true);
      } else {
        var fb = getAreaCoords(areaFallback);
        callback(fb.lat, fb.lng, false);
      }
    })
    .catch(function() {
      var fb = getAreaCoords(areaFallback);
      callback(fb.lat, fb.lng, false);
    });
}

function getAreaCoords(areaName) {
  if (!areaName || typeof AREAS === 'undefined') return { lat: 51.505, lng: -0.09 };
  var found = AREAS.find(function(a) { return a.name === areaName; });
  return found ? { lat: found.lat, lng: found.lng } : { lat: 51.505, lng: -0.09 };
}

// ── Address autocomplete ──────────────────────────────────────
var viewingsAddressTimer = null;

function viewingsAddressKeyup(input) {
  clearTimeout(viewingsAddressTimer);
  var q = input.value.trim();
  if (q.length < 3) { viewingsHideSuggestions(); return; }
  viewingsAddressTimer = setTimeout(function() {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=gb&q='
      + encodeURIComponent(q);
    fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'Nestr/1.0' } })
      .then(function(r) { return r.json(); })
      .then(function(results) { viewingsShowSuggestions(results); })
      .catch(function() {});
  }, 400);
}
window.viewingsAddressKeyup = viewingsAddressKeyup;

function viewingsShowSuggestions(results) {
  var box = document.getElementById('vc-address-suggestions');
  if (!box || !results.length) { viewingsHideSuggestions(); return; }
  box.innerHTML = results.map(function(r, i) {
    return '<div class="vc-suggestion" onmousedown="viewingsPickSuggestion(' + i + ')">'
      + viewingsEscape(r.display_name) + '</div>';
  }).join('');
  box._results = results;
  box.style.display = 'block';
}

function viewingsPickSuggestion(i) {
  var box = document.getElementById('vc-address-suggestions');
  var r = box._results && box._results[i];
  if (!r) return;
  var addrInput = document.querySelector('#viewing-add-form input[name="address"]');
  if (addrInput) addrInput.value = r.display_name;
  viewingsHideSuggestions();
  var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
  viewingsAutoSetArea(lat, lng);
  var form = document.getElementById('viewing-add-form');
  if (form) { form._geocodedLat = lat; form._geocodedLng = lng; }
}
window.viewingsPickSuggestion = viewingsPickSuggestion;

function viewingsHideSuggestions() {
  var box = document.getElementById('vc-address-suggestions');
  if (box) box.style.display = 'none';
}
window.viewingsHideSuggestions = viewingsHideSuggestions;

function viewingsNearestArea(lat, lng) {
  if (typeof AREAS === 'undefined' || !AREAS.length) return null;
  var best = null, bestDist = Infinity;
  AREAS.forEach(function(a) {
    var dlat = a.lat - lat, dlng = a.lng - lng;
    var d = dlat * dlat + dlng * dlng;
    if (d < bestDist) { bestDist = d; best = a.name; }
  });
  return best;
}

function viewingsAutoSetArea(lat, lng) {
  var nearest = viewingsNearestArea(lat, lng);
  if (!nearest) return;
  var sel = document.querySelector('#viewing-add-form select[name="area"]');
  if (sel) sel.value = nearest;
}

// ── Map pins ──────────────────────────────────────────────────

function renderViewingPins() {
  var layer = window.nfLayers && window.nfLayers.viewings;
  if (!layer) return;
  layer.clearLayers();

  Object.keys(window.viewingsCache).forEach(function(id) {
    var v = window.viewingsCache[id];
    if (!v.lat || !v.lng) return;

    var icon = L.divIcon({
      html: '<div style="' +
        'background:#1a1714;color:#fff;border:2px solid #fff;' +
        'border-radius:5px 5px 0 0;width:26px;height:26px;' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.45);' +
        'position:relative;' +
        '">🏠</div>' +
        '<div style="' +
        'width:0;height:0;border-left:5px solid transparent;' +
        'border-right:5px solid transparent;border-top:6px solid #1a1714;' +
        'margin:0 auto;' +
        '"></div>',
      className: '',
      iconSize: [26, 32],
      iconAnchor: [13, 32],
      popupAnchor: [0, -34]
    });

    var dateLabel = viewingsFmtDate(v.date);
    var timeLabel = viewingsFmtTime(v.time);
    var priceLabel = viewingsFmtPrice(v.price);

    var popupLines = [
      '<b>' + viewingsEscape(v.address || v.area || 'Viewing') + '</b>',
      dateLabel + (timeLabel ? ' · ' + timeLabel : ''),
      priceLabel
    ].filter(Boolean).join('<br>');

    var marker = L.marker([v.lat, v.lng], { icon: icon })
      .bindPopup(popupLines, { maxWidth: 220 })
      .addTo(layer);

    marker.on('click', function() {
      switchTab('viewings');
      viewingSelectedDate = v.date;
      renderViewingsTab();
    });
  });
}

// ── Calendar ──────────────────────────────────────────────────

function viewingsCountByDate() {
  var counts = {};
  Object.keys(window.viewingsCache).forEach(function(id) {
    var v = window.viewingsCache[id];
    if (!v.date) return;
    var match = viewingsFilter === 'viewed'
      ? v.status === 'viewed'
      : v.status === 'scheduled' || !v.status;
    if (match) counts[v.date] = (counts[v.date] || 0) + 1;
  });
  return counts;
}

function buildCalendar(year, month) {
  var today = viewingsTodayISO();
  var counts = viewingsCountByDate();

  var monthNames = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

  // First day of month (0=Sun … 6=Sat), convert to Mon-based (0=Mon … 6=Sun)
  var firstDay = new Date(year, month, 1).getDay();
  var monFirst = (firstDay + 6) % 7;  // shift so Monday = 0
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  var html = '<div class="vc-header">' +
    '<button class="vc-nav" onclick="viewingsNavMonth(-1)">&#8592;</button>' +
    '<span class="vc-title">' + monthNames[month] + ' ' + year + '</span>' +
    '<button class="vc-nav" onclick="viewingsNavMonth(1)">&#8594;</button>' +
    '</div>';

  html += '<div class="vc-grid">';
  ['Mo','Tu','We','Th','Fr','Sa','Su'].forEach(function(d) {
    html += '<div class="vc-dow">' + d + '</div>';
  });

  // Empty cells before month start
  for (var e = 0; e < monFirst; e++) {
    html += '<div class="vc-day vc-empty"></div>';
  }

  for (var day = 1; day <= daysInMonth; day++) {
    var mm = String(month + 1).padStart(2, '0');
    var dd = String(day).padStart(2, '0');
    var isoDate = year + '-' + mm + '-' + dd;
    var count = counts[isoDate] || 0;

    var colourClass = '';
    if      (count >= 5) colourClass = 'vc-day-red';
    else if (count >= 3) colourClass = 'vc-day-amber';
    else if (count >= 1) colourClass = 'vc-day-green';

    var todayClass  = isoDate === today ? ' vc-today' : '';
    var selectedClass = isoDate === viewingSelectedDate ? ' vc-selected' : '';

    html += '<div class="vc-day' + (colourClass ? ' ' + colourClass : '') + todayClass + selectedClass + '"' +
      ' onclick="viewingsSelectDay(\'' + isoDate + '\')">' +
      day +
      '</div>';
  }

  html += '</div>';
  return html;
}

function viewingsNavMonth(delta) {
  viewingCalMonth += delta;
  if (viewingCalMonth > 11) { viewingCalMonth = 0;  viewingCalYear++;  }
  if (viewingCalMonth < 0)  { viewingCalMonth = 11; viewingCalYear--;  }
  var calEl = document.getElementById('vc-calendar');
  if (calEl) calEl.innerHTML = buildCalendar(viewingCalYear, viewingCalMonth);
}
window.viewingsNavMonth = viewingsNavMonth;

function viewingsSelectDay(dateStr) {
  viewingSelectedDate = dateStr;
  var calEl = document.getElementById('vc-calendar');
  if (calEl) calEl.innerHTML = buildCalendar(viewingCalYear, viewingCalMonth);
  renderDayPanel(dateStr);
}
window.viewingsSelectDay = viewingsSelectDay;

function renderDayPanel(dateStr) {
  var panel = document.getElementById('vc-day-panel');
  if (!panel) return;

  var viewingsForDay = Object.keys(window.viewingsCache)
    .map(function(id) { return Object.assign({ _id: id }, window.viewingsCache[id]); })
    .filter(function(v) {
      if (v.date !== dateStr) return false;
      return viewingsFilter === 'viewed'
        ? v.status === 'viewed'
        : v.status === 'scheduled' || !v.status;
    })
    .sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });

  if (!viewingsForDay.length) {
    var emptyMsg = viewingsFilter === 'viewed' ? 'No viewed properties on ' : 'No upcoming viewings on ';
    panel.innerHTML = '<div style="padding:12px 16px;font-size:12px;color:var(--ink-ghost)">' + emptyMsg + viewingsFmtDate(dateStr) + '</div>';
    return;
  }

  var headerHtml = '<div class="vc-day-header">' + viewingsFmtDate(dateStr) +
    (viewingsForDay.length > 1 ? ' <span style="color:var(--ink-ghost);font-weight:400">(' + viewingsForDay.length + ' viewings)</span>' : '') +
    '</div>';

  var cardsHtml = viewingsForDay.map(function(v) {
    var statusLabel = v.status === 'viewed' ? '✓ Viewed' : v.status === 'skipped' ? '✕ Skipped' : '';
    var statusBadge = statusLabel ? '<span class="vw-status-badge vw-status-' + v.status + '">' + statusLabel + '</span>' : '';
    if (v.shortlisted) statusBadge += '<span class="vw-shortlisted-badge">⭐ Starred</span>';

    var metaLine = [viewingsFmtTime(v.time), viewingsFmtPrice(v.price)].filter(Boolean).join(' · ');
    var agentLine = v.agentName || '';
    var approxNote = v.geocoded === false ? '<div class="vw-approx">📍 approximate location</div>' : '';

    var listingBtn = v.listingUrl
      ? '<a class="vw-listing-btn" href="' + viewingsEscape(v.listingUrl) + '" target="_blank" rel="noopener">🔗 Listing</a>'
      : '';

    var actionBtns = '';
    if (v.status === 'scheduled') {
      actionBtns =
        '<button class="vw-btn vw-btn-done" onclick="markViewingDone(\'' + v._id + '\')">✓ Done</button>' +
        '<button class="vw-btn vw-btn-skip" onclick="updateViewingStatus(\'' + v._id + '\',\'skipped\')">✕ Skip</button>';
    }
    if (v.status === 'viewed') {
      actionBtns =
        '<button class="vw-btn vw-btn-undo" onclick="updateViewingStatus(\'' + v._id + '\',\'scheduled\')">↩ Undo</button>';
      if (!v.shortlisted) {
        actionBtns += '<button class="vw-btn vw-btn-shortlist" onclick="addToShortlist(\'' + v._id + '\')">⭐ Star</button>';
      }
    }
    actionBtns += '<button class="vw-btn vw-btn-edit" onclick="editViewing(\'' + v._id + '\')">✏️ Edit</button>';
    actionBtns += '<button class="vw-btn vw-btn-del" onclick="deleteViewing(\'' + v._id + '\')">🗑</button>';

    // Non-negotiables checklist (viewed cards only)
    var nnHtml = '';
    if (v.status === 'viewed' && window.nonNegotiables && window.nonNegotiables.length > 0) {
      var nnResults = v.nnResults || {};
      var ticked = 0;
      var nnRows = window.nonNegotiables.map(function(item) {
        var key = viewingsSanitize(item);
        var val = nnResults[key];
        if (val === true) ticked++;
        return '<div class="nn-row">' +
          '<span class="nn-label">' + viewingsEscape(item) + '</span>' +
          '<button class="nn-btn nn-tick-btn' + (val === true ? ' nn-active-tick' : '') + '" onclick="toggleNNResult(\'' + v._id + '\',\'' + viewingsEscape(item) + '\',\'tick\')">✓</button>' +
          '<button class="nn-btn nn-cross-btn' + (val === false ? ' nn-active-cross' : '') + '" onclick="toggleNNResult(\'' + v._id + '\',\'' + viewingsEscape(item) + '\',\'cross\')">✗</button>' +
        '</div>';
      }).join('');
      var total = window.nonNegotiables.length;
      var badgeClass = ticked === total ? 'nn-badge-all' : ticked > 0 ? 'nn-badge-some' : 'nn-badge-none';
      nnHtml = '<div class="nn-checklist">' +
        '<div class="nn-checklist-header">Must-haves <span class="nn-badge ' + badgeClass + '">' + ticked + '/' + total + ' ✓</span></div>' +
        nnRows +
        '<textarea class="nn-notes" placeholder="Any other thoughts…" oninput="saveNNNotes(\'' + v._id + '\',this.value)">' + viewingsEscape(v.nnNotes || '') + '</textarea>' +
      '</div>';
    }

    return '<div class="vw-card">' +
      '<div class="vw-card-address">🏠 ' + viewingsEscape(v.address || v.area || 'No address') + '</div>' +
      (metaLine ? '<div class="vw-card-meta">' + viewingsEscape(metaLine) + '</div>' : '') +
      (agentLine ? '<div class="vw-card-agent">' + viewingsEscape(agentLine) + '</div>' : '') +
      approxNote +
      statusBadge +
      (listingBtn ? '<div style="margin-top:6px">' + listingBtn + '</div>' : '') +
      '<div class="vw-card-actions">' + actionBtns + '</div>' +
      nnHtml +
      '</div>';
  }).join('');

  panel.innerHTML = headerHtml + '<div class="vc-day-scroll">' + cardsHtml + '</div>';
}

// ── Add form ──────────────────────────────────────────────────

function toggleAddForm(forceState) {
  var form = document.getElementById('vc-add-wrap');
  if (!form) return;
  var show = (forceState !== undefined) ? forceState : form.style.display === 'none';
  form.style.display = show ? 'block' : 'none';
  var btn = document.getElementById('vc-add-btn');
  if (btn) btn.textContent = show ? '✕ Cancel' : '+ Add';
  if (!show) {
    // Clear edit state and reset save button label
    _viewingEditId = null;
    var saveBtn = document.getElementById('viewing-save-btn');
    if (saveBtn) saveBtn.textContent = '💾 Save viewing';
    var f = document.getElementById('viewing-add-form');
    if (f) { f.reset(); f._geocodedLat = null; f._geocodedLng = null; }
  }
}
window.toggleAddForm = toggleAddForm;


function buildPriceOptions() {
  var options = '<option value="">No price / unknown</option>';
  for (var p = 350000; p <= 1500000; p += 25000) {
    var label = p >= 1000000
      ? '£' + (p / 1000000).toFixed(p % 1000000 === 0 ? 0 : 3).replace(/\.?0+$/, '') + 'm'
      : '£' + (p / 1000) + 'k';
    options += '<option value="' + p + '">' + label + '</option>';
  }
  return options;
}

function buildAreaOptions() {
  if (typeof AREAS === 'undefined' || !AREAS.length) return '<option value="">Select area…</option>';
  return '<option value="">No area</option>' +
    AREAS.map(function(a) {
      return '<option value="' + viewingsEscape(a.name) + '">' + viewingsEscape(a.name) + '</option>';
    }).join('');
}

// ── Render main tab ───────────────────────────────────────────

function renderViewingsTab() {
  var container = document.getElementById('content-viewings');
  if (!container) return;

  // Init calendar to current month on first render
  var now = new Date();
  if (viewingCalYear === null) {
    viewingCalYear  = now.getFullYear();
    viewingCalMonth = now.getMonth();
  }

  // Auto-select today if it has viewings, else next upcoming viewing
  if (!viewingSelectedDate) {
    var today = viewingsTodayISO();
    var counts = viewingsCountByDate();
    if (counts[today]) {
      viewingSelectedDate = today;
    } else {
      var upcoming = Object.keys(counts).filter(function(d) { return d >= today; }).sort();
      viewingSelectedDate = upcoming[0] || null;
    }
  }

  container.innerHTML =
    '<div class="vc-wrap">' +
      '<div class="vc-topbar">' +
        '<span class="section-title" style="margin:0">📅 Viewings</span>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="vc-add-btn" style="font-size:10px;background:transparent;border-color:var(--rule);color:var(--ink-mid)" onclick="showNNSetupModal()">Must-haves</button>' +
          '<button id="vc-add-btn" class="vc-add-btn" onclick="toggleAddForm()">+ Add</button>' +
        '</div>' +
      '</div>' +

      '<div class="vc-filter-toggle">' +
        '<button id="vf-upcoming" class="vc-filter-btn' + (viewingsFilter === 'upcoming' ? ' active' : '') + '" onclick="setViewingsFilter(\'upcoming\')">Upcoming</button>' +
        '<button id="vf-viewed"   class="vc-filter-btn' + (viewingsFilter === 'viewed'   ? ' active' : '') + '" onclick="setViewingsFilter(\'viewed\')">Viewed</button>' +
      '</div>' +

      '<div id="vc-calendar">' + buildCalendar(viewingCalYear, viewingCalMonth) + '</div>' +

      '<div id="vc-day-panel"></div>' +

      '<div id="vc-add-wrap" style="display:none">' +
        '<form id="viewing-add-form" onsubmit="viewingsSubmitForm(event)" class="vc-form">' +
          '<div class="vc-form-field" style="position:relative">' +
            '<label>Address</label>' +
            '<input type="text" name="address" placeholder="42 Riverside Walk, W6 9LL" required' +
              ' oninput="viewingsAddressKeyup(this)" onblur="viewingsHideSuggestions()" autocomplete="off">' +
            '<div id="vc-address-suggestions"></div>' +
          '</div>' +
          '<div class="vc-form-field">' +
            '<label>Area <span style="font-weight:400;color:var(--ink-ghost)">(optional — auto-filled from address)</span></label>' +
            '<select name="area">' + buildAreaOptions() + '</select>' +
          '</div>' +
          '<div class="vc-form-row">' +
            '<div class="vc-form-field">' +
              '<label>Date</label>' +
              '<input type="date" name="date" required min="' + viewingsTodayISO() + '">' +
            '</div>' +
            '<div class="vc-form-field">' +
              '<label>Time</label>' +
              '<input type="text" name="time" placeholder="14:20" maxlength="5">' +
            '</div>' +
          '</div>' +
          '<div class="vc-form-field">' +
            '<label>Asking Price <span style="font-weight:400;color:var(--ink-ghost)">(optional)</span></label>' +
            '<select name="price">' + buildPriceOptions() + '</select>' +
          '</div>' +
          '<div class="vc-form-field">' +
            '<label>Agent <span style="font-weight:400;color:var(--ink-ghost)">(optional)</span></label>' +
            '<input type="text" name="agentName" placeholder="Savills">' +
          '</div>' +
          '<div class="vc-form-field">' +
            '<label>Listing URL <span style="font-weight:400;color:var(--ink-ghost)">(optional)</span></label>' +
            '<input type="url" name="listingUrl" placeholder="https://rightmove.co.uk/…">' +
          '</div>' +
          '<div class="vc-form-field">' +
            '<label>Notes <span style="font-weight:400;color:var(--ink-ghost)">(optional)</span></label>' +
            '<textarea name="notes" rows="2" placeholder="First impressions…" style="width:100%;resize:vertical;border:1px solid var(--rule);border-bottom:2px solid var(--ink);padding:8px 10px;font-size:12px;font-family:inherit;background:var(--cream);outline:none;border-radius:0"></textarea>' +
          '</div>' +
          '<button type="submit" id="viewing-save-btn" class="save-btn" style="width:100%;margin-top:4px">💾 Save viewing</button>' +
        '</form>' +
      '</div>' +
    '</div>';

  // Render selected day panel
  if (viewingSelectedDate) renderDayPanel(viewingSelectedDate);
}
window.renderViewingsTab = renderViewingsTab;

function viewingsSubmitForm(e) {
  e.preventDefault();
  var form = e.target;
  var data = {
    address:    form.address.value.trim(),
    area:       form.area.value,
    date:       form.date.value,
    time:       form.time.value,
    price:      form.price.value,
    agentName:  form.agentName.value.trim(),
    listingUrl: form.listingUrl.value.trim(),
    notes:      form.notes.value.trim()
  };
  if (_viewingEditId) {
    updateViewing(_viewingEditId, data);
  } else {
    saveViewing(data);
  }
}
window.viewingsSubmitForm = viewingsSubmitForm;

// ── Viewings filter toggle ────────────────────────────────────

function setViewingsFilter(f) {
  viewingsFilter = f;
  ['upcoming', 'viewed'].forEach(function(name) {
    var btn = document.getElementById('vf-' + name);
    if (btn) btn.className = 'vc-filter-btn' + (name === f ? ' active' : '');
  });
  viewingSelectedDate = null;
  var calEl = document.getElementById('vc-calendar');
  if (calEl) calEl.innerHTML = buildCalendar(viewingCalYear, viewingCalMonth);
  var panel = document.getElementById('vc-day-panel');
  if (panel) panel.innerHTML = '';
}
window.setViewingsFilter = setViewingsFilter;

// ── Shortlist ─────────────────────────────────────────────────

function addToShortlist(id) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) { alert('Sign in to shortlist properties.'); return; }
  firebase.database().ref('users/' + uid + '/viewings/' + id)
    .update({ shortlisted: true, rating: null, rankOrder: Date.now() });
}
window.addToShortlist = addToShortlist;

function removeFromShortlist(id) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  firebase.database().ref('users/' + uid + '/viewings/' + id)
    .update({ shortlisted: false, rating: null });
}
window.removeFromShortlist = removeFromShortlist;

function setShortlistRating(id, score) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  firebase.database().ref('users/' + uid + '/viewings/' + id)
    .update({ rating: score })
    .then(function() { setTimeout(checkForTies, 300); });
}
window.setShortlistRating = setShortlistRating;

function resolveTie(winnerId, loserId) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  resolvedTiePairs[winnerId + '|' + loserId] = true;
  resolvedTiePairs[loserId + '|' + winnerId] = true;
  var loser = window.viewingsCache[loserId];
  var newRankOrder = loser ? (loser.rankOrder || Date.now()) - 1 : Date.now() - 1;
  firebase.database().ref('users/' + uid + '/viewings/' + winnerId)
    .update({ rankOrder: newRankOrder })
    .then(function() {
      var wrap = document.getElementById('sl-tinder-wrap');
      if (wrap) wrap.style.display = 'none';
      setTimeout(checkForTies, 300);
    });
}
window.resolveTie = resolveTie;

function checkForTies() {
  var shortlisted = Object.keys(window.viewingsCache)
    .map(function(id) { return Object.assign({ _id: id }, window.viewingsCache[id]); })
    .filter(function(v) { return v.shortlisted && v.rating != null; });

  var byRating = {};
  shortlisted.forEach(function(v) {
    if (!byRating[v.rating]) byRating[v.rating] = [];
    byRating[v.rating].push(v);
  });

  var pair = null;
  Object.keys(byRating).forEach(function(r) {
    if (pair) return;
    var group = byRating[r];
    for (var i = 0; i < group.length && !pair; i++) {
      for (var j = i + 1; j < group.length && !pair; j++) {
        var key = group[i]._id + '|' + group[j]._id;
        if (!resolvedTiePairs[key]) pair = [group[i], group[j]];
      }
    }
  });

  var wrap = document.getElementById('sl-tinder-wrap');
  if (!wrap) return;

  if (!pair) { wrap.style.display = 'none'; return; }

  var a = pair[0], b = pair[1];
  wrap.style.display = 'block';
  wrap.innerHTML =
    '<div class="sl-tinder">' +
      '<div class="sl-tinder-header">Both scored ' + a.rating + '/10 — which would you rather buy?</div>' +
      '<div class="sl-tinder-row">' +
        '<div class="sl-tinder-cell">' +
          '<div class="sl-tinder-addr">' + viewingsEscape(a.address || a.area || 'Property A') + '</div>' +
          '<div class="sl-tinder-notes">' + viewingsEscape((a.notes || 'No notes added').substring(0, 80)) + '</div>' +
          '<button class="sl-tinder-btn" onclick="resolveTie(\'' + a._id + '\',\'' + b._id + '\')">Prefer this ↑</button>' +
        '</div>' +
        '<div class="sl-tinder-cell">' +
          '<div class="sl-tinder-addr">' + viewingsEscape(b.address || b.area || 'Property B') + '</div>' +
          '<div class="sl-tinder-notes">' + viewingsEscape((b.notes || 'No notes added').substring(0, 80)) + '</div>' +
          '<button class="sl-tinder-btn" onclick="resolveTie(\'' + b._id + '\',\'' + a._id + '\')">Prefer this ↑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// ── Shortlist tab renderer ────────────────────────────────────

function renderShortlistTab() {
  var container = document.getElementById('content-shortlist');
  if (!container) return;

  var shortlisted = Object.keys(window.viewingsCache)
    .map(function(id) { return Object.assign({ _id: id }, window.viewingsCache[id]); })
    .filter(function(v) { return v.shortlisted; });

  if (!shortlisted.length) {
    container.innerHTML =
      '<div class="vc-wrap">' +
        '<div class="vc-topbar"><span class="section-title" style="margin:0">⭐ Star Properties</span></div>' +
        '<div style="padding:24px 16px;text-align:center;color:var(--ink-ghost);font-size:12px;line-height:1.8">' +
          'No starred properties yet.<br>Mark a viewing as Done, then tap ⭐ Star.' +
        '</div>' +
      '</div>';
    return;
  }

  shortlisted.sort(function(a, b) {
    if (a.rating == null && b.rating == null) return 0;
    if (a.rating == null) return 1;
    if (b.rating == null) return -1;
    if (b.rating !== a.rating) return b.rating - a.rating;
    return (a.rankOrder || 0) - (b.rankOrder || 0);
  });

  var leagueRows = shortlisted.map(function(v, i) {
    var isRated = v.rating != null;
    var rank = isRated ? '#' + (i + 1) : '—';
    var scoreLabel = isRated ? v.rating + '/10' : 'Unrated';
    var barWidth = isRated ? (v.rating / 10 * 100) + '%' : '0%';
    var barColor = isRated
      ? (v.rating >= 8 ? '#22c55e' : v.rating >= 5 ? 'var(--copper)' : '#ef4444')
      : 'var(--rule)';
    return '<div class="sl-league-row">' +
      '<div class="sl-league-meta">' +
        '<span><span class="sl-league-rank">' + rank + '</span>' + viewingsEscape(v.address || v.area || 'Unknown') + '</span>' +
        '<span style="color:' + barColor + ';font-weight:700">' + scoreLabel + '</span>' +
      '</div>' +
      '<div class="sl-score-bar-wrap"><div class="sl-score-bar" style="width:' + barWidth + ';background:' + barColor + '"></div></div>' +
    '</div>';
  }).join('');

  var cardsHtml = shortlisted.map(function(v) {
    var safeId = v._id.replace(/'/g, "\\'");
    var metaLine = [viewingsFmtDate(v.date), viewingsFmtPrice(v.price)].filter(Boolean).join(' · ');
    var notes = v.notes ? v.notes.substring(0, 120) + (v.notes.length > 120 ? '…' : '') : '';
    var dots = '';
    for (var d = 1; d <= 10; d++) {
      dots += '<div class="sl-rating-dot' + (v.rating === d ? ' active' : '') + '" onclick="setShortlistRating(\'' + safeId + '\',' + d + ')">' + d + '</div>';
    }
    return '<div class="sl-card">' +
      '<div class="sl-card-addr">🏠 ' + viewingsEscape(v.address || v.area || 'No address') + '</div>' +
      (metaLine ? '<div class="sl-card-meta">' + viewingsEscape(metaLine) + '</div>' : '') +
      (notes ? '<div class="sl-card-notes">"' + viewingsEscape(notes) + '"</div>' : '') +
      '<div class="sl-rating">' + dots + '</div>' +
      '<button class="vw-btn vw-btn-del" style="font-size:11px" onclick="removeFromShortlist(\'' + safeId + '\')">Remove</button>' +
    '</div>';
  }).join('');

  container.innerHTML =
    '<div class="vc-wrap">' +
      '<div class="vc-topbar"><span class="section-title" style="margin:0">⭐ Star Properties</span></div>' +
      '<div class="sl-league">' + leagueRows + '</div>' +
      '<div id="sl-tinder-wrap" style="display:none"></div>' +
      cardsHtml +
    '</div>';

  checkForTies();
}
window.renderShortlistTab = renderShortlistTab;

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  // Render empty tab so calendar shows immediately (even before login)
  renderViewingsTab();
});
