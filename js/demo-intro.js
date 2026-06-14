/**
 * demo-intro.js
 * ─────────────────────────────────────────────────────────────
 * Guided intro shown ONLY in the value-before-sign-in demo.
 *
 * Part 1 — map walkthrough (bottom "coach" card + real Leaflet popups):
 *   1. Pin A's popup — "A — your workplace"
 *   2. Pin B's popup — "B — your partner's workplace"
 *   3. A sample green area — shows BOTH commute times (green = reachable by both)
 *   4. The Max-time / Walk-to-station controls are LIVE and user-changeable
 *
 * Part 2 — Maloca Agent showcase (overlay card):
 *   A fully scripted (fake, zero-cost) taste of the AI Agent, with two opposite
 *   lifestyle examples, ending on a sign-in CTA.
 *
 * Refs for the map steps come from window._demoRefs, populated by computeZones()
 * in map-core.js when the loaded profile is the demo.
 * ─────────────────────────────────────────────────────────────
 */

window.DemoIntro = (function () {
  'use strict';

  var shown = false;       // only play once per visit
  var cardEl = null;
  var stepIndex = 0;
  var steps = [];
  var pulseEl = null;      // element currently highlighted for the controls step

  function isDemo() {
    return !!(window.ProfileManager && ProfileManager.isDemo && ProfileManager.isDemo());
  }

  function run() {
    if (shown || !isDemo()) return;
    var refs = window._demoRefs || {};
    if (!refs.aMarker || !refs.bMarker) return; // map not ready yet

    var members = (ProfileManager.get() || {}).members || [];
    var aWork = (members[0] && members[0].workLabel) || 'their office';
    var bWork = (members[1] && members[1].workLabel) || 'their office';

    injectStyles();

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
        text: 'Every <b>green</b> area gets <b>both</b> of you to work within your time limit — that’s the whole idea. Tap any green bubble to see both times.',
        show: function () {
          clearPulse();
          if (refs.sampleCircle) {
            panTo(refs.sampleCircle.getLatLng());
            refs.sampleCircle.openPopup();
          }
        }
      },
      {
        text: mobile()
          ? 'These areas are <b>live</b>. Tap <b>⚙</b> any time to change your max commute time or walk-to-station — the map updates instantly.'
          : 'These areas are <b>live</b>. Change <b>Max time</b> or <b>Walk to station</b> up top any time — the map re-draws instantly. Try tightening the time and watch areas drop away.',
        show: function () {
          if (window.nfMap) nfMap.closePopup();
          highlight(document.getElementById(mobile() ? 'mobile-settings-btn' : 'header-controls'));
        }
      }
    ];

    shown = true;
    stepIndex = 0;
    buildCard();
    renderStep();
  }

  // ── helpers ─────────────────────────────────────────────────
  function esc(s) { return (window.nfEscapeHtml ? nfEscapeHtml(s) : String(s)); }
  function mobile() { return !!(window.isMobile && window.isMobile()); }

  function openMarker(marker) {
    if (!marker) return;
    clearPulse();
    panTo(marker.getLatLng());
    marker.openPopup();
  }
  function panTo(latlng) { if (window.nfMap && latlng) nfMap.panTo(latlng, { animate: true }); }

  function highlight(el) {
    clearPulse();
    if (!el) return;
    el.classList.add('demo-pulse');
    pulseEl = el;
  }
  function clearPulse() {
    if (pulseEl) { pulseEl.classList.remove('demo-pulse'); pulseEl = null; }
  }

  function injectStyles() {
    if (document.getElementById('demo-intro-styles')) return;
    var s = document.createElement('style');
    s.id = 'demo-intro-styles';
    s.textContent =
      '@keyframes demoPulse{0%{box-shadow:0 0 0 0 rgba(200,114,42,0.55)}70%{box-shadow:0 0 0 10px rgba(200,114,42,0)}100%{box-shadow:0 0 0 0 rgba(200,114,42,0)}}' +
      '.demo-pulse{border-radius:8px;animation:demoPulse 1.4s ease-out infinite;outline:2px solid var(--copper,#c8722a);outline-offset:2px}';
    document.head.appendChild(s);
  }

  // ── coach card (map steps) ──────────────────────────────────
  function buildCard() {
    if (cardEl) return;
    cardEl = document.createElement('div');
    cardEl.id = 'demo-coach';
    cardEl.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));' +
      'max-width:420px;margin:0 auto;z-index:1200;background:var(--ink,#1a1714);color:var(--cream,#f7f4ef);' +
      'border-radius:14px;padding:14px 16px;box-shadow:0 8px 28px rgba(0,0,0,0.35);font-family:inherit';
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
    cardEl.querySelector('#dc-skip').addEventListener('click', finish);
  }

  function renderStep() {
    if (!cardEl) return;
    var step = steps[stepIndex];
    var isLast = stepIndex === steps.length - 1;
    cardEl.querySelector('#dc-text').innerHTML = step.text;
    cardEl.querySelector('#dc-count').textContent = (stepIndex + 1) + ' of ' + steps.length;
    cardEl.querySelector('#dc-next').textContent = isLast ? 'See the AI features →' : 'Next →';
    cardEl.querySelector('#dc-skip').style.display = '';
    try { step.show(); } catch (e) { /* refs may be missing — fail quietly */ }
  }

  function next() {
    if (stepIndex >= steps.length - 1) { closeCard(); launchAgentShowcase(); return; }
    stepIndex++;
    renderStep();
  }

  function closeCard() {
    clearPulse();
    if (window.nfMap) nfMap.closePopup();
    if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
    cardEl = null;
  }

  // "Skip" abandons the whole intro (map steps + showcase).
  function finish() {
    closeCard();
    closeShowcase();
  }

  // ── Maloca Agent showcase (Part 2) ──────────────────────────
  // Each scenario carries the fake chat AND the areas to colour on the live map:
  // ideal → green, avoid → red, everything else reachable → amber. Names must
  // match the area/journey-times data so the bubbles actually recolour.
  var SCENARIOS = {
    green: {
      tab: '🌳 Calm & green',
      user: 'We don’t want to be too central. We’d love green space for runs and weekend walks — and ideally on the Northern line.',
      intro: 'Calmer, leafy and Northern-line connected — got it. Here’s where I’d start:',
      areas: [
        ['Clapham South', 'Clapham Common on the doorstep · Northern line'],
        ['Tooting Bec',   'Tooting Common for runs · great value · Northern line'],
        ['Highgate',      'Steps from Hampstead Heath · village feel · Northern line'],
        ['Balham',        'Leafy and foodie · quick Northern-line hop']
      ],
      outro: 'I’ve marked these green (Ideal) on your map and dialled the busier central spots down to red. Want me to prioritise the fastest commute for both of you?',
      ideal: ['Clapham South', 'Clapham Common', 'Tooting Bec', 'Tooting Broadway', 'Balham', 'Highgate', 'Hampstead', 'Archway', 'Tufnell Park', 'Wimbledon', 'Greenwich'],
      avoid: ['Camden Town', 'Dalston Junction', 'Dalston Kingsland', 'Hoxton', 'Shoreditch High Street', 'Old Street', 'Angel', 'Stoke Newington']
    },
    urban: {
      tab: '🌃 Buzzy & urban',
      user: 'Opposite for us — north London only. We want buzzy nightlife and a proper urban feel.',
      intro: 'North London, lively, urban energy — love it. I’d point you at:',
      areas: [
        ['Camden Town',        'Markets, live music and nightlife on tap'],
        ['Dalston',            'Late bars along Kingsland Road · seriously buzzy'],
        ['Shoreditch / Hoxton','Bars, clubs and a creative scene'],
        ['Islington',          'Upper Street’s restaurants, theatres and pubs']
      ],
      outro: 'These light up green (Ideal) on your map, and the quieter suburban spots drop to red. I can filter by budget or walk-to-tube whenever you like.',
      ideal: ['Camden Town', 'Dalston Junction', 'Dalston Kingsland', 'Hoxton', 'Shoreditch High Street', 'Old Street', 'Angel', 'Stoke Newington', 'Kentish Town'],
      avoid: ['Clapham South', 'Clapham Common', 'Tooting Bec', 'Tooting Broadway', 'Balham', 'Highgate', 'Hampstead', 'Wimbledon', 'Greenwich']
    }
  };

  var showcaseEl = null;
  var playToken = 0;

  function launchAgentShowcase() {
    if (showcaseEl) return;
    // Show the whole map so the recolouring is visible above the sheet.
    fitAllAreas();

    // A partial bottom sheet (NOT a full overlay) so the map stays on view and
    // visibly recolours as the visitor toggles scenarios.
    var sheet = document.createElement('div');
    sheet.id = 'demo-agent-sheet';
    sheet.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:1300;margin:0 auto;width:100%;max-width:460px;' +
      'max-height:58vh;display:flex;flex-direction:column;background:var(--cream,#f7f4ef);' +
      'border-radius:18px 18px 0 0;box-shadow:0 -8px 40px rgba(0,0,0,0.4);overflow:hidden';
    sheet.innerHTML =
      '<div style="padding:14px 18px 10px;flex-shrink:0">' +
        '<div style="font-size:16px;font-weight:700;color:var(--ink,#1a1714)">✨ Meet the Maloca Agent</div>' +
        '<div style="font-size:12.5px;color:var(--ink-mid,#3d3a35);line-height:1.5;margin-top:4px">' +
          'Sign in and the Agent reads your lifestyle, then recolours the map. Tap to compare two opposite briefs — ' +
          '<b>watch the bubbles above change</b> 👆' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:11px">' +
          '<button class="da-tab" data-s="green" style="' + tabStyle(true) + '">' + SCENARIOS.green.tab + '</button>' +
          '<button class="da-tab" data-s="urban" style="' + tabStyle(false) + '">' + SCENARIOS.urban.tab + '</button>' +
        '</div>' +
      '</div>' +
      '<div id="da-chat" style="flex:1;overflow-y:auto;padding:6px 16px 14px;background:var(--cream-mid,#efe9e0)"></div>' +
      '<div style="padding:12px 16px calc(14px + env(safe-area-inset-bottom));flex-shrink:0;border-top:1px solid var(--rule,#e3ddd2);display:flex;gap:10px;align-items:center">' +
        '<button id="da-later" style="background:none;border:none;color:var(--ink-mid,#3d3a35);font-size:13px;font-family:inherit;cursor:pointer;padding:8px 4px">Maybe later</button>' +
        '<button id="da-signin" style="margin-left:auto;background:var(--ink,#1a1714);color:var(--cream,#f7f4ef);border:none;border-radius:10px;' +
          'padding:12px 18px;font-size:13.5px;font-weight:700;font-family:inherit;cursor:pointer;min-height:44px;' +
          'touch-action:manipulation;-webkit-tap-highlight-color:transparent">Sign in to get your own →</button>' +
      '</div>';
    document.body.appendChild(sheet);
    showcaseEl = sheet;

    sheet.querySelectorAll('.da-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { selectScenario(btn.getAttribute('data-s')); });
    });
    sheet.querySelector('#da-later').addEventListener('click', closeShowcase);
    sheet.querySelector('#da-signin').addEventListener('click', function () {
      if (window.AuthManager && AuthManager.signInWithGoogle) AuthManager.signInWithGoogle();
    });

    selectScenario('green');
  }

  // Recolour the live map for a scenario: ideal→green, avoid→red, rest→amber.
  function applyScenarioColours(sc) {
    if (typeof applyFilterColors !== 'function' || !window.greenAreas) return;
    var cmap = {};
    greenAreas.forEach(function (g) { if (g.circle) cmap[g.area.name] = 'amber'; });
    sc.ideal.forEach(function (n) { if (n in cmap) cmap[n] = 'green'; });
    sc.avoid.forEach(function (n) { if (n in cmap) cmap[n] = 'red'; });
    applyFilterColors(cmap);
  }

  // Reset every bubble back to the plain green "reachable by both" commute view.
  function resetColours() {
    if (typeof applyFilterColors !== 'function' || !window.greenAreas) return;
    var cmap = {};
    greenAreas.forEach(function (g) { if (g.circle) cmap[g.area.name] = 'green'; });
    applyFilterColors(cmap);
  }

  // Fit the map to all reachable bubbles, leaving room for the bottom sheet.
  function fitAllAreas() {
    if (!window.nfMap || !window.greenAreas) return;
    var pts = greenAreas.filter(function (g) { return g.circle; }).map(function (g) { return [g.lat, g.lng]; });
    if (!pts.length) return;
    var sheetH = Math.round((window.innerHeight || 600) * 0.58);
    try {
      nfMap.fitBounds(pts, { paddingTopLeft: [24, 70], paddingBottomRight: [24, sheetH + 20] });
    } catch (e) { /* ignore */ }
  }

  function tabStyle(active) {
    return 'flex:1;font-family:inherit;font-size:12.5px;font-weight:600;padding:9px 8px;border-radius:9px;cursor:pointer;' +
      'min-height:40px;touch-action:manipulation;border:1.5px solid ' +
      (active ? 'var(--copper,#c8722a)' : 'var(--rule,#e3ddd2)') + ';' +
      'background:' + (active ? 'rgba(200,114,42,0.12)' : 'var(--white,#fff)') + ';' +
      'color:' + (active ? 'var(--copper,#c8722a)' : 'var(--ink-mid,#3d3a35)') + '';
  }

  function selectScenario(key) {
    if (!showcaseEl) return;
    showcaseEl.querySelectorAll('.da-tab').forEach(function (btn) {
      btn.setAttribute('style', tabStyle(btn.getAttribute('data-s') === key));
    });
    applyScenarioColours(SCENARIOS[key]); // recolour the live map bubbles
    playScenario(SCENARIOS[key]);
  }

  function bubbleUser(text) {
    return '<div style="text-align:right;margin:8px 0"><span style="display:inline-block;background:var(--ink,#1a1714);' +
      'color:#a3e635;padding:8px 12px;border-radius:13px 13px 4px 13px;font-size:12.5px;max-width:88%;text-align:left;' +
      'line-height:1.5">' + esc(text) + '</span></div>';
  }
  function bubbleAgent(inner) {
    return '<div style="margin:8px 0"><span style="display:inline-block;background:var(--white,#fff);color:var(--ink,#1a1714);' +
      'padding:9px 12px;border-radius:13px 13px 13px 4px;font-size:12.5px;max-width:92%;line-height:1.55;' +
      'box-shadow:0 1px 3px rgba(0,0,0,0.06)">' + inner + '</span></div>';
  }
  function thinkingBubble() {
    return '<div id="da-thinking" style="margin:8px 0"><span style="display:inline-block;background:var(--white,#fff);' +
      'color:var(--ink-ghost,#9b958a);padding:9px 12px;border-radius:13px 13px 13px 4px;font-size:12.5px">Maloca is thinking…</span></div>';
  }

  function playScenario(sc) {
    var chat = showcaseEl && showcaseEl.querySelector('#da-chat');
    if (!chat) return;
    var token = ++playToken;
    chat.innerHTML = bubbleUser(sc.user) + thinkingBubble();
    chat.scrollTop = chat.scrollHeight;

    setTimeout(function () {
      if (token !== playToken || !showcaseEl) return; // a later scenario superseded this
      var areaList = sc.areas.map(function (a) {
        return '<div style="display:flex;gap:8px;align-items:flex-start;margin-top:7px">' +
            '<span style="flex-shrink:0;background:rgba(101,163,13,0.14);color:#3d7800;font-size:10px;font-weight:800;' +
              'text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:999px;margin-top:1px">Ideal</span>' +
            '<span><b>' + esc(a[0]) + '</b> — <span style="color:var(--ink-mid,#3d3a35)">' + esc(a[1]) + '</span></span>' +
          '</div>';
      }).join('');
      var inner = esc(sc.intro) + areaList +
        '<div style="margin-top:10px;color:var(--ink-mid,#3d3a35)">' + esc(sc.outro) + '</div>';
      var thinkEl = chat.querySelector('#da-thinking');
      if (thinkEl) thinkEl.remove();
      chat.insertAdjacentHTML('beforeend', bubbleAgent(inner));
      chat.scrollTop = chat.scrollHeight;
    }, 850);
  }

  function closeShowcase() {
    playToken++;
    if (showcaseEl && showcaseEl.parentNode) showcaseEl.parentNode.removeChild(showcaseEl);
    showcaseEl = null;
    resetColours(); // back to the plain green commute view
  }

  return { run: run };
})();
