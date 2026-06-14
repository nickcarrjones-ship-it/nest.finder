/**
 * setup-inline.js
 * ─────────────────────────────────────────────────────────────
 * The inline onboarding / edit panel shown ON the map — a
 * mobile-first bottom sheet that replaces the full-page wizard for
 * the common paths.
 *
 * Two modes:
 *   • 'onboard' (first run) — "Where do you both work?": dynamic
 *     name + station rows (2–5 people), commute time, rent/buy,
 *     price → builds a fresh profile and renders the real map.
 *   • 'edit' — "Edit your details": same rows prefilled from the
 *     current profile, plus optional Google email per person and
 *     bedrooms / bathrooms / flat-house pills. On save it PRESERVES
 *     every field it still doesn't show (areas, lifestyle, split
 *     commute limits, …) so editing never wipes the rest.
 *
 * Both modes build the profile via the SHARED
 * ProfileManager.composeProfile() so the panel and setup.html can't
 * drift. setup.html still owns areas / lifestyle / split commute
 * until later Phase-2 slices — reachable via the "more options" link.
 *
 * Public API:
 *   window.openInlineSetup({ mode?, prefill? })
 *   window.closeInlineSetup()
 * ─────────────────────────────────────────────────────────────
 */
'use strict';

(function () {

  var OVERLAY_ID = 'inline-setup-overlay';
  var STYLE_ID   = 'inline-setup-styles';
  var DEFAULT_COMMUTE = 45; // most-popular door-to-door cap; editable here or in the header
  var MIN_MEMBERS = 2;
  var MAX_MEMBERS = 5;

  // Working state while the panel is open.
  var _mode = 'onboard';   // 'onboard' | 'edit'
  var _base = null;        // existing profile (edit mode) — fields to preserve
  var _draft = [];         // [{ name, email, workId, workLabel, offWalk?, maxCommuteMins?, walkHomeKm? }]

  function _esc(s) { return (window.nfEscapeHtml ? window.nfEscapeHtml(s) : (s == null ? '' : String(s))); }

  // ── Styles (injected once) ───────────────────────────────────
  function _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var O = '#' + OVERLAY_ID;
    var css =
      // Box-sizing on EVERYTHING so padding never widens an element past the
      // viewport (that's what made the phone zoom out before).
      O + ' *{box-sizing:border-box;}' +
      O + '{position:fixed;left:0;right:0;top:0;bottom:0;z-index:9000;}' +
      O + ' .is-backdrop{position:absolute;left:0;right:0;top:0;bottom:0;background:rgba(26,23,20,0.45);}' +
      // Sheet pinned to BOTH screen edges so it can never exceed the viewport.
      O + ' .is-sheet{position:absolute;left:0;right:0;bottom:0;margin:0 auto;background:var(--cream,#faf6f0);' +
        'border-radius:18px 18px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom));' +
        'box-shadow:0 -10px 40px rgba(26,23,20,0.22);max-height:88vh;overflow-y:auto;overflow-x:hidden;' +
        'overscroll-behavior:contain;-webkit-overflow-scrolling:touch;' +
        'transform:translateY(100%);transition:transform .28s cubic-bezier(.22,.61,.36,1);}' +
      O + '.is-shown .is-sheet{transform:translateY(0);}' +
      O + ' .is-handle{width:36px;height:4px;border-radius:2px;background:var(--rule,#e3dcd2);margin:0 auto 12px;}' +
      O + ' h2{font-family:"Outfit",sans-serif;font-weight:600;font-size:21px;line-height:1.2;color:var(--ink,#1a1714);margin:0 0 4px;}' +
      O + ' .is-sub{font-size:13px;line-height:1.45;color:var(--ink-soft,#6b625a);margin:0 0 16px;}' +
      O + ' .is-row{position:relative;margin-bottom:14px;}' +
      O + ' .is-row .is-name{width:100%;padding:11px 14px;border:1px solid var(--rule,#e3dcd2);background:var(--white,#fff);' +
        'font-family:"Outfit",sans-serif;font-size:16px;color:var(--ink,#1a1714);outline:none;margin-bottom:8px;transition:border-color .15s;}' +
      O + ' .is-row .is-name:focus{border-color:var(--copper,#b87333);}' +
      // 16px font on inputs stops iOS Safari auto-zooming on focus.
      O + ' .station-search-input{font-size:16px !important;padding:11px 14px !important;}' +
      O + ' .is-remove{position:absolute;top:-2px;right:0;background:none;border:none;color:var(--ink-soft,#6b625a);' +
        'font-family:"Outfit",sans-serif;font-size:12px;cursor:pointer;padding:4px;}' +
      O + ' .is-remove:hover{color:var(--copper,#b87333);}' +
      O + ' .is-rowlabel{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-soft,#6b625a);margin-bottom:6px;font-weight:600;}' +
      O + ' .is-add{display:block;width:100%;min-height:44px;margin:-2px 0 16px;padding:10px;border:1px dashed var(--rule,#cdb8a0);' +
        'background:transparent;border-radius:10px;font-family:"Outfit",sans-serif;font-size:14px;color:var(--copper,#b87333);cursor:pointer;}' +
      O + ' .is-add:disabled{opacity:.45;cursor:default;}' +
      O + ' .is-field{margin-bottom:16px;}' +
      O + ' .is-field label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-soft,#6b625a);margin-bottom:6px;}' +
      O + ' .is-field select{width:100%;padding:11px 14px;border:1px solid var(--rule,#e3dcd2);background:var(--white,#fff);' +
        'font-family:"Outfit",sans-serif;font-size:16px;color:var(--ink,#1a1714);outline:none;}' +
      O + ' .is-seg{display:flex;gap:8px;}' +
      O + ' .is-seg-btn{flex:1;min-height:44px;padding:10px 8px;border:1px solid var(--rule,#e3dcd2);' +
        'background:var(--white,#fff);border-radius:10px;font-family:"Outfit",sans-serif;font-size:15px;' +
        'color:var(--ink,#1a1714);cursor:pointer;transition:all .12s;}' +
      O + ' .is-seg-btn.is-on{border-color:var(--copper,#b87333);background:var(--copper,#b87333);color:#fff;font-weight:600;}' +
      O + ' .is-go{width:100%;padding:14px;border:none;border-radius:12px;background:var(--copper,#b87333);color:#fff;' +
        'font-family:"Outfit",sans-serif;font-size:16px;font-weight:600;cursor:pointer;transition:background .15s;}' +
      O + ' .is-go:hover{background:var(--copper-dark,#9c5f29);}' +
      O + ' .is-more{display:block;text-align:center;margin-top:14px;padding:6px;font-size:13px;color:var(--ink-soft,#6b625a);text-decoration:none;}' +
      O + ' .is-more:hover{color:var(--copper,#b87333);}' +
      '@media (min-width:600px){' + O + ' .is-sheet{max-width:440px;bottom:24px;border-radius:18px;padding:24px;}}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── One member row (reuses the index-based station picker) ───
  function _rowMarkup(idx, m) {
    var namePlaceholder = idx === 0 ? 'Your name' : (idx === 1 ? 'Their name' : 'Name');
    var removable = _draft.length > MIN_MEMBERS;
    var showEmail = _mode === 'edit';
    return '<div class="is-row" id="inline-row-' + idx + '">' +
      (_draft.length > MIN_MEMBERS || _mode === 'edit'
        ? '<span class="is-rowlabel">Person ' + (idx + 1) + '</span>' : '') +
      (removable
        ? '<button type="button" class="is-remove" data-rm="' + idx + '">× Remove</button>' : '') +
      '<input type="text" class="is-name" id="inline-name-' + idx + '" value="' + _esc(m.name) + '"' +
        ' placeholder="' + namePlaceholder + '" maxlength="30" autocomplete="given-name">' +
      (showEmail
        ? '<input type="email" class="is-name is-email" id="inline-email-' + idx + '" value="' + _esc(m.email) + '"' +
          ' placeholder="Google email (optional — for score locking)" autocomplete="email">'
        : '') +
      '<div class="station-search-wrap">' +
        '<input type="text" class="station-search-input" id="search-' + idx + '-work" value="' + _esc(m.workLabel) + '"' +
          ' placeholder="Nearest station to work… e.g. Bank" autocomplete="off"' +
          ' oninput="filterStationsIdx(' + idx + ')" onfocus="openDropdownIdx(' + idx + ')" onblur="blurDropdownIdx(' + idx + ')">' +
        '<div class="station-dropdown" id="drop-' + idx + '-work"></div>' +
        '<input type="hidden" id="s-work-' + idx + '" value="' + _esc(m.workId) + '">' +
      '</div>' +
    '</div>';
  }

  function _sheetMarkup() {
    var isEdit = _mode === 'edit';
    var title  = isEdit ? 'Edit your details' : 'Where do you both work?';
    var sub    = isEdit
      ? 'Update who’s searching and what you’re looking for.'
      : 'We’ll map the neighbourhoods you can <em>both</em> get home from after work.';
    var cta    = isEdit ? 'Save changes' : 'Show my map →';
    var moreTxt = isEdit ? 'Edit areas, lifestyle & advanced →' : 'More options →';
    var moreHref = isEdit ? 'setup.html?edit=true' : 'setup.html';
    return '<div class="is-backdrop"></div>' +
      '<div class="is-sheet" role="dialog" aria-modal="true" aria-label="Set up your search">' +
        '<div class="is-handle"></div>' +
        '<h2>' + title + '</h2>' +
        '<p class="is-sub">' + sub + '</p>' +
        '<div id="inline-members"></div>' +
        '<button type="button" class="is-add" id="inline-add">+ Add another person</button>' +
        '<div class="is-field">' +
          '<label>Longest anyone wants to commute</label>' +
          '<select id="inline-commute-max"></select>' +
        '</div>' +
        '<div class="is-field">' +
          '<label>Renting or buying?</label>' +
          '<div class="is-seg" id="inline-proptype">' +
            '<button type="button" class="is-seg-btn" data-type="rent">🔑 Renting</button>' +
            '<button type="button" class="is-seg-btn is-on" data-type="sale">🏡 Buying</button>' +
          '</div>' +
        '</div>' +
        '<div class="is-field">' +
          '<label>Max price</label>' +
          '<select id="inline-price"></select>' +
        '</div>' +
        (isEdit ? _propDetailGroups() : '') +
        '<button type="button" class="is-go" id="inline-setup-go">' + cta + '</button>' +
        '<a class="is-more" href="' + moreHref + '">' + moreTxt + '</a>' +
      '</div>';
  }

  // ── Dynamic member rows ──────────────────────────────────────
  // Pull the current DOM values back into _draft so typed input survives a
  // re-render when a row is added or removed.
  function _readDraftFromDOM() {
    for (var i = 0; i < _draft.length; i++) {
      var nameEl  = document.getElementById('inline-name-' + i);
      var emailEl = document.getElementById('inline-email-' + i);
      var workEl  = document.getElementById('s-work-' + i);
      if (nameEl)  _draft[i].name  = nameEl.value;
      if (emailEl) _draft[i].email = emailEl.value;
      var workId = (workEl && workEl.value) || (window.stationSelectionsArr && window.stationSelectionsArr[i]) || _draft[i].workId || '';
      _draft[i].workId = workId;
    }
  }

  function _renderMembers() {
    var container = document.getElementById('inline-members');
    if (!container) return;
    container.innerHTML = _draft.map(function (m, i) { return _rowMarkup(i, m); }).join('');
    // Re-init the station pickers for the fresh indices and restore selections.
    window.stationSelectionsArr = [];
    _draft.forEach(function (m, i) {
      if (typeof buildDropdownIdx === 'function') buildDropdownIdx(i, '');
      if (m.workId && typeof selectStationIdx === 'function') {
        selectStationIdx(i, m.workId, m.workLabel || m.workId);
      }
    });
    // Wire the per-row remove buttons.
    container.querySelectorAll('.is-remove').forEach(function (btn) {
      btn.addEventListener('click', function () { _removeMember(parseInt(btn.getAttribute('data-rm'), 10)); });
    });
    var addBtn = document.getElementById('inline-add');
    if (addBtn) addBtn.disabled = _draft.length >= MAX_MEMBERS;
  }

  function _addMember() {
    if (_draft.length >= MAX_MEMBERS) return;
    _readDraftFromDOM();
    _draft.push({ name: '', email: '', workId: '', workLabel: '' });
    _renderMembers();
  }

  function _removeMember(idx) {
    if (_draft.length <= MIN_MEMBERS) return;
    _readDraftFromDOM();
    _draft.splice(idx, 1);
    _renderMembers();
  }

  // ── Property type + price ────────────────────────────────────
  function _buildPriceOptions(type) {
    var sel = document.getElementById('inline-price');
    if (!sel) return;
    var opts = (window.PROPERTY_PRICE_OPTIONS && window.PROPERTY_PRICE_OPTIONS[type]) || [];
    sel.innerHTML = '<option value="any">No limit</option>';
    opts.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
  }

  function _selectedPropType() {
    var on = document.querySelector('#inline-proptype .is-seg-btn.is-on');
    return (on && on.getAttribute('data-type')) || 'sale';
  }

  function _setPropType(type) {
    var seg = document.getElementById('inline-proptype');
    if (!seg) return;
    seg.querySelectorAll('.is-seg-btn').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-type') === type);
    });
    _buildPriceOptions(type);
  }

  function _wirePropertyType() {
    var seg = document.getElementById('inline-proptype');
    if (!seg) return;
    _buildPriceOptions(_selectedPropType()); // default selection = Buying
    seg.querySelectorAll('.is-seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { _setPropType(btn.getAttribute('data-type')); });
    });
  }

  // ── Generic single-select pill group (beds / baths / format) ─
  function _segGroup(groupId, label, options, selected) {
    return '<div class="is-field"><label>' + label + '</label><div class="is-seg" id="' + groupId + '">' +
      options.map(function (o) {
        return '<button type="button" class="is-seg-btn' + (o.val === selected ? ' is-on' : '') +
          '" data-val="' + o.val + '">' + o.label + '</button>';
      }).join('') +
    '</div></div>';
  }

  function _wireSeg(groupId) {
    var g = document.getElementById(groupId);
    if (!g) return;
    g.querySelectorAll('.is-seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        g.querySelectorAll('.is-seg-btn').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
      });
    });
  }

  function _segVal(groupId, fallback) {
    var on = document.querySelector('#' + groupId + ' .is-seg-btn.is-on');
    return on ? on.getAttribute('data-val') : fallback;
  }

  // Bedrooms / bathrooms / flat-house — edit mode only (onboarding stays lean).
  function _propDetailGroups() {
    var b = _base || {};
    return _segGroup('inline-beds', 'Bedrooms',
        [{ val: '1', label: '1' }, { val: '2', label: '2' }, { val: '3', label: '3' }, { val: '4', label: '4+' }, { val: 'any', label: 'Any' }],
        b.beds || 'any') +
      _segGroup('inline-baths', 'Bathrooms',
        [{ val: '1', label: '1' }, { val: '2', label: '2' }, { val: '3', label: '3+' }, { val: 'any', label: 'Any' }],
        b.bathrooms || 'any') +
      _segGroup('inline-format', 'Property type',
        [{ val: 'flat', label: 'Flat' }, { val: 'house', label: 'House' }, { val: 'either', label: 'Either' }],
        b.propertyFormat || 'either');
  }

  // ── Open / close ─────────────────────────────────────────────
  function openInlineSetup(opts) {
    opts = opts || {};
    if (document.getElementById(OVERLAY_ID)) return; // already open

    _mode = opts.mode === 'edit' ? 'edit' : 'onboard';
    _base = (_mode === 'edit') ? (opts.prefill || (window.ProfileManager && ProfileManager.get()) || null) : null;

    // Seed the working draft.
    if (_base && Array.isArray(_base.members) && _base.members.length) {
      _draft = _base.members.map(function (m) {
        return {
          name: m.name || '', email: m.email || '', workId: m.workId || '',
          workLabel: m.workLabel || '', offWalk: m.offWalk,
          maxCommuteMins: m.maxCommuteMins, walkHomeKm: m.walkHomeKm
        };
      });
    } else {
      _draft = [{ name: '', email: '', workId: '', workLabel: '' },
                { name: '', email: '', workId: '', workLabel: '' }];
    }

    // If the generic spotlight tutorial happens to be open, clear its three
    // elements so the panel isn't buried under it. We do NOT mark it "seen"
    // (that's what TutorialManager.skip does) — a fresh user should still get
    // the map tutorial after they finish onboarding.
    ['tut-overlay', 'tut-frame', 'tut-card'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    _injectStyles();
    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = _sheetMarkup();
    document.body.appendChild(overlay);

    _renderMembers();

    // Commute select — default for onboarding, current value for edit.
    var sel = document.getElementById('inline-commute-max');
    if (sel && window.NFCommuteSettings) {
      var cm = (_base && _base.maxCommuteMins != null) ? _base.maxCommuteMins : DEFAULT_COMMUTE;
      NFCommuteSettings.fillCommuteSelect(sel, cm);
    }

    // Property type + price.
    _wirePropertyType();
    if (_base) {
      if (_base.propertyType) _setPropType(_base.propertyType);
      var priceEl = document.getElementById('inline-price');
      if (priceEl && _base.maxPrice != null) priceEl.value = String(_base.maxPrice);
    }

    // Property detail pills (edit mode only).
    if (_mode === 'edit') {
      _wireSeg('inline-beds');
      _wireSeg('inline-baths');
      _wireSeg('inline-format');
    }

    document.getElementById('inline-add').addEventListener('click', _addMember);
    document.getElementById('inline-setup-go').addEventListener('click', _submit);

    requestAnimationFrame(function () { overlay.classList.add('is-shown'); });
  }

  function closeInlineSetup() {
    var el = document.getElementById(OVERLAY_ID);
    if (!el) return;
    el.classList.remove('is-shown');
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 280);
  }

  // ── Submit → build profile → render / save ───────────────────
  function _submit() {
    _readDraftFromDOM();

    var members = [];
    for (var i = 0; i < _draft.length; i++) {
      var d = _draft[i];
      var name = (d.name || '').trim();
      if (!name || !d.workId) {
        if (window.Toast) Toast.show('Add a name and workplace for everyone', 'error');
        return;
      }
      members.push({
        name: name, email: d.email || '', workId: d.workId, workLabel: d.workLabel || '',
        // Preserve per-person values (offWalk, split commute/walk limits) in edit mode.
        offWalk: d.offWalk != null ? d.offWalk : 0,
        maxCommuteMins: d.maxCommuteMins, walkHomeKm: d.walkHomeKm
      });
    }

    var maxSel = document.getElementById('inline-commute-max');
    var maxCommuteMins = maxSel ? parseInt(maxSel.value, 10) : DEFAULT_COMMUTE;
    var priceSel = document.getElementById('inline-price');

    // Default walk for onboarding; preserve the existing limit when editing.
    var walkKm = (_base && _base.walkHomeKm != null)
      ? _base.walkHomeKm
      : ((window.APP_CONFIG && window.APP_CONFIG.walkDistanceDefault != null) ? window.APP_CONFIG.walkDistanceDefault : 1.5);

    var optsForCompose = {
      // groupType omitted → composeProfile derives couple/group from member count.
      members:        members,
      maxCommuteMins: maxCommuteMins,
      walkHomeKm:     walkKm,
      propertyType:   _selectedPropType(),
      maxPrice:       priceSel ? priceSel.value : 'any'
    };
    // Edit mode: carry through every field the panel doesn't show so saving
    // can never wipe areas / lifestyle / beds / split limits, etc.
    if (_base) {
      optsForCompose.split          = _base.sharedCommuteLimit === false;
      optsForCompose.travelTime     = _base.travelTime;
      // Beds/baths/format are now editable pills in edit mode (fall back to base).
      optsForCompose.beds           = _segVal('inline-beds',   _base.beds);
      optsForCompose.bathrooms      = _segVal('inline-baths',  _base.bathrooms);
      optsForCompose.propertyFormat = _segVal('inline-format', _base.propertyFormat);
      // Still preserved (not shown in the panel): areas, lifestyle, AI flag.
      optsForCompose.areaCards      = _base.areaCards;
      optsForCompose.lifestyle      = _base.lifestyle;
      optsForCompose.hasRunInitialAi = _base.hasRunInitialAi;
    }

    var profile = ProfileManager.composeProfile(optsForCompose);
    ProfileManager.save(profile);

    var user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (user) ProfileManager.syncToFirebase(user.uid);

    closeInlineSetup();

    // Re-render the map in place.
    if (typeof updateJourneySearchUI === 'function') updateJourneySearchUI();
    if (typeof applyProfile === 'function') { try { applyProfile(); } catch (e) {} }
    if (typeof computeZones === 'function') computeZones();
    if (window.Toast) {
      Toast.show(_mode === 'edit' ? 'Saved — your map is updated' : 'Here’s your map — change anything from the header anytime', 'success');
    }
  }

  window.openInlineSetup  = openInlineSetup;
  window.closeInlineSetup = closeInlineSetup;

}());
