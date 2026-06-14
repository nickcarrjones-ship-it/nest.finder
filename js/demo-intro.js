/**
 * demo-intro.js
 * ─────────────────────────────────────────────────────────────
 * Guided intro shown ONLY in the value-before-sign-in demo.
 *
 * Plays a short 3-step sequence the first time the demo map renders:
 *   1. Opens pin A's popup — "A — your workplace"
 *   2. Opens pin B's popup — "B — your partner's workplace"
 *   3. Opens a sample green area — shows BOTH commute times, driving home
 *      the core idea: every green area gets both people to work in time.
 *
 * Each step opens a real Leaflet popup (same style as clicking a bubble) and
 * a small bottom "coach" card explains it with a Next button. Mobile-first:
 * the card sits above the 60px bottom nav.
 *
 * Refs come from window._demoRefs, populated by computeZones() in map-core.js
 * when the loaded profile is the demo (profile.isDemo).
 * ─────────────────────────────────────────────────────────────
 */

window.DemoIntro = (function () {
  'use strict';

  var shown = false;       // only play once per visit
  var cardEl = null;
  var stepIndex = 0;
  var steps = [];

  function isDemo() {
    return !!(window.ProfileManager && ProfileManager.isDemo && ProfileManager.isDemo());
  }

  function run() {
    if (shown || !isDemo()) return;
    var refs = window._demoRefs || {};
    if (!refs.aMarker || !refs.bMarker) return; // map not ready yet

    var profile  = ProfileManager.get() || {};
    var members  = profile.members || [];
    var aWork    = (members[0] && members[0].workLabel) || 'their office';
    var bWork    = (members[1] && members[1].workLabel) || 'their office';

    steps = [
      {
        text: '<b>🅐 This is your workplace</b> — ' + esc(aWork) + '. Pin A marks where you commute to.',
        show: function () { openMarker(refs.aMarker); }
      },
      {
        text: '<b>🅑 This is your partner’s workplace</b> — ' + esc(bWork) + '. Pin B marks their commute.',
        show: function () { openMarker(refs.bMarker); }
      },
      {
        text: 'Every <b>green</b> area gets <b>both</b> of you to work in 45 minutes or less — that’s the whole idea. Tap any green bubble to see both times.',
        show: function () {
          if (refs.sampleCircle) {
            panTo(refs.sampleCircle.getLatLng());
            refs.sampleCircle.openPopup();
          }
        }
      }
    ];

    shown = true;
    stepIndex = 0;
    buildCard();
    renderStep();
  }

  function esc(s) {
    return (window.nfEscapeHtml ? nfEscapeHtml(s) : String(s));
  }

  function openMarker(marker) {
    if (!marker) return;
    panTo(marker.getLatLng());
    marker.openPopup();
  }

  function panTo(latlng) {
    if (window.nfMap && latlng) window.nfMap.panTo(latlng, { animate: true });
  }

  function buildCard() {
    if (cardEl) return;
    cardEl = document.createElement('div');
    cardEl.id = 'demo-coach';
    cardEl.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));' +
      'max-width:420px;margin:0 auto;z-index:1200;background:var(--ink,#1a1714);color:var(--cream,#f7f4ef);' +
      'border-radius:14px;padding:14px 16px;box-shadow:0 8px 28px rgba(0,0,0,0.35);' +
      'font-family:inherit;animation:none';
    cardEl.innerHTML =
      '<div id="dc-text" style="font-size:13.5px;line-height:1.5;margin-bottom:10px"></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span id="dc-count" style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(247,244,239,0.55)"></span>' +
        '<button id="dc-skip" style="background:none;border:none;color:rgba(247,244,239,0.55);font-size:12px;font-family:inherit;cursor:pointer;padding:6px 4px">Skip</button>' +
        '<button id="dc-next" style="margin-left:auto;background:var(--copper,#c8722a);color:#fff;border:none;border-radius:8px;' +
          'padding:9px 16px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;min-height:40px;' +
          'touch-action:manipulation;-webkit-tap-highlight-color:transparent"></button>' +
      '</div>';
    document.body.appendChild(cardEl);
    cardEl.querySelector('#dc-next').addEventListener('click', next);
    cardEl.querySelector('#dc-skip').addEventListener('click', close);
  }

  function renderStep() {
    if (!cardEl) return;
    var step = steps[stepIndex];
    var isLast = stepIndex === steps.length - 1;
    cardEl.querySelector('#dc-text').innerHTML  = step.text;
    cardEl.querySelector('#dc-count').textContent = (stepIndex + 1) + ' of ' + steps.length;
    cardEl.querySelector('#dc-next').textContent  = isLast ? 'Got it ✓' : 'Next →';
    cardEl.querySelector('#dc-skip').style.display = isLast ? 'none' : '';
    try { step.show(); } catch (e) { /* refs may be missing — fail quietly */ }
  }

  function next() {
    if (stepIndex >= steps.length - 1) { close(); return; }
    stepIndex++;
    renderStep();
  }

  function close() {
    if (window.nfMap) window.nfMap.closePopup();
    if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
    cardEl = null;
  }

  return { run: run };
})();
