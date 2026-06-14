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
      '.demo-pulse{border-radius:8px;animation:demoPulse 1.4s ease-out infinite;outline:2px solid var(--copper,#c8722a);outline-offset:2px}' +
      // During the Agent demo, shorten the mobile bottom sheet so the map shows above it.
      '@media (max-width:767px){.sidebar.demo-half-sheet{height:50vh !important}}';
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
    if (stepIndex >= steps.length - 1) { closeCard(); launchAgentDemo(); return; }
    stepIndex++;
    renderStep();
  }

  function closeCard() {
    clearPulse();
    if (window.nfMap) nfMap.closePopup();
    if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
    cardEl = null;
  }

  // "Skip" abandons the map walkthrough before the Agent demo starts.
  function finish() {
    closeCard();
  }

  // ── Maloca Agent demo (Part 2) — plays in the REAL Agent tab ──
  // A scripted, zero-cost run-through: the user's brief is "typed" into the real
  // chat input, the Agent "thinks", replies with area suggestions, and the live
  // map recolours (ideal→green, avoid→red, rest→amber). Two opposite briefs play
  // back to back so the map visibly flips. No API calls.
  var SCENARIOS = {
    green: {
      user: 'We don’t want to be too central. We’d love green space for runs and weekend walks — and ideally on the Northern line.',
      intro: 'Calmer, leafy and Northern-line connected — got it. Here’s where I’d start:',
      areas: [
        ['Clapham South', 'Clapham Common on the doorstep · Northern line'],
        ['Tooting Bec',   'Tooting Common for runs · great value · Northern line'],
        ['Highgate',      'Steps from Hampstead Heath · village feel · Northern line'],
        ['Balham',        'Leafy and foodie · quick Northern-line hop']
      ],
      outro: 'I’ve turned these green (Ideal) on your map and dialled the busier, central spots down to red. Want me to prioritise the fastest commute for both of you?',
      ideal: ['Clapham South', 'Clapham Common', 'Tooting Bec', 'Tooting Broadway', 'Balham', 'Highgate', 'Hampstead', 'Archway', 'Tufnell Park', 'Wimbledon', 'Greenwich'],
      avoid: ['Camden Town', 'Dalston Junction', 'Dalston Kingsland', 'Hoxton', 'Shoreditch High Street', 'Old Street', 'Angel', 'Stoke Newington']
    },
    urban: {
      user: 'Opposite for us — north London only. We want buzzy nightlife and a proper urban feel.',
      intro: 'North London, lively, urban energy — love it. I’d point you at:',
      areas: [
        ['Camden Town',        'Markets, live music and nightlife on tap'],
        ['Dalston',            'Late bars along Kingsland Road · seriously buzzy'],
        ['Shoreditch / Hoxton','Bars, clubs and a creative scene'],
        ['Islington',          'Upper Street’s restaurants, theatres and pubs']
      ],
      outro: 'These light up green (Ideal), and the quieter suburban spots drop to red. I can filter by budget or walk-to-tube whenever you like.',
      ideal: ['Camden Town', 'Dalston Junction', 'Dalston Kingsland', 'Hoxton', 'Shoreditch High Street', 'Old Street', 'Angel', 'Stoke Newington', 'Kentish Town'],
      avoid: ['Clapham South', 'Clapham Common', 'Tooting Bec', 'Tooting Broadway', 'Balham', 'Highgate', 'Hampstead', 'Wimbledon', 'Greenwich']
    }
  };

  var demoToken = 0;
  var elChat, elInput, elSend, elThink;

  function launchAgentDemo() {
    // Open the real Agent tab. On mobile switchTab() raises the bottom sheet;
    // we shorten it to half so the map stays visible above it.
    if (typeof switchTab === 'function') switchTab('filter');
    var sidebar = document.getElementById('sidebar');
    if (mobile() && sidebar) sidebar.classList.add('demo-half-sheet');
    frameMapForAgent();

    elChat  = document.getElementById('filter-chat-history');
    elInput = document.getElementById('filter-input');
    elSend  = document.getElementById('filter-send-btn');
    elThink = document.getElementById('filter-thinking');

    if (elChat) elChat.innerHTML = '';
    if (elInput) { elInput.disabled = true; elInput.placeholder = 'Demo — watch the Agent work…'; }
    if (elSend)  elSend.disabled = true;

    var token = ++demoToken;
    playAgentScenario('green', token, function () {
      wait(2900, token, function () {
        appendDivider();
        playAgentScenario('urban', token, function () {
          wait(1300, token, function () { endAgentDemo(token); });
        });
      });
    });
  }

  // Zoom to a level where bubbles are distinct (not one zoomed-out blob), and
  // re-measure the map after the sheet animates so it isn't squashed.
  function frameMapForAgent() {
    if (!window.nfMap) return;
    setTimeout(function () {
      try {
        nfMap.invalidateSize();
        nfMap.setView(mobile() ? [51.503, -0.086] : [51.513, -0.090], 12);
      } catch (e) { /* ignore */ }
    }, 380);
  }

  function playAgentScenario(key, token, done) {
    var sc = SCENARIOS[key];
    typeInto(sc.user, token, function () {        // 1. fake-type the brief
      if (token !== demoToken) return;
      if (elInput) elInput.value = '';
      appendUserMsg(sc.user);                     // 2. "send" → user bubble
      showThinking(true);                         // 3. Agent thinks…
      wait(1300, token, function () {
        showThinking(false);
        applyScenarioColours(sc);                 // 4. the map recolours…
        appendAgentMsg(sc);                       //    …and the reply lands
        if (done) done();
      });
    });
  }

  function typeInto(text, token, cb) {
    if (!elInput) { if (cb) cb(); return; }
    elInput.value = '';
    var i = 0;
    (function step() {
      if (token !== demoToken) return;
      i++;
      elInput.value = text.slice(0, i);
      if (i < text.length) setTimeout(step, 24);
      else wait(380, token, cb);
    })();
  }

  function showThinking(on) {
    if (elThink) elThink.style.display = on ? 'block' : 'none';
    if (on && elChat) elChat.scrollTop = elChat.scrollHeight;
  }

  function appendUserMsg(text) {
    if (window.appendUserBubble) { appendUserBubble(text); return; }
    if (!elChat) return;
    var d = document.createElement('div');
    d.style.cssText = 'text-align:right;margin-bottom:8px';
    d.innerHTML = '<span style="display:inline-block;background:#1a1f36;color:#a3e635;padding:7px 11px;' +
      'border-radius:12px 12px 3px 12px;font-size:12px;max-width:85%;text-align:left;line-height:1.5">' + esc(text) + '</span>';
    elChat.appendChild(d); elChat.scrollTop = elChat.scrollHeight;
  }

  function appendAgentMsg(sc) {
    if (!elChat) return;
    var areaList = sc.areas.map(function (a) {
      return '<div style="display:flex;gap:8px;align-items:flex-start;margin-top:7px">' +
          '<span style="flex-shrink:0;background:rgba(101,163,13,0.16);color:#3d7800;font-size:10px;font-weight:800;' +
            'text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:999px;margin-top:1px">Ideal</span>' +
          '<span><b>' + esc(a[0]) + '</b> — <span style="color:#6b7280">' + esc(a[1]) + '</span></span>' +
        '</div>';
    }).join('');
    var inner = esc(sc.intro) + areaList + '<div style="margin-top:9px;color:#6b7280">' + esc(sc.outro) + '</div>';
    var d = document.createElement('div');
    d.style.cssText = 'margin-bottom:8px';
    d.innerHTML = '<span style="display:inline-block;background:#f1f5f9;color:#374151;padding:8px 11px;' +
      'border-radius:12px 12px 12px 3px;font-size:12px;max-width:94%;line-height:1.5">' + inner + '</span>';
    elChat.appendChild(d); elChat.scrollTop = elChat.scrollHeight;
  }

  function appendDivider() {
    if (!elChat) return;
    var d = document.createElement('div');
    d.style.cssText = 'text-align:center;margin:12px 0 6px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#b9c2cc';
    d.textContent = '— now a very different brief —';
    elChat.appendChild(d); elChat.scrollTop = elChat.scrollHeight;
  }

  function endAgentDemo(token) {
    if (token !== demoToken || !elChat) return;
    var d = document.createElement('div');
    d.style.cssText = 'margin:14px 0 4px;text-align:center';
    d.innerHTML =
      '<div style="font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:9px">That’s the Maloca Agent reading just two lines. ' +
        'Sign in and it tunes every area to <i>your</i> life — then keeps refining as you chat.</div>' +
      '<button onclick="if(window.AuthManager)AuthManager.signInWithGoogle()" style="background:var(--copper,#c8722a);color:#fff;' +
        'border:none;border-radius:9px;padding:11px 18px;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;' +
        'min-height:44px;touch-action:manipulation;-webkit-tap-highlight-color:transparent">Sign in to try your own →</button>';
    elChat.appendChild(d); elChat.scrollTop = elChat.scrollHeight;
    if (elInput) elInput.placeholder = 'Sign in to chat with the Agent…';
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

  function wait(ms, token, cb) {
    setTimeout(function () { if (token === demoToken && cb) cb(); }, ms);
  }

  return { run: run };
})();
