/**
 * setup-inline.js
 * ─────────────────────────────────────────────────────────────
 * The inline "where do you both work?" onboarding panel that
 * replaces the full-page setup.html wizard on the first-run path.
 *
 * It's a mobile-first bottom sheet shown ON the map: two rows
 * (name + nearest station) plus one commute-time control and a
 * "Show my map →" button. On submit it builds the profile via the
 * SHARED ProfileManager.composeProfile() (same code path as
 * setup.html) so the two can never drift, then renders the real map.
 *
 * setup.html stays the home for advanced/edit (3+ people, split
 * commutes, emails, property/lifestyle/area cards) — reachable via
 * the quiet "More options" link.
 *
 * Public API:
 *   window.openInlineSetup({ prefill? })   — show the panel
 *   window.closeInlineSetup()              — remove it
 * ─────────────────────────────────────────────────────────────
 */
'use strict';

(function () {

  var OVERLAY_ID = 'inline-setup-overlay';
  var STYLE_ID   = 'inline-setup-styles';
  var DEFAULT_COMMUTE = 45; // most-popular door-to-door cap; user can change here or in the header

  // ── Styles (injected once) ───────────────────────────────────
  function _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var O = '#' + OVERLAY_ID;
    var css =
      // Box-sizing on EVERYTHING in the panel so padding never widens an element
      // beyond its box — this is what keeps it inside a narrow phone screen.
      O + ' *{box-sizing:border-box;}' +
      // Full-viewport overlay.
      O + '{position:fixed;left:0;right:0;top:0;bottom:0;z-index:9000;}' +
      O + ' .is-backdrop{position:absolute;left:0;right:0;top:0;bottom:0;background:rgba(26,23,20,0.45);}' +
      // Sheet pinned to BOTH screen edges (left:0/right:0) so it can never be
      // wider than the viewport — no flexbox, which is what let it overflow and
      // force the phone to zoom out. margin:0 auto centres it once capped on
      // desktop. Mobile-first: full width, internal scroll, never runs off-screen.
      O + ' .is-sheet{position:absolute;left:0;right:0;bottom:0;margin:0 auto;background:var(--cream,#faf6f0);' +
        'border-radius:18px 18px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom));' +
        'box-shadow:0 -10px 40px rgba(26,23,20,0.22);max-height:88vh;overflow-y:auto;overflow-x:hidden;' +
        'overscroll-behavior:contain;-webkit-overflow-scrolling:touch;' +
        'transform:translateY(100%);transition:transform .28s cubic-bezier(.22,.61,.36,1);}' +
      O + '.is-shown .is-sheet{transform:translateY(0);}' +
      O + ' .is-handle{width:36px;height:4px;border-radius:2px;background:var(--rule,#e3dcd2);margin:0 auto 12px;}' +
      O + ' h2{font-family:"Outfit",sans-serif;font-weight:600;font-size:21px;line-height:1.2;color:var(--ink,#1a1714);margin:0 0 4px;}' +
      O + ' .is-sub{font-size:13px;line-height:1.45;color:var(--ink-soft,#6b625a);margin:0 0 16px;}' +
      O + ' .is-row{margin-bottom:14px;}' +
      O + ' .is-row .is-name{width:100%;padding:11px 14px;border:1px solid var(--rule,#e3dcd2);background:var(--white,#fff);' +
        'font-family:"Outfit",sans-serif;font-size:16px;color:var(--ink,#1a1714);outline:none;margin-bottom:8px;transition:border-color .15s;}' +
      O + ' .is-row .is-name:focus{border-color:var(--copper,#b87333);}' +
      // 16px font on inputs prevents iOS Safari auto-zooming the page on focus.
      O + ' .station-search-input{font-size:16px !important;padding:11px 14px !important;}' +
      O + ' .is-field{margin-bottom:16px;}' +
      O + ' .is-field label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-soft,#6b625a);margin-bottom:6px;}' +
      O + ' .is-field select{width:100%;padding:11px 14px;border:1px solid var(--rule,#e3dcd2);background:var(--white,#fff);' +
        'font-family:"Outfit",sans-serif;font-size:16px;color:var(--ink,#1a1714);outline:none;}' +
      O + ' .is-go{width:100%;padding:14px;border:none;border-radius:12px;background:var(--copper,#b87333);color:#fff;' +
        'font-family:"Outfit",sans-serif;font-size:16px;font-weight:600;cursor:pointer;transition:background .15s;}' +
      O + ' .is-go:hover{background:var(--copper-dark,#9c5f29);}' +
      O + ' .is-more{display:block;text-align:center;margin-top:14px;padding:6px;font-size:13px;color:var(--ink-soft,#6b625a);text-decoration:none;}' +
      O + ' .is-more:hover{color:var(--copper,#b87333);}' +
      // Larger screens only: cap the width (margin:0 auto already centres it).
      '@media (min-width:600px){' + O + ' .is-sheet{max-width:440px;bottom:24px;border-radius:18px;padding:24px;}}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── One name + station row (reuses the index-based station picker) ──
  function _rowMarkup(idx, namePlaceholder) {
    return '<div class="is-row">' +
      '<input type="text" class="is-name" id="inline-name-' + idx + '" placeholder="' + namePlaceholder + '" maxlength="30" autocomplete="given-name">' +
      '<div class="station-search-wrap">' +
        '<input type="text" class="station-search-input" id="search-' + idx + '-work"' +
          ' placeholder="Nearest station to work… e.g. Bank" autocomplete="off"' +
          ' oninput="filterStationsIdx(' + idx + ')" onfocus="openDropdownIdx(' + idx + ')" onblur="blurDropdownIdx(' + idx + ')">' +
        '<div class="station-dropdown" id="drop-' + idx + '-work"></div>' +
        '<input type="hidden" id="s-work-' + idx + '" value="">' +
      '</div>' +
    '</div>';
  }

  function _sheetMarkup() {
    return '<div class="is-backdrop"></div>' +
      '<div class="is-sheet" role="dialog" aria-modal="true" aria-label="Set up your commute">' +
        '<div class="is-handle"></div>' +
        '<h2>Where do you both work?</h2>' +
        '<p class="is-sub">We\'ll map the neighbourhoods you can <em>both</em> get home from after work.</p>' +
        _rowMarkup(0, 'Your name') +
        _rowMarkup(1, 'Their name') +
        '<div class="is-field">' +
          '<label>Longest either of you wants to commute</label>' +
          '<select id="inline-commute-max"></select>' +
        '</div>' +
        '<button type="button" class="is-go" id="inline-setup-go">Show my map →</button>' +
        '<a class="is-more" href="setup.html">More of us, or more options →</a>' +
      '</div>';
  }

  // ── Open / close ─────────────────────────────────────────────
  function openInlineSetup(opts) {
    opts = opts || {};
    if (document.getElementById(OVERLAY_ID)) return; // already open
    _injectStyles();

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = _sheetMarkup();
    document.body.appendChild(overlay);

    // Reset the shared picker state so a previous demo's selections don't leak in.
    window.stationSelectionsArr = [];

    // Populate the station dropdowns + the commute-time select.
    if (typeof buildDropdownIdx === 'function') {
      buildDropdownIdx(0, '');
      buildDropdownIdx(1, '');
    }
    var sel = document.getElementById('inline-commute-max');
    if (sel && window.NFCommuteSettings) {
      NFCommuteSettings.fillCommuteSelect(sel, DEFAULT_COMMUTE);
    }

    // Optional prefill (edit mode / re-open). Blank by default — never carry demo names.
    if (opts.prefill && Array.isArray(opts.prefill.members)) {
      opts.prefill.members.slice(0, 2).forEach(function (m, i) {
        var nameEl = document.getElementById('inline-name-' + i);
        if (nameEl && m.name) nameEl.value = m.name;
        if (m.workId && typeof selectStationIdx === 'function') {
          selectStationIdx(i, m.workId, m.workLabel || m.workId);
        }
      });
      if (opts.prefill.maxCommuteMins != null && sel) sel.value = String(opts.prefill.maxCommuteMins);
    }

    document.getElementById('inline-setup-go').addEventListener('click', _submit);

    // Animate in on the next frame so the transform transition fires.
    requestAnimationFrame(function () { overlay.classList.add('is-shown'); });
  }

  function closeInlineSetup() {
    var el = document.getElementById(OVERLAY_ID);
    if (!el) return;
    el.classList.remove('is-shown');
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 280);
  }

  // ── Submit → build profile → render real map ─────────────────
  function _submit() {
    var members = [];
    for (var i = 0; i < 2; i++) {
      var nameEl = document.getElementById('inline-name-' + i);
      var name   = nameEl ? nameEl.value.trim() : '';
      var workId = (document.getElementById('s-work-' + i) || {}).value ||
                   (window.stationSelectionsArr && window.stationSelectionsArr[i]) || '';
      if (!name || !workId) {
        if (window.Toast) Toast.show('Add a name and workplace for both of you', 'error');
        return;
      }
      members.push({ name: name, workId: workId, offWalk: 0 });
    }

    var maxSel = document.getElementById('inline-commute-max');
    var maxCommuteMins = maxSel ? parseInt(maxSel.value, 10) : DEFAULT_COMMUTE;
    var walkKm = (window.APP_CONFIG && window.APP_CONFIG.walkDistanceDefault != null)
      ? window.APP_CONFIG.walkDistanceDefault : 1.5;

    var profile = ProfileManager.composeProfile({
      members:        members,
      groupType:      'couple',
      maxCommuteMins: maxCommuteMins,
      walkHomeKm:     walkKm
    });
    ProfileManager.save(profile);

    var user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (user) ProfileManager.syncToFirebase(user.uid);

    closeInlineSetup();

    // Render the real map without a page reload.
    if (typeof updateJourneySearchUI === 'function') updateJourneySearchUI();
    if (typeof computeZones === 'function') computeZones();
    if (window.Toast) Toast.show('Here\'s your map — change anything from the header anytime', 'success');
  }

  window.openInlineSetup  = openInlineSetup;
  window.closeInlineSetup = closeInlineSetup;

}());
