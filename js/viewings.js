/**
 * viewings.js
 * ─────────────────────────────────────────────────────────────
 * Viewing tracker for Maloca
 * Handles: Firebase CRUD, Nominatim geocoding, month calendar,
 *          scrollable day panel, map pins via nfLayers.viewings
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

window.viewingsCache      = {};  // { pushId: viewingObject }
window.wishlistCache      = {};  // { pushId: wishlistItem }
window.wishlistOrderCache = [];  // ordered array of wishlist pushIds
window.nonNegotiables     = [];  // ordered list of must-have strings

var _viewingEditId            = null;  // set when editing an existing viewing
var _pendingDoneId            = null;  // viewing to mark done after NN setup
var _convertingFromWishlistId = null;  // wishlist item being converted to a viewing
var nnNotesTimers             = {};    // debounce timers for notes saves

var NN_SUGGESTIONS = ['Garden', 'Two bathrooms', 'Large living space', 'Off-street parking', 'Second bedroom'];

/**
 * downloadViewingICS(viewing)
 * Generates a .ics calendar file and triggers a browser download.
 * On iPhone/Mac this opens Apple Calendar; on Android it opens Google Calendar.
 */
function downloadViewingICS(viewing) {
  if (!viewing || !viewing.date) return;
  var dateParts = viewing.date.split('-');           // ["YYYY","MM","DD"]
  var rawTime   = viewing.time || '09:00';
  var timeParts = rawTime.split(':');                // ["HH","MM"]

  function pad(n) { return String(n).padStart(2, '0'); }

  // Local floating time (no Z suffix) so it lands at the right local time
  var dtStart  = dateParts[0] + dateParts[1] + dateParts[2] + 'T' + timeParts[0] + timeParts[1] + '00';
  // 30-minute viewing slot
  var startMins = parseInt(timeParts[0], 10) * 60 + parseInt(timeParts[1], 10);
  var endMins   = startMins + 30;
  var endHour   = pad(Math.floor(endMins / 60) % 24);
  var endMin    = pad(endMins % 60);
  var dtEnd     = dateParts[0] + dateParts[1] + dateParts[2] + 'T' + endHour + endMin + '00';

  var summary = 'Viewing: ' + (viewing.address || viewing.area || 'Property');
  var descParts = [];
  if (viewing.notes)      descParts.push(viewing.notes);
  if (viewing.agentName)  descParts.push('Agent: ' + viewing.agentName);
  if (viewing.listingUrl) descParts.push('Listing: ' + viewing.listingUrl);
  var description = descParts.join('\\n');

  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maloca//maloca.homes//EN',
    'BEGIN:VEVENT',
    'DTSTART:' + dtStart,
    'DTEND:' + dtEnd,
    'SUMMARY:' + summary,
    'LOCATION:' + (viewing.address || ''),
    description ? 'DESCRIPTION:' + description : null,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  var blob = new Blob([lines], { type: 'text/calendar' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'viewing.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
window.downloadViewingICS = downloadViewingICS;

// Trim a full Nominatim address string down to "house number + road, postcode"
// e.g. "42 Riverside Walk, Hammersmith, London Borough of..., W6 9LL" → "42 Riverside Walk, W6 9LL"
function trimAddress(addr) {
  if (!addr) return addr;
  var parts = addr.split(',').map(function(s) { return s.trim(); });
  var postcode = '';
  for (var i = parts.length - 1; i >= 0; i--) {
    if (/^[A-Z]{1,2}\d[\d A-Z]*\s*\d[A-Z]{2}$/i.test(parts[i])) {
      postcode = parts[i];
      break;
    }
  }
  var street = parts[0] || addr;
  return postcode ? street + ', ' + postcode : street;
}

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

function buildTenureOptions() {
  return '<option value="">Unknown</option>' +
    '<option value="freehold">Freehold</option>' +
    '<option value="share_of_freehold">Share of Freehold</option>' +
    '<option value="leasehold">Leasehold</option>';
}

function tenureLabel(tenure, leaseLength) {
  if (!tenure) return '';
  var labels = { freehold: 'Freehold', share_of_freehold: 'Share of Freehold', leasehold: 'Leasehold' };
  var label = labels[tenure] || tenure;
  if (leaseLength && tenure !== 'freehold') label += ' · ' + leaseLength + ' yrs';
  return label;
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
  firebase.database().ref('users/' + uid + '/wishlistOrder').on('value', function(snap) {
    window.wishlistOrderCache = snap.val() || [];
    if (viewingsFilter === 'wishlist') renderViewingsTab();
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
      address:     data.address     || '',
      price:       data.price       || '',
      url:         data.url         || '',
      tenure:      data.tenure      || '',
      leaseLength: data.leaseLength || '',
      lat:         lat,
      lng:         lng,
      timestamp:   firebase.database.ServerValue.TIMESTAMP
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
  // Remove from order array too
  var newOrder = (window.wishlistOrderCache || []).filter(function(x) { return x !== id; });
  firebase.database().ref('users/' + uid + '/wishlistOrder').set(newOrder.length ? newOrder : null);
}
window.deleteWishlistItem = deleteWishlistItem;

function saveWishlistOrder(ids) {
  var uid = typeof AuthManager !== 'undefined' && AuthManager.getDataUid && AuthManager.getDataUid();
  if (!uid) return;
  window.wishlistOrderCache = ids;
  firebase.database().ref('users/' + uid + '/wishlistOrder').set(ids.length ? ids : null);
}

function getOrderedWishlistItems() {
  var all = Object.keys(window.wishlistCache).map(function(id) {
    return Object.assign({ _id: id }, window.wishlistCache[id]);
  });
  var order = window.wishlistOrderCache || [];
  var ordered = [];
  order.forEach(function(id) {
    var item = all.find(function(i) { return i._id === id; });
    if (item) ordered.push(item);
  });
  // Append any items not yet in the order (e.g. newly added)
  all.forEach(function(item) {
    if (!ordered.find(function(i) { return i._id === item._id; })) {
      ordered.push(item);
    }
  });
  return ordered;
}

// ── Wishlist drag-to-reorder ──────────────────────────────────

var _wlDragSrc = null;

function _wlDragStart(e) {
  _wlDragSrc = this;
  e.dataTransfer.effectAllowed = 'move';
  this.classList.add('wl-card-dragging');
}
function _wlDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('#wl-list .vw-card').forEach(function(r) {
    r.classList.remove('wl-card-dragover');
  });
  this.classList.add('wl-card-dragover');
  return false;
}
function _wlDrop(e) {
  e.stopPropagation();
  if (_wlDragSrc === this) return false;
  var list = document.getElementById('wl-list');
  if (!list) return false;
  var cards = Array.from(list.querySelectorAll('.vw-card'));
  var si = cards.indexOf(_wlDragSrc);
  var di = cards.indexOf(this);
  list.insertBefore(_wlDragSrc, si < di ? this.nextSibling : this);
  // Save new order
  var newOrder = Array.from(list.querySelectorAll('.vw-card')).map(function(c) {
    return c.getAttribute('data-id');
  }).filter(Boolean);
  saveWishlistOrder(newOrder);
  return false;
}
function _wlDragEnd() {
  document.querySelectorAll('#wl-list .vw-card').forEach(function(r) {
    r.classList.remove('wl-card-dragging', 'wl-card-dragover');
  });
  _wlDragSrc = null;
}

// Convert a wishlist item into an upcoming viewing
function wishlistConvertToViewing(id) {
  var w = window.wishlistCache[id];
  if (!w) return;
  _convertingFromWishlistId = id;

  // Switch to upcoming tab (this rebuilds the DOM)
  setViewingsFilter('upcoming');

  // Show and populate the add form
  toggleAddForm(true);
  var form = document.getElementById('viewing-add-form');
  if (form) {
    form.address.value     = w.address     || '';
    form.price.value       = w.price       || '';
    form.listingUrl.value  = w.url         || '';
    form.tenure.value      = w.tenure      || '';
    form.leaseLength.value = w.leaseLength || '';
    if (w.lat && w.lng) { form._geocodedLat = w.lat; form._geocodedLng = w.lng; }
    // Auto-fill nearest area
    if (w.lat && w.lng) viewingsAutoSetArea(w.lat, w.lng);
  }
  var btn = document.getElementById('viewing-save-btn');
  if (btn) btn.textContent = '💾 Book viewing';

  var wrap = document.getElementById('vc-add-wrap');
  if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.wishlistConvertToViewing = wishlistConvertToViewing;

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
    var addedBy = (profile && profile.members && profile.members[0] && profile.members[0].name) || 'Someone';

    var payload = {
      address:     formData.address     || '',
      area:        formData.area        || '',
      date:        formData.date        || '',
      time:        formData.time        || '',
      price:       formData.price       || '',
      agentName:   formData.agentName   || '',
      listingUrl:  formData.listingUrl  || '',
      notes:       formData.notes       || '',
      tenure:      formData.tenure      || '',
      leaseLength: formData.leaseLength || '',
      status:      (formData.date && formData.date < viewingsTodayISO()) ? 'viewed' : 'scheduled',
      lat:         lat,
      lng:         lng,
      geocoded:    geocoded,
      addedBy:     addedBy,
      timestamp:  firebase.database.ServerValue.TIMESTAMP
    };

    firebase.database().ref('users/' + uid + '/viewings').push(payload)
      .then(function() {
        // If converting from a wishlist item, delete it now
        if (_convertingFromWishlistId) {
          deleteWishlistItem(_convertingFromWishlistId);
          _convertingFromWishlistId = null;
        }
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
      address:     data.address     || '',
      area:        data.area        || '',
      date:        data.date        || '',
      time:        data.time        || '',
      price:       data.price       || '',
      agentName:   data.agentName   || '',
      listingUrl:  data.listingUrl  || '',
      notes:       data.notes       || '',
      tenure:      data.tenure      || '',
      leaseLength: data.leaseLength || '',
      lat:         lat,
      lng:         lng,
      geocoded:    geocoded
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
  form.address.value     = v.address     || '';
  form.area.value        = v.area        || '';
  form.date.value        = v.date        || '';
  form.time.value        = v.time        || '';
  form.price.value       = v.price       || '';
  form.agentName.value   = v.agentName   || '';
  form.listingUrl.value  = v.listingUrl  || '';
  form.notes.value       = v.notes       || '';
  form.tenure.value      = v.tenure      || '';
  form.leaseLength.value = v.leaseLength || '';

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

// Drag-and-drop state for the NN setup modal
var _nnDragSrc = null;

function _nnDragStart(e) {
  _nnDragSrc = this;
  e.dataTransfer.effectAllowed = 'move';
  this.classList.add('nn-row-dragging');
}
function _nnDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('#nn-input-list .nn-input-row').forEach(function(r) {
    r.classList.remove('nn-row-dragover');
  });
  this.classList.add('nn-row-dragover');
  return false;
}
function _nnDrop(e) {
  e.stopPropagation();
  if (_nnDragSrc === this) return false;
  var list = document.getElementById('nn-input-list');
  if (!list) return false;
  var rows = Array.from(list.querySelectorAll('.nn-input-row'));
  var si = rows.indexOf(_nnDragSrc);
  var di = rows.indexOf(this);
  list.insertBefore(_nnDragSrc, si < di ? this.nextSibling : this);
  return false;
}
function _nnDragEnd() {
  document.querySelectorAll('#nn-input-list .nn-input-row').forEach(function(r) {
    r.classList.remove('nn-row-dragging', 'nn-row-dragover');
  });
  _nnDragSrc = null;
}

function loadNonNegotiablesFromFirebase(uid) {
  if (typeof firebase === 'undefined') return;
  firebase.database().ref('users/' + uid + '/nonNegotiables').on('value', function(snap) {
    var val = snap.val();
    window.nonNegotiables = (val && Array.isArray(val)) ? val.filter(Boolean) : [];
    if (viewingSelectedDate) renderDayPanel(viewingSelectedDate);
    if (typeof renderShortlistTab === 'function') renderShortlistTab();
    renderViewingPins(); // NN scores changed → top 3 ranking may have changed
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
  row.draggable = true;
  row.addEventListener('dragstart', _nnDragStart);
  row.addEventListener('dragover',  _nnDragOver);
  row.addEventListener('drop',      _nnDrop);
  row.addEventListener('dragend',   _nnDragEnd);

  var handle = document.createElement('span');
  handle.className = 'nn-drag-handle';
  handle.textContent = '⠿';
  handle.title = 'Drag to reorder';

  var inp = document.createElement('input');
  inp.className = 'nn-setup-input';
  inp.type = 'text';
  inp.placeholder = 'Must-have';
  inp.style.flex = '1';
  inp.value = value || '';

  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'nn-del-btn';
  del.textContent = '✕';
  del.onclick = function() { row.remove(); };

  row.appendChild(handle);
  row.appendChild(inp);
  row.appendChild(del);
  list.appendChild(row);
  if (!value) inp.focus();
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
        '<p style="font-size:12px;color:var(--ink-mid);margin:0 0 4px">Drag to reorder — <strong>top = most important</strong>, bottom = least. Order drives the score automatically.</p>' +
        '<p style="font-size:11px;color:var(--ink-ghost);margin:0 0 12px">On mobile, delete and re-add in your preferred order.</p>' +
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

// Calculates a ranking score (0.0–10.0) from the must-have tick results.
// Weights are derived from position using linear decay — top item counts most.
// Returns null if no must-haves are defined (caller falls back to manual rating).
function calculateNNScore(viewingId) {
  if (!window.nonNegotiables || window.nonNegotiables.length === 0) return null;
  var items = window.nonNegotiables;
  var n = items.length;
  var tri = n * (n + 1) / 2; // sum of [n, n-1, ..., 1]
  var v = window.viewingsCache[viewingId];
  var nnResults = (v && v.nnResults) || {};
  var earned = 0;
  items.forEach(function(item, i) {
    var w = (n - i) / tri; // position weight, e.g. for 3 items: 3/6, 2/6, 1/6
    if (nnResults[viewingsSanitize(item)] === true) earned += w;
  });
  return Math.round(earned * 100) / 10; // 0.0–10.0, one decimal place
}
window.calculateNNScore = calculateNNScore;

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

  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'Maloca/1.0' } })
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
    fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'Maloca/1.0' } })
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
    fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'Maloca/1.0' } })
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

function _makeSmallPinIcon(colour) {
  return L.divIcon({
    html: '<div style="' +
      'background:' + colour + ';color:#fff;border:1.5px solid #fff;' +
      'border-radius:3px 3px 0 0;width:18px;height:18px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'overflow:hidden;font-size:11px;line-height:1;' +
      'box-shadow:0 1px 4px rgba(0,0,0,0.3);' +
      '">🏠</div>' +
      '<div style="' +
      'width:0;height:0;border-left:4px solid transparent;' +
      'border-right:4px solid transparent;border-top:5px solid ' + colour + ';' +
      'margin:0 auto;' +
      '"></div>',
    className: '',
    iconSize: [18, 23],
    iconAnchor: [9, 23],
    popupAnchor: [0, -25]
  });
}

// Returns IDs of the top 3 viewed properties by score (for gold pin treatment).
// Only considers properties with a lat/lng — ones without a map location are excluded
// so they don't consume a slot while being invisible on the map.
function _getTop3ViewedIds() {
  var hasNN = window.nonNegotiables && window.nonNegotiables.length > 0;
  var viewed = Object.keys(window.viewingsCache || {})
    .map(function(id) { return Object.assign({ _id: id }, window.viewingsCache[id]); })
    .filter(function(v) { return v.status === 'viewed' && v.lat && v.lng; });
  viewed.forEach(function(v) {
    var nn = hasNN ? calculateNNScore(v._id) : null;
    v._effectiveScore = nn !== null ? nn : v.rating;
  });
  viewed.sort(function(a, b) {
    if (a._effectiveScore == null && b._effectiveScore == null) return 0;
    if (a._effectiveScore == null) return 1;
    if (b._effectiveScore == null) return -1;
    if (b._effectiveScore !== a._effectiveScore) return b._effectiveScore - a._effectiveScore;
    return (a.rankOrder || 0) - (b.rankOrder || 0);
  });
  return viewed
    .filter(function(v) { return v._effectiveScore != null; })
    .slice(0, 3)
    .map(function(v) { return v._id; });
}

function renderViewingPins() {
  var layer = window.nfLayers && window.nfLayers.viewings;
  if (!layer) return;
  layer.clearLayers();

  var top3Ids = _getTop3ViewedIds();

  Object.keys(window.viewingsCache).forEach(function(id) {
    var v = window.viewingsCache[id];
    if (!v.lat || !v.lng) return;

    var icon;
    if (v.status === 'viewed' && top3Ids.indexOf(id) !== -1) {
      // Top 3 rated: gold, full size to pop
      icon = _makePinIcon('#f59e0b');
    } else if (v.status === 'viewed') {
      icon = _makeSmallPinIcon('#6b7280');
    } else {
      icon = _makeSmallPinIcon('#3b82f6');
    }

    var dateLabel = viewingsFmtDate(v.date);
    var timeLabel = viewingsFmtTime(v.time);
    var priceLabel = viewingsFmtPrice(v.price);

    var popupLines = [
      '<b>' + viewingsEscape(trimAddress(v.address || v.area || 'Viewing')) + '</b>',
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

    var icon = _makeSmallPinIcon('#f9a8d4');
    var priceLabel = viewingsFmtPrice(w.price);
    var popupLines = [
      '<b>' + viewingsEscape(w.address || 'Property') + '</b>',
      priceLabel,
      w.url ? '<a href="' + viewingsEscape(w.url) + '" target="_blank" style="color:#f9a8d4">View listing ↗</a>' : ''
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
  var dowAbbr   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  // Start exactly on today + offset (always day-aligned, no week-snapping)
  var startMs   = todayMs + viewingCalOffset * 86400000;
  var startDate = new Date(startMs);
  var endDate   = new Date(startMs + 6 * 86400000);
  var title = startDate.getDate() + ' ' + monthAbbr[startDate.getMonth()] +
    ' – ' + endDate.getDate() + ' ' + monthAbbr[endDate.getMonth()];

  var html = '<div class="vc-header">' +
    '<button class="vc-nav" onclick="viewingsNavWeek(-1)">&#8592;</button>' +
    '<span class="vc-title">' + title + '</span>' +
    '<button class="vc-nav" onclick="viewingsNavWeek(1)">&#8594;</button>' +
    '</div>';

  html += '<div class="vc-grid">';

  // Day-of-week headers starting from today's actual day
  for (var h = 0; h < 7; h++) {
    var headerDay = new Date(startMs + h * 86400000).getDay();
    html += '<div class="vc-dow">' + dowAbbr[headerDay] + '</div>';
  }

  for (var i = 0; i < 7; i++) {
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
  // Window starts exactly at viewingCalOffset, runs 7 days
  var windowStart = viewingCalOffset;
  if (dayDiff < windowStart || dayDiff >= windowStart + 7) {
    viewingCalOffset = dayDiff;
  }
}

function viewingsSelectDay(dateStr) {
  viewingSelectedDate = dateStr;
  var calEl = document.getElementById('vc-calendar');
  if (calEl) calEl.innerHTML = buildCalendar();

  if (viewingsFilter === 'upcoming') {
    // Scroll to the first card on this date in the list
    var card = document.querySelector('#vc-upcoming-list .vw-card[data-date="' + dateStr + '"]');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  // For viewed: find and navigate to that card
  var all = getSortedViewings();
  var idx = -1;
  for (var i = 0; i < all.length; i++) {
    if (all[i].date === dateStr) { idx = i; break; }
  }
  if (idx >= 0) viewingNavIndex = idx;
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
  }
  actionBtns += '<button class="vw-btn vw-btn-edit" onclick="editViewing(\'' + v._id + '\')">✏️ Edit</button>';
  actionBtns += '<button class="vw-btn vw-btn-del" onclick="deleteViewing(\'' + v._id + '\')">🗑</button>';

  // Non-negotiables checklist (viewed cards only)
  var nnHtml = '';
  if (v.status === 'viewed' && window.nonNegotiables && window.nonNegotiables.length > 0) {
    var nnResults = v.nnResults || {};
    var n = window.nonNegotiables.length;
    var tri = n * (n + 1) / 2;
    var nnRows = window.nonNegotiables.map(function(item, i) {
      var key = viewingsSanitize(item);
      var val = nnResults[key];
      var pct = Math.round((n - i) / tri * 100);
      return '<div class="nn-row">' +
        '<span class="nn-label">' + viewingsEscape(item) + '<span class="nn-weight-pill">' + pct + '%</span></span>' +
        '<button class="nn-btn nn-tick-btn' + (val === true ? ' nn-active-tick' : '') + '" onclick="toggleNNResult(\'' + v._id + '\',\'' + viewingsEscape(item) + '\',\'tick\')">✓</button>' +
        '<button class="nn-btn nn-cross-btn' + (val === false ? ' nn-active-cross' : '') + '" onclick="toggleNNResult(\'' + v._id + '\',\'' + viewingsEscape(item) + '\',\'cross\')">✗</button>' +
      '</div>';
    }).join('');
    var score = calculateNNScore(v._id);
    var scoreLabel = score !== null ? score + '/10' : '—';
    var scoreBadgeClass = score === null ? 'nn-badge-none' : score >= 7 ? 'nn-badge-all' : score >= 4 ? 'nn-badge-some' : 'nn-badge-none';
    nnHtml = '<div class="nn-checklist">' +
      '<div class="nn-checklist-header">Must-haves <span class="nn-badge ' + scoreBadgeClass + '">' + scoreLabel + '</span><button onclick="showNNSetupModal()" style="margin-left:auto;background:transparent;border:none;font-size:10px;color:var(--ink-mid);cursor:pointer;padding:0;font-family:inherit;text-decoration:underline">Edit</button></div>' +
      nnRows +
      '<textarea class="nn-notes" id="nn-notes-' + v._id + '" placeholder="Any other thoughts…">' + viewingsEscape(v.nnNotes || '') + '</textarea>' +
      '<button class="vw-btn" style="margin-top:6px;width:100%;font-size:11px" onclick="saveNNNotes(\'' + v._id + '\',document.getElementById(\'nn-notes-' + v._id + '\').value)">💾 Save notes</button>' +
    '</div>';
  }

  var tenureStr = tenureLabel(v.tenure, v.leaseLength);
  var tenureHtml = tenureStr
    ? '<div class="vw-card-meta" style="margin-top:3px;font-weight:600">' + viewingsEscape(tenureStr) + '</div>'
    : '';

  var cardHtml = '<div class="vw-card" style="border:none;border-radius:0;background:transparent;padding:0">' +
    '<div class="vw-card-address">🏠 ' + viewingsEscape(trimAddress(v.address || v.area || 'No address')) + '</div>' +
    (metaLine ? '<div class="vw-card-meta">' + viewingsEscape(metaLine) + '</div>' : '') +
    tenureHtml +
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
    // Clear edit/conversion state and reset save button label
    _viewingEditId = null;
    _convertingFromWishlistId = null;
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
    address:     form.address.value.trim(),
    price:       form.price.value,
    url:         form.url.value.trim(),
    tenure:      form.tenure.value,
    leaseLength: form.leaseLength.value.trim()
  });
}
window.wishlistSubmitForm = wishlistSubmitForm;

function buildWishlistSection() {
  var items = getOrderedWishlistItems();

  var listHtml = items.length
    ? items.map(function(w) {
        var safeId = viewingsEscape(w._id);
        var priceLabel = viewingsFmtPrice(w.price);
        var urlHtml = w.url
          ? '<a href="' + viewingsEscape(w.url) + '" target="_blank" class="vw-listing-link" style="font-size:11px">View listing ↗</a>'
          : '';
        return '<div class="vw-card wl-sortable-card" data-id="' + safeId + '" style="border-left:3px solid #f59e0b;display:flex;gap:8px;align-items:flex-start">' +
          '<span class="nn-drag-handle wl-drag-handle" title="Drag to reorder" style="padding-top:2px;font-size:20px;flex-shrink:0">⠿</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="vw-card-address">🏠 ' + viewingsEscape(trimAddress(w.address || 'No address')) + '</div>' +
            (priceLabel ? '<div class="vw-card-meta">' + viewingsEscape(priceLabel) + '</div>' : '') +
            (urlHtml ? '<div style="margin-top:4px">' + urlHtml + '</div>' : '') +
            '<div class="vw-card-actions" style="margin-top:8px">' +
              '<button class="vw-btn" style="color:#059669;border-color:#6ee7b7;font-size:11px" onclick="wishlistConvertToViewing(\'' + safeId + '\')">📅 I have a viewing</button>' +
              '<button class="vw-btn vw-btn-del" style="font-size:11px" onclick="deleteWishlistItem(\'' + safeId + '\')">✕ Remove</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('')
    : '<div style="text-align:center;color:var(--ink-ghost);font-size:12px;padding:24px 0">No properties added yet</div>';

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
      '<div class="vc-form-row">' +
        '<div class="vc-form-field">' +
          '<label>Tenure <span style="font-weight:400;color:var(--ink-ghost)">(optional)</span></label>' +
          '<select name="tenure">' + buildTenureOptions() + '</select>' +
        '</div>' +
        '<div class="vc-form-field">' +
          '<label>Lease length <span style="font-weight:400;color:var(--ink-ghost)">(years)</span></label>' +
          '<input type="text" name="leaseLength" placeholder="e.g. 125" maxlength="10">' +
        '</div>' +
      '</div>' +
      '<button type="submit" id="wl-save-btn" class="save-btn" style="width:100%;margin-top:4px">💾 Save</button>' +
    '</form>' +
  '</div>' +
  '<div id="wl-list" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px 0">' + listHtml + '</div>';
}

// Wire up drag-to-reorder on the wishlist list (called after DOM renders)
function _attachWishlistDrag() {
  var list = document.getElementById('wl-list');
  if (!list) return;
  list.querySelectorAll('.wl-sortable-card').forEach(function(card) {
    card.draggable = true;
    card.addEventListener('dragstart', _wlDragStart);
    card.addEventListener('dragover',  _wlDragOver);
    card.addEventListener('drop',      _wlDrop);
    card.addEventListener('dragend',   _wlDragEnd);
  });
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

// ── Upcoming list ─────────────────────────────────────────────

function renderUpcomingList() {
  var panel = document.getElementById('vc-upcoming-list');
  if (!panel) return;

  var all = getSortedViewings(); // filtered to upcoming/scheduled

  if (!all.length) {
    panel.innerHTML = '<div style="text-align:center;color:var(--ink-ghost);font-size:12px;padding:24px 0">No upcoming viewings yet.<br>Tap + Add to get started.</div>';
    return;
  }

  panel.innerHTML = all.map(function(v) {
    var metaLine = [viewingsFmtDate(v.date), viewingsFmtTime(v.time), viewingsFmtPrice(v.price)].filter(Boolean).join(' · ');
    var listingBtn = v.listingUrl
      ? '<a class="vw-listing-btn" href="' + viewingsEscape(v.listingUrl) + '" target="_blank" rel="noopener" style="font-size:11px">🔗 Listing</a>'
      : '';
    var tenureStr = tenureLabel(v.tenure, v.leaseLength);
    var tenureHtml = tenureStr
      ? '<span style="font-size:11px;color:var(--ink-mid);font-weight:600">' + viewingsEscape(tenureStr) + '</span>'
      : '';
    var actionBtns =
      '<button class="vw-btn vw-btn-done" onclick="markViewingDone(\'' + v._id + '\')">✓ Done</button>' +
      '<button class="vw-btn vw-btn-skip" onclick="updateViewingStatus(\'' + v._id + '\',\'skipped\')">✕ Skip</button>' +
      '<button class="vw-btn vw-btn-edit" onclick="editViewing(\'' + v._id + '\')">✏️ Edit</button>' +
      '<button class="vw-btn vw-btn-del" onclick="deleteViewing(\'' + v._id + '\')">🗑</button>';
    return '<div class="vw-card" data-id="' + v._id + '" data-date="' + viewingsEscape(v.date || '') + '" style="border-left:3px solid #3b82f6;margin-bottom:6px">' +
      '<div class="vw-card-address">🏠 ' + viewingsEscape(trimAddress(v.address || v.area || 'No address')) + '</div>' +
      (metaLine ? '<div class="vw-card-meta">' + viewingsEscape(metaLine) + '</div>' : '') +
      (v.agentName ? '<div class="vw-card-agent">' + viewingsEscape(v.agentName) + '</div>' : '') +
      (v.notes ? '<div class="vw-card-meta" style="margin-top:3px;font-style:italic">' + viewingsEscape(v.notes) + '</div>' : '') +
      ((listingBtn || tenureHtml)
        ? '<div style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + listingBtn + tenureHtml + '</div>'
        : '') +
      '<div class="vw-card-actions">' + actionBtns + '</div>' +
      '</div>';
  }).join('');
}

// ── Render main tab ───────────────────────────────────────────

function buildViewingFormHtml() {
  return '<form id="viewing-add-form" onsubmit="viewingsSubmitForm(event)" class="vc-form">' +
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
        '<input type="date" name="date" required>' +
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
    '<div class="vc-form-row">' +
      '<div class="vc-form-field">' +
        '<label>Tenure <span style="font-weight:400;color:var(--ink-ghost)">(optional)</span></label>' +
        '<select name="tenure">' + buildTenureOptions() + '</select>' +
      '</div>' +
      '<div class="vc-form-field">' +
        '<label>Lease length <span style="font-weight:400;color:var(--ink-ghost)">(years)</span></label>' +
        '<input type="text" name="leaseLength" placeholder="e.g. 125" maxlength="10">' +
      '</div>' +
    '</div>' +
    '<div class="vc-form-field">' +
      '<label>Notes <span style="font-weight:400;color:var(--ink-ghost)">(optional)</span></label>' +
      '<textarea name="notes" rows="2" placeholder="First impressions…" style="width:100%;resize:vertical;border:1px solid var(--rule);border-bottom:2px solid var(--ink);padding:8px 10px;font-size:12px;font-family:inherit;background:var(--cream);outline:none;border-radius:0"></textarea>' +
    '</div>' +
    '<button type="submit" id="viewing-save-btn" class="save-btn" style="width:100%;margin-top:4px">💾 Save viewing</button>' +
  '</form>';
}

function renderViewingsTab() {
  var container = document.getElementById('content-viewings');
  if (!container) return;

  var isWishlist = viewingsFilter === 'wishlist';
  var isViewed   = viewingsFilter === 'viewed';
  var isUpcoming = viewingsFilter === 'upcoming';

  var addBtn = isWishlist
    ? '<button id="wl-add-btn" class="vc-filter-btn" style="border-radius:6px;flex:none;padding:5px 10px" onclick="toggleWishlistForm()">+ Add</button>'
    : '<button id="vc-add-btn" class="vc-filter-btn" style="border-radius:6px;flex:none;padding:5px 10px" onclick="toggleAddForm()">+ Add</button>';

  var topbar =
    '<div class="vc-topbar" style="justify-content:flex-end">' +
      '<div style="display:flex;gap:6px">' +
        '<button class="vc-filter-btn" style="background:var(--copper);border-color:var(--copper);color:var(--cream);font-style:italic;border-radius:6px;flex:none;padding:5px 10px" onclick="showCalLinkModal()">Link to calendar</button>' +
        '<button class="vc-filter-btn" style="border-radius:6px;flex:none;padding:5px 10px" onclick="showNNSetupModal()">Must-haves</button>' +
        addBtn +
      '</div>' +
    '</div>';

  var filterToggle =
    '<div class="vc-filter-toggle">' +
      '<button id="vf-upcoming" class="vc-filter-btn' + (isUpcoming ? ' active' : '') + '" onclick="setViewingsFilter(\'upcoming\')">Upcoming</button>' +
      '<button id="vf-viewed"   class="vc-filter-btn' + (isViewed   ? ' active' : '') + '" onclick="setViewingsFilter(\'viewed\')">Viewed</button>' +
      '<button id="vf-wishlist" class="vc-filter-btn' + (isWishlist ? ' active' : '') + '" onclick="setViewingsFilter(\'wishlist\')">Want to view</button>' +
    '</div>';

  var mainContent;

  if (isWishlist) {
    mainContent = buildWishlistSection();

  } else if (isUpcoming) {
    // Calendar + collapsible add form + scrollable list
    mainContent =
      '<div id="vc-calendar">' + buildCalendar() + '</div>' +
      '<div id="vc-add-wrap" style="display:none;flex-shrink:0;border-top:1px solid var(--rule);padding:12px">' +
        buildViewingFormHtml() +
      '</div>' +
      '<div id="vc-upcoming-list" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px"></div>';

  } else {
    // Viewed: no calendar — just the add form (hidden) + card navigator
    mainContent =
      '<div id="vc-add-wrap" style="display:none;flex-shrink:0;border-top:1px solid var(--rule);padding:12px">' +
        buildViewingFormHtml() +
      '</div>' +
      '<div id="vc-day-panel" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch"></div>';
  }

  container.innerHTML =
    '<div class="vc-wrap">' + topbar + filterToggle + mainContent + '</div>';

  if (isUpcoming) {
    renderUpcomingList();
  } else if (isViewed) {
    renderDayPanel();
  } else {
    // Wishlist: attach drag-and-drop handlers after DOM is built
    _attachWishlistDrag();
  }
}
window.renderViewingsTab = renderViewingsTab;

function viewingsSubmitForm(e) {
  e.preventDefault();
  var form = e.target;
  var data = {
    address:     form.address.value.trim(),
    area:        form.area.value,
    date:        form.date.value,
    time:        form.time.value,
    price:       form.price.value,
    agentName:   form.agentName.value.trim(),
    listingUrl:  form.listingUrl.value.trim(),
    notes:       form.notes.value.trim(),
    tenure:      form.tenure.value,
    leaseLength: form.leaseLength.value.trim()
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
    .then(function() {
      setTimeout(function() {
        checkForTies();
        if (typeof renderViewingPins === 'function') renderViewingPins();
        if (typeof renderShortlistTab === 'function') renderShortlistTab();
      }, 300);
    });
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
      setTimeout(function() {
        checkForTies();
        renderViewingPins(); // rankOrder changed → top 3 may have shifted
        if (typeof renderShortlistTab === 'function') renderShortlistTab();
      }, 300);
    });
}
window.resolveTie = resolveTie;

function checkForTies() {
  var hasNN = window.nonNegotiables && window.nonNegotiables.length > 0;

  var shortlisted = Object.keys(window.viewingsCache)
    .map(function(id) { return Object.assign({ _id: id }, window.viewingsCache[id]); })
    .filter(function(v) {
      if (v.status !== 'viewed') return false;
      var score = hasNN ? calculateNNScore(v._id) : v.rating;
      v._tieScore = score;
      return score != null;
    });

  var byScore = {};
  shortlisted.forEach(function(v) {
    var key = String(v._tieScore);
    if (!byScore[key]) byScore[key] = [];
    byScore[key].push(v);
  });

  var pair = null;
  Object.keys(byScore).forEach(function(r) {
    if (pair) return;
    var group = byScore[r];
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
      '<div class="sl-tinder-header">Both scored ' + a._tieScore + '/10 — which would you rather buy?</div>' +
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
    .filter(function(v) { return v.status === 'viewed'; });

  if (!shortlisted.length) {
    container.innerHTML =
      '<div class="vc-wrap">' +
        '<div class="vc-topbar"><span class="section-title" style="margin:0">🏆 Rankings</span></div>' +
        '<div style="padding:24px 16px;text-align:center;color:var(--ink-ghost);font-size:12px;line-height:1.8">' +
          'No viewed properties yet.<br>Mark a viewing as Done to score it here.' +
        '</div>' +
      '</div>';
    return;
  }

  var hasNN = window.nonNegotiables && window.nonNegotiables.length > 0;

  // Attach effective score: auto-calculated from must-haves if defined, else manual rating
  shortlisted.forEach(function(v) {
    var nn = hasNN ? calculateNNScore(v._id) : null;
    v._effectiveScore = nn !== null ? nn : v.rating;
    v._scoreIsAuto    = nn !== null;
  });

  shortlisted.sort(function(a, b) {
    if (a._effectiveScore == null && b._effectiveScore == null) return 0;
    if (a._effectiveScore == null) return 1;
    if (b._effectiveScore == null) return -1;
    if (b._effectiveScore !== a._effectiveScore) return b._effectiveScore - a._effectiveScore;
    return (a.rankOrder || 0) - (b.rankOrder || 0);
  });

  var leagueRows = shortlisted.map(function(v, i) {
    var isRated = v._effectiveScore != null;
    var rank = isRated ? '#' + (i + 1) : '—';
    var scoreLabel = isRated
      ? (v._scoreIsAuto ? v._effectiveScore + '/10 ⚡' : v._effectiveScore + '/10')
      : 'Unranked';
    var barWidth = isRated ? (v._effectiveScore / 10 * 100) + '%' : '0%';
    var barColor = isRated
      ? (v._effectiveScore >= 8 ? '#22c55e' : v._effectiveScore >= 5 ? 'var(--copper)' : '#ef4444')
      : 'var(--rule)';
    return '<div class="sl-league-row">' +
      '<div class="sl-league-meta">' +
        '<span><span class="sl-league-rank">' + rank + '</span>' + viewingsEscape(trimAddress(v.address || v.area || 'Unknown')) + '</span>' +
        '<span style="color:' + barColor + ';font-weight:700">' + scoreLabel + '</span>' +
      '</div>' +
      '<div class="sl-score-bar-wrap"><div class="sl-score-bar" style="width:' + barWidth + ';background:' + barColor + '"></div></div>' +
    '</div>';
  }).join('');

  var cardsHtml = shortlisted.map(function(v) {
    var safeId = v._id.replace(/'/g, "\\'");
    var metaLine = [viewingsFmtDate(v.date), viewingsFmtPrice(v.price)].filter(Boolean).join(' · ');
    var notes = v.notes ? v.notes.substring(0, 120) + (v.notes.length > 120 ? '…' : '') : '';
    var ratingSection = '';
    if (v._scoreIsAuto) {
      ratingSection =
        '<div class="sl-auto-score">' +
          '<span class="sl-auto-score-value">' + v._effectiveScore + '<span>/10</span></span>' +
          '<span class="sl-auto-score-label">⚡ Auto from must-haves</span>' +
        '</div>';
    } else {
      var dots = '';
      for (var d = 1; d <= 10; d++) {
        dots += '<div class="sl-rating-dot' + (v.rating === d ? ' active' : '') + '" onclick="setShortlistRating(\'' + safeId + '\',' + d + ')">' + d + '</div>';
      }
      ratingSection = '<div class="sl-rating">' + dots + '</div>';
    }
    return '<div class="sl-card">' +
      '<div class="sl-card-addr">🏠 ' + viewingsEscape(trimAddress(v.address || v.area || 'No address')) + '</div>' +
      (metaLine ? '<div class="sl-card-meta">' + viewingsEscape(metaLine) + '</div>' : '') +
      (notes ? '<div class="sl-card-notes">"' + viewingsEscape(notes) + '"</div>' : '') +
      ratingSection +
    '</div>';
  }).join('');

  container.innerHTML =
    '<div class="vc-wrap">' +
      '<div class="vc-topbar"><span class="section-title" style="margin:0">🏆 Rankings</span></div>' +
      '<div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 0 16px">' +
        '<div class="sl-league">' + leagueRows + '</div>' +
        '<div id="sl-tinder-wrap" style="display:none"></div>' +
        cardsHtml +
      '</div>' +
    '</div>';

  checkForTies();
}
window.renderShortlistTab = renderShortlistTab;

// ── Calendar link modal ───────────────────────────────────────

/**
 * showCalLinkModal()
 * Shows a modal with instructions to link viewings to Apple/Google Calendar.
 * Generates a personal secret webcal URL from the user's calToken.
 */
function showCalLinkModal() {
  var existing = document.getElementById('cal-link-overlay');
  if (existing) { existing.remove(); }

  if (!window.AuthManager || !AuthManager.isLoggedIn()) {
    alert('Sign in first to get your calendar link.');
    return;
  }

  // Show modal with loading state, then fill in URL once token is ready
  var onMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var overlay = document.createElement('div');
  overlay.id = 'cal-link-overlay';
  overlay.className = 'lm-overlay';
  overlay.innerHTML =
    '<div class="lm-modal">' +
      '<div class="lm-header"><span>Link to Calendar</span>' +
        '<button class="lm-close" onclick="document.getElementById(\'cal-link-overlay\').remove()">✕</button>' +
      '</div>' +
      '<div class="lm-section">' +
        (onMobile
          ? '<p class="lm-hint" style="margin-bottom:12px">Tap below to subscribe — your viewings will appear in your calendar and sync automatically.</p>' +
            '<a id="cal-link-open-btn" href="#" class="lm-btn" style="display:none;text-align:center;text-decoration:none;margin-bottom:8px">Open in Calendar</a>'
          : '<p class="lm-hint" style="margin-bottom:12px">Copy the link below and add it as a calendar subscription. Your viewings will sync automatically — edits and new entries update within a few hours.</p>') +
        '<div id="cal-link-url" style="font-size:11px;word-break:break-all;background:#1a1714;border:1px solid var(--rule);border-radius:6px;padding:10px;color:var(--ink-mid);min-height:36px">Loading…</div>' +
        '<button id="cal-link-copy-btn" class="lm-btn" style="margin-top:10px;display:none" onclick="viewingsCopyCalLink()">Copy link</button>' +
      '</div>' +
      (!onMobile
        ? '<div class="lm-divider"></div>' +
          '<div class="lm-section">' +
            '<div class="lm-section-title">How to add in Apple Calendar</div>' +
            '<p class="lm-hint">On Mac: File → New Calendar Subscription → paste the link.</p>' +
            '<div class="lm-section-title" style="margin-top:10px">How to add in Google Calendar</div>' +
            '<p class="lm-hint">Settings → Add calendar → From URL → paste the link.</p>' +
          '</div>'
        : '') +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });

  // Get or create the secret token, then build the webcal URL
  AuthManager.getOrCreateCalToken(function(token) {
    var baseUrl = 'https://europe-west1-nestfinderv3.cloudfunctions.net/calendarFeed';
    var feedUrl = baseUrl + '?token=' + token;
    var webcalUrl = feedUrl.replace('https://', 'webcal://');
    var urlEl   = document.getElementById('cal-link-url');
    var copyBtn = document.getElementById('cal-link-copy-btn');
    var openBtn = document.getElementById('cal-link-open-btn');
    if (urlEl) {
      urlEl.innerHTML = '<a href="' + viewingsEscape(webcalUrl) + '" style="color:var(--copper);text-decoration:none">' + viewingsEscape(webcalUrl) + '</a>';
      urlEl._rawUrl = webcalUrl; // webcal:// so paste into Safari triggers Calendar subscription
    }
    if (copyBtn) copyBtn.style.display = 'block';
    if (openBtn) {
      openBtn.href = webcalUrl;
      openBtn.style.display = 'block';
    }
  });
}
window.showCalLinkModal = showCalLinkModal;

function viewingsCopyCalLink() {
  var urlEl = document.getElementById('cal-link-url');
  if (!urlEl || !urlEl._rawUrl) return;
  navigator.clipboard.writeText(urlEl._rawUrl).then(function() {
    var btn = document.getElementById('cal-link-copy-btn');
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(function() { btn.textContent = 'Copy link'; }, 2000); }
  });
}
window.viewingsCopyCalLink = viewingsCopyCalLink;

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  // Render empty tab so calendar shows immediately (even before login)
  renderViewingsTab();
});
