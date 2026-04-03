/**
 * viewings.js
 * ─────────────────────────────────────────────────────────────
 * Viewing tracker for nest.finder
 * Handles: Firebase CRUD, Nominatim geocoding, month calendar,
 *          scrollable day panel, map pins via nfLayers.viewings
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

window.viewingsCache  = {};  // { pushId: viewingObject }
window.wishlistCache  = {};  // { pushId: wishlistItem }
window.nonNegotiables = [];  // ordered list of must-have strings

var _viewingEditId  = null;  // set when editing an existing viewing
var _pendingDoneId  = null;  // viewing to mark done after NN setup
var nnNotesTimers   = {};    // debounce timers for notes saves

var NN_SUGGESTIONS = ['Garden', 'Two bathrooms', 'Large living space', 'Off-street parking', 'Second bedroom'];

var viewingCalOffset = 0;        // days from today to start the 14-day window (steps of 7)
var viewingSelectedDate = null;  // "YYYY-MM-DD" highlighted on the calendar
var viewingNavIndex  = 0;        // index in the sorted filtered viewings list
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
    if (typeof renderShortlistTab === 'function') renderShortlistTab();
    renderViewingPins();
    console.log('[Viewings] Loaded', Object.keys(window.viewingsCache).length, 'viewings');
  });
}
window.loadViewingsFromFirebase = loadViewingsFromFirebase;

// ── Wishlist Firebase ─────────────────────────────────────────

function loadWishlistFromFirebase(uid) {
  if (typeof firebase === 'undefined') return;
  firebase.database().ref('users/' + uid + '/wishlist').on('value', function(snap) {
    window.wishlistCache = snap.val() || {};
    if (viewingsFilter === 'wishlist') renderViewingsTab();
    renderWishlistPins();
  });
}
window.loadWishlistFromFirebase = loadWishlistFromFirebase;

function saveWishlistItem(data) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  var btn = document.getElementById('wl-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  function proceed(lat, lng) {
    var payload = {
      address:   data.address || '',
      price:     data.price   || '',
      url:       data.url     || '',
      lat:       lat,
      lng:       lng,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    firebase.database().ref('users/' + uid + '/wishlist').push(payload)
      .then(function() {
        toggleWishlistForm(false);
        var f = document.getElementById('wishlist-add-form');
        if (f) { f.reset(); f._geocodedLat = null; f._geocodedLng = null; }
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save'; }
      })
      .catch(function() {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save'; }
      });
  }

  var form = document.getElementById('wishlist-add-form');
  if (form && form._geocodedLat && form._geocodedLng) {
    proceed(form._geocodedLat, form._geocodedLng);
  } else {
    geocodeAddress(data.address, null, proceed);
  }
}

function deleteWishlistItem(id) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  firebase.database().ref('users/' + uid + '/wishlist/' + id).remove();
}
window.deleteWishlistItem = deleteWishlistItem;

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

function _nnAddRow(value) {
  var list = document.getElementById('nn-input-list');
  if (!list) return;
  var row = document.createElement('div');
  row.className = 'nn-input-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center';
  var inp = document.createElement('input');
  inp.className = 'nn-setup-input';
  inp.type = 'text';
  inp.placeholder = 'Must-have';
  inp.style.flex = '1';
  inp.value = value || '';
  var del = document.createElement('button');
  del.type = 'button';
  del.textContent = '✕';
  del.style.cssText = 'background:transparent;border:none;color:var(--ink-ghost);cursor:pointer;font-size:14px;padding:0 4px;flex-shrink:0';
  del.onclick = function() { row.remove(); };
  row.appendChild(inp);
  row.appendChild(del);
  list.appendChild(row);
  inp.focus();
}
window._nnAddRow = _nnAddRow;

function showNNSetupModal() {
  var existing = document.getElementById('nn-setup-overlay');
  if (existing) existing.remove();

  var chips = NN_SUGGESTIONS.map(function(s) {
    return '<button type="button" class="nn-chip" onclick="fillNNSuggestion(this,\'' + viewingsEscape(s) + '\')">' + viewingsEscape(s) + '</button>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.id = 'nn-setup-overlay';
  overlay.className = 'lm-overlay';
  overlay.innerHTML =
    '<div class="lm-modal">' +
      '<div class="lm-header"><span>Your must-haves</span><button class="lm-close" onclick="closeNNSetupModal()">✕</button></div>' +
      '<div style="padding:16px">' +
        '<p style="font-size:12px;color:var(--ink-mid);margin:0 0 12px">What are your non-negotiables? Add as many as you like.</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">' + chips + '</div>' +
        '<div id="nn-input-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px"></div>' +
        '<button type="button" onclick="_nnAddRow()" style="background:transparent;border:1px dashed var(--rule);color:var(--ink-mid);font-size:11px;padding:6px 12px;border-radius:6px;cursor:pointer;width:100%;font-family:inherit;margin-bottom:14px">+ Add another</button>' +
        '<button type="button" class="save-btn" style="width:100%" onclick="submitNNSetup()">💾 Save must-haves</button>' +
        '<button type="button" style="width:100%;margin-top:8px;background:transparent;border:none;font-size:11px;color:var(--ink-ghost);cursor:pointer;font-family:inherit" onclick="closeNNSetupModal()">Skip for now</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeNNSetupModal(); });

  // Pre-fill existing must-haves, or start with one empty row
  if (window.nonNegotiables.length > 0) {
    window.nonNegotiables.forEach(function(item) { _nnAddRow(item); });
  } else {
    _nnAddRow('');
  }
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
  var list = document.getElementById('nn-input-list');
  if (list) {
    list.querySelectorAll('input').forEach(function(inp) {
      if (inp.value.trim()) items.push(inp.value.trim());
    });
  }
  saveNonNegotiables(items);
}
window.submitNNSetup = submitNNSetup;

function fillNNSuggestion(btn, text) {
  var list = document.getElementById('nn-input-list');
  if (!list) return;
  var inputs = list.querySelectorAll('input');
  for (var i = 0; i < inputs.length; i++) {
    if (!inputs[i].value.trim()) {
      inputs[i].value = text;
      btn.disabled = true;
      btn.style.opacity = '0.4';
      return;
    }
  }
  // All rows are filled — add a new one
  _nnAddRow(text);
  btn.disabled = true;
  btn.style.opacity = '0.4';
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

// ── Wishlist address autocomplete ─────────────────────────────
var wishlistAddressTimer = null;

function wishlistAddressKeyup(input) {
  clearTimeout(wishlistAddressTimer);
  var q = input.value.trim();
  if (q.length < 3) { wishlistHideSuggestions(); return; }
  wishlistAddressTimer = setTimeout(function() {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=gb&q='
      + encodeURIComponent(q);
    fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'Nestr/1.0' } })
      .then(function(r) { return r.json(); })
      .then(function(results) { wishlistShowSuggestions(results); })
      .catch(function() {});
  }, 400);
}
window.wishlistAddressKeyup = wishlistAddressKeyup;

function wishlistShowSuggestions(results) {
  var box = document.getElementById('wl-address-suggestions');
  if (!box || !results.length) { wishlistHideSuggestions(); return; }
  box.innerHTML = results.map(function(r, i) {
    return '<div class="vc-suggestion" onmousedown="wishlistPickSuggestion(' + i + ')">'
      + viewingsEscape(r.display_name) + '</div>';
  }).join('');
  box._results = results;
  box.style.display = 'block';
}

function wishlistPickSuggestion(i) {
  var box = document.getElementById('wl-address-suggestions');
  var r = box._results && box._results[i];
  if (!r) return;
  var addrInput = document.querySelector('#wishlist-add-form input[name="address"]');
  if (addrInput) addrInput.value = r.display_name;
  wishlistHideSuggestions();
  var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
  var form = document.getElementById('wishlist-add-form');
  if (form) { form._geocodedLat = lat; form._geocodedLng = lng; }
}
window.wishlistPickSuggestion = wishlistPickSuggestion;

function wishlistHideSuggestions() {
  var box = document.getElementById('wl-address-suggestions');
  if (box) box.style.display = 'none';
}
window.wishlistHideSuggestions = wishlistHideSuggestions;

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

function _viewingPinColour(status) {
  if (status === 'viewed') return '#6b7280';
  return '#3b82f6'; // scheduled / upcoming
}

function _makePinIcon(colour) {
  return L.divIcon({
    html: '<div style="' +
      'background:' + colour + ';color:#fff;border:2px solid #fff;' +
      'border-radius:5px 5px 0 0;width:26px;height:26px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.45);' +
      'position:relative;' +
      '">🏠</div>' +
      '<div style="' +
      'width:0;height:0;border-left:5px solid transparent;' +
      'border-right:5px solid transparent;border-top:6px solid ' + colour + ';' +
      'margin:0 auto;' +
      '"></div>',
    className: '',
    iconSize: [26, 32],
    iconAnchor: [13, 32],
    popupAnchor: [0, -34]
  });
}

function renderViewingPins() {
  var layer = window.nfLayers && window.nfLayers.viewings;
  if (!layer) return;
  layer.clearLayers();

  Object.keys(window.viewingsCache).forEach(function(id) {
    var v = window.viewingsCache[id];
    if (!v.lat || !v.lng) return;

    var icon = _makePinIcon(_viewingPinColour(v.status));

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

function renderWishlistPins() {
  var layer = window.nfLayers && window.nfLayers.wishlist;
  if (!layer) return;
  layer.clearLayers();

  Object.keys(window.wishlistCache).forEach(function(id) {
    var w = window.wishlistCache[id];
    if (!w.lat || !w.lng) return;

    var icon = _makePinIcon('#f59e0b');
    var priceLabel = viewingsFmtPrice(w.price);
    var popupLines = [
      '<b>' + viewingsEscape(w.address || 'Property') + '</b>',
      priceLabel,
      w.url ? '<a href="' + viewingsEscape(w.url) + '" target="_blank" style="color:#f59e0b">View listing ↗</a>' : ''
    ].filter(Boolean).join('<br>');

    var marker = L.marker([w.lat, w.lng], { icon: icon })
      .bindPopup(popupLines, { maxWidth: 220 })
      .addTo(layer);

    marker.on('click', function() {
      switchTab('viewings');
      setViewingsFilter('wishlist');
    });
  });
}
window.renderWishlistPins = renderWishlistPins;

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

function buildCalendar() {
  var today = viewingsTodayISO();
  var todayMs = new Date(today).getTime();
  var counts = viewingsCountByDate();

  var monthAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Always start from the Monday of the week that is (viewingCalOffset) days from today.
  // This keeps the grid perfectly aligned and exactly 2 rows (14 cells).
  var refMs  = todayMs + viewingCalOffset * 86400000;
  var refDay = new Date(refMs).getDay(); // 0=Sun … 6=Sat
  var daysToMonday = (refDay + 6) % 7;  // days to subtract to reach the Monday of this week
  var startMs = refMs - daysToMonday * 86400000;

  // Title: date range of the 14-day window
  var startDate = new Date(startMs);
  var endDate   = new Date(startMs + 13 * 86400000);
  var title = startDate.getDate() + ' ' + monthAbbr[startDate.getMonth()] +
    ' – ' + endDate.getDate() + ' ' + monthAbbr[endDate.getMonth()];

  var html = '<div class="vc-header">' +
    '<button class="vc-nav" onclick="viewingsNavWeek(-1)">&#8592;</button>' +
    '<span class="vc-title">' + title + '</span>' +
    '<button class="vc-nav" onclick="viewingsNavWeek(1)">&#8594;</button>' +
    '</div>';

  html += '<div class="vc-grid">';
  ['Mo','Tu','We','Th','Fr','Sa','Su'].forEach(function(d) {
    html += '<div class="vc-dow">' + d + '</div>';
  });

  for (var i = 0; i < 14; i++) {
    var cellDate = new Date(startMs + i * 86400000);
    var y  = cellDate.getFullYear();
    var m  = String(cellDate.getMonth() + 1).padStart(2, '0');
    var d  = String(cellDate.getDate()).padStart(2, '0');
    var isoDate = y + '-' + m + '-' + d;
    var count = counts[isoDate] || 0;

    var colourClass = '';
    if      (count >= 5) colourClass = 'vc-day-red';
    else if (count >= 3) colourClass = 'vc-day-amber';
    else if (count >= 1) colourClass = 'vc-day-green';

    var todayClass    = isoDate === today ? ' vc-today' : '';
    var selectedClass = isoDate === viewingSelectedDate ? ' vc-selected' : '';

    html += '<div class="vc-day' + (colourClass ? ' ' + colourClass : '') + todayClass + selectedClass +
      '" onclick="viewingsSelectDay(\'' + isoDate + '\')">' + cellDate.getDate() + '</div>';
  }

  html += '</div>';
  return html;
}

function viewingsNavWeek(delta) {
  viewingCalOffset += delta * 7;
  var calEl = document.getElementById('vc-calendar');
  if (calEl) calEl.innerHTML = buildCalendar();
}
window.viewingsNavWeek = viewingsNavWeek;

// Jump calendar so the window's Monday-week contains the given date
function viewingsEnsureDateVisible(isoDate) {
  var today = viewingsTodayISO();
  var todayMs = new Date(today).getTime();
  var targetMs = new Date(isoDate).getTime();
  var dayDiff = Math.round((targetMs - todayMs) / 86400000);
  // Compute what the current window's start Monday actually is
  var refMs = todayMs + viewingCalOffset * 86400000;
  var refDay = new Date(refMs).getDay();
  var windowStart = viewingCalOffset - ((refDay + 6) % 7); // offset of Monday
  if (dayDiff < windowStart || dayDiff >= windowStart + 14) {
    viewingCalOffset = dayDiff; // set ref to target date; buildCalendar will snap to its Monday
  }
}

function viewingsSelectDay(dateStr) {
  // Find the first viewing on this date in the sorted list and jump to it
  var all = getSortedViewings();
  var idx = -1;
  for (var i = 0; i < all.length; i++) {
    if (all[i].date === dateStr) { idx = i; break; }
  }
  if (idx >= 0) {
    viewingNavIndex = idx;
  }
  viewingSelectedDate = dateStr;
  var calEl = document.getElementById('vc-calendar');
  if (calEl) calEl.innerHTML = buildCalendar();
  renderDayPanel();
}
window.viewingsSelectDay = viewingsSelectDay;

// Returns all viewings for the current filter, sorted by date then time
function getSortedViewings() {
  return Object.keys(window.viewingsCache)
    .map(function(id) { return Object.assign({ _id: id }, window.viewingsCache[id]); })
    .filter(function(v) {
      return viewingsFilter === 'viewed'
        ? v.status === 'viewed'
        : v.status === 'scheduled' || !v.status;
    })
    .sort(function(a, b) {
      var dateCmp = (a.date || '').localeCompare(b.date || '');
      return dateCmp !== 0 ? dateCmp : (a.time || '').localeCompare(b.time || '');
    });
}
window.getSortedViewings = getSortedViewings;

function viewingsNavCard(delta) {
  var all = getSortedViewings();
  viewingNavIndex = Math.max(0, Math.min(viewingNavIndex + delta, all.length - 1));
  // Keep calendar in sync with the viewing now shown
  if (all[viewingNavIndex]) {
    viewingSelectedDate = all[viewingNavIndex].date;
    viewingsEnsureDateVisible(viewingSelectedDate);
    var calEl = document.getElementById('vc-calendar');
    if (calEl) calEl.innerHTML = buildCalendar();
  }
  renderDayPanel();
}
window.viewingsNavCard = viewingsNavCard;

function renderDayPanel() {
  var panel = document.getElementById('vc-day-panel');
  if (!panel) return;

  var all = getSortedViewings();

  if (!all.length) {
    var emptyLabel = viewingsFilter === 'viewed' ? 'No viewed properties yet.' : 'No upcoming viewings yet.';
    panel.innerHTML =
      '<div class="vc-card-content" style="display:flex;align-items:center;justify-content:center">' +
        '<div style="font-size:12px;color:var(--ink-ghost);text-align:center;line-height:1.8">' + emptyLabel + '<br>Tap + Add to get started.</div>' +
      '</div>';
    return;
  }

  // Clamp index
  viewingNavIndex = Math.max(0, Math.min(viewingNavIndex, all.length - 1));
  var v = all[viewingNavIndex];

  var statusLabel = v.status === 'viewed' ? '✓ Viewed' : v.status === 'skipped' ? '✕ Skipped' : '';
  var statusBadge = statusLabel ? '<span class="vw-status-badge vw-status-' + v.status + '">' + statusLabel + '</span>' : '';
  if (v.shortlisted) statusBadge += '<span class="vw-shortlisted-badge">⭐ Starred</span>';

  var metaLine = [viewingsFmtDate(v.date), viewingsFmtTime(v.time), viewingsFmtPrice(v.price)].filter(Boolean).join(' · ');
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
      '<textarea class="nn-notes" id="nn-notes-' + v._id + '" placeholder="Any other thoughts…">' + viewingsEscape(v.nnNotes || '') + '</textarea>' +
      '<button class="vw-btn" style="margin-top:6px;width:100%;font-size:11px" onclick="saveNNNotes(\'' + v._id + '\',document.getElementById(\'nn-notes-' + v._id + '\').value)">💾 Save notes</button>' +
    '</div>';
  }

  var cardHtml = '<div class="vw-card" style="border:none;border-radius:0;background:transparent;padding:0">' +
    '<div class="vw-card-address">🏠 ' + viewingsEscape(v.address || v.area || 'No address') + '</div>' +
    (metaLine ? '<div class="vw-card-meta">' + viewingsEscape(metaLine) + '</div>' : '') +
    (agentLine ? '<div class="vw-card-agent">' + viewingsEscape(agentLine) + '</div>' : '') +
    approxNote +
    statusBadge +
    (listingBtn ? '<div style="margin-top:6px">' + listingBtn + '</div>' : '') +
    '<div class="vw-card-actions">' + actionBtns + '</div>' +
    nnHtml +
    '</div>';

  var prevDisabled = viewingNavIndex === 0 ? ' disabled' : '';
  var nextDisabled = viewingNavIndex === all.length - 1 ? ' disabled' : '';
  var navHtml =
    '<div class="vc-card-nav">' +
      '<button class="vc-card-nav-btn"' + prevDisabled + ' onclick="viewingsNavCard(-1)">&#8592; Prev</button>' +
      '<span>' + (viewingNavIndex + 1) + ' of ' + all.length + '</span>' +
      '<button class="vc-card-nav-btn"' + nextDisabled + ' onclick="viewingsNavCard(1)">Next &#8594;</button>' +
    '</div>';

  panel.innerHTML =
    '<div class="vc-card-content">' + cardHtml + '</div>' +
    navHtml;
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

function toggleWishlistForm(forceState) {
  var wrap = document.getElementById('wl-add-wrap');
  if (!wrap) return;
  var show = (forceState !== undefined) ? forceState : wrap.style.display === 'none';
  wrap.style.display = show ? 'block' : 'none';
  var btn = document.getElementById('wl-add-btn');
  if (btn) btn.textContent = show ? '✕ Cancel' : '+ Add';
  if (!show) {
    var f = document.getElementById('wishlist-add-form');
    if (f) { f.reset(); f._geocodedLat = null; f._geocodedLng = null; }
  }
}
window.toggleWishlistForm = toggleWishlistForm;

function wishlistSubmitForm(e) {
  e.preventDefault();
  var form = e.target;
  saveWishlistItem({
    address: form.address.value.trim(),
    price:   form.price.value,
    url:     form.url.value.trim()
  });
}
window.wishlistSubmitForm = wishlistSubmitForm;

function buildWishlistSection() {
  var items = Object.keys(window.wishlistCache).map(function(id) {
    return Object.assign({ _id: id }, window.wishlistCache[id]);
  }).sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });

  var listHtml = items.length ? items.map(function(w) {
    var safeId = viewingsEscape(w._id);
    var priceLabel = viewingsFmtPrice(w.price);
    var urlHtml = w.url
      ? '<a href="' + viewingsEscape(w.url) + '" target="_blank" class="vw-listing-link" style="font-size:11px">View listing ↗</a>'
      : '';
    return '<div class="vw-card" style="border-left:3px solid #f59e0b">' +
      '<div class="vw-card-address">🏠 ' + viewingsEscape(w.address || 'No address') + '</div>' +
      (priceLabel ? '<div class="vw-card-meta">' + viewingsEscape(priceLabel) + '</div>' : '') +
      (urlHtml ? '<div style="margin-top:4px">' + urlHtml + '</div>' : '') +
      '<button class="vw-btn vw-btn-del" style="margin-top:8px;font-size:11px" onclick="deleteWishlistItem(\'' + safeId + '\')">✕ Remove</button>' +
      '</div>';
  }).join('') : '<div style="text-align:center;color:var(--ink-ghost);font-size:12px;padding:24px 0">No properties added yet</div>';

  return '<div id="wl-add-wrap" style="display:none;border-bottom:1px solid var(--rule);padding:12px">' +
    '<form id="wishlist-add-form" onsubmit="wishlistSubmitForm(event)" class="vc-form" style="gap:10px">' +
      '<div class="vc-form-field" style="position:relative">' +
        '<label>Address</label>' +
        '<input type="text" name="address" placeholder="42 Riverside Walk, W6 9LL" required' +
          ' oninput="wishlistAddressKeyup(this)" onblur="wishlistHideSuggestions()" autocomplete="off">' +
        '<div id="wl-address-suggestions"></div>' +
      '</div>' +
      '<div class="vc-form-field">' +
        '<label>Asking Price <span style="font-weight:400;color:var(--ink-ghost)">(optional)</span></label>' +
        '<select name="price">' + buildPriceOptions() + '</select>' +
      '</div>' +
      '<div class="vc-form-field">' +
        '<label>Listing URL <span style="font-weight:400;color:var(--ink-ghost)">(optional)</span></label>' +
        '<input type="url" name="url" placeholder="https://rightmove.co.uk/…">' +
      '</div>' +
      '<button type="submit" id="wl-save-btn" class="save-btn" style="width:100%;margin-top:4px">💾 Save</button>' +
    '</form>' +
  '</div>' +
  '<div id="wl-list" style="padding:8px 0">' + listHtml + '</div>';
}


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

  var isWishlist = viewingsFilter === 'wishlist';

  container.innerHTML =
    '<div class="vc-wrap">' +
      '<div class="vc-topbar">' +
        '<span class="section-title" style="margin:0">📅 Viewings</span>' +
        '<div style="display:flex;gap:6px">' +
          (isWishlist
            ? '<button id="wl-add-btn" class="vc-add-btn" onclick="toggleWishlistForm()">+ Add</button>'
            : '<button class="vc-add-btn" style="font-size:10px;background:transparent;border-color:var(--rule);color:var(--ink-mid)" onclick="showNNSetupModal()">Must-haves</button>' +
              '<button id="vc-add-btn" class="vc-add-btn" onclick="toggleAddForm()">+ Add</button>'
          ) +
        '</div>' +
      '</div>' +

      '<div class="vc-filter-toggle">' +
        '<button id="vf-upcoming"  class="vc-filter-btn' + (viewingsFilter === 'upcoming'  ? ' active' : '') + '" onclick="setViewingsFilter(\'upcoming\')">Upcoming</button>' +
        '<button id="vf-viewed"    class="vc-filter-btn' + (viewingsFilter === 'viewed'    ? ' active' : '') + '" onclick="setViewingsFilter(\'viewed\')">Viewed</button>' +
        '<button id="vf-wishlist"  class="vc-filter-btn' + (viewingsFilter === 'wishlist'  ? ' active' : '') + '" onclick="setViewingsFilter(\'wishlist\')">Want to view</button>' +
      '</div>' +

      (isWishlist
        ? buildWishlistSection()
        : '<div id="vc-calendar">' + buildCalendar() + '</div>' +
          '<div id="vc-add-wrap" style="display:none;flex-shrink:0;max-height:55%;overflow-y:auto;border-top:1px solid var(--rule)">' +
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

      '<div id="vc-day-panel"></div>'
      ) +
    '</div>';

  if (!isWishlist) renderDayPanel();
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
  viewingNavIndex = 0;
  viewingSelectedDate = null;
  // Full re-render so the wishlist / viewings sections swap in correctly
  renderViewingsTab();
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
