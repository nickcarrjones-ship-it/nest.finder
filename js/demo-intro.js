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
  // A scripted, zero-cost run-through of ONE realistic search: a late-20s couple
  // refining their brief over several messages. Each turn is fake-typed into the
  // real chat, the Agent "thinks", replies, and the live map recolours — narrowing
  // from a broad spread of Ideal areas down to a tight 5-area shortlist. No API calls.

  // Curated "fit" ranking, trendiest-first. Top 5 become the final shortlist; the
  // rest of the reachable map falls in behind (amber→red) as the search tightens.
  var CURATED = [
    'London Fields', 'Brixton', 'Peckham Rye', 'Walthamstow Central', 'Hackney Central',
    'Hackney Wick', 'Clapton', 'Dalston Junction', 'Dalston Kingsland', 'Stoke Newington',
    'Leyton', 'Brockley', 'Nunhead', 'Honor Oak Park', 'Forest Hill', 'Crofton Park',
    'New Cross', 'New Cross Gate', 'Deptford', 'Bethnal Green', 'Haggerston', 'Hoxton',
    'Cambridge Heath', 'Homerton', 'Tooting Broadway', 'Tooting Bec', 'Balham',
    'Denmark Hill', 'Loughborough Junction', 'Clapham North', 'Clapham High Street',
    'Bow Road', 'Mile End', 'Bermondsey', 'Maze Hill'
  ];

  // greenN/amberN per turn → everything else goes red. The spread narrows each msg.
  var STAGES = [
    { user: 'We’re late-20s, moving in together. Top of the list: proper independent coffee, green space we can run in at weekends, and a good local pub.',
      reply: 'Love it — indie coffee, weekend runs and a real local is such a London thing. Here’s a first pass: I’ve greened the areas that fit the vibe and parked the central, chain-heavy spots in red. Loads to play with — let’s narrow it down.',
      greenN: 30, amberN: 102 },
    { user: 'Narrow it — we’d both jog to a parkrun, and a lido or open-water swim would be a dream.',
      reply: 'A parkrun on the doorstep plus a swim really thins the field — think Brockwell, London Fields and Hilly Fields territory. Down to about 15 strong fits now.',
      greenN: 15, amberN: 67 },
    { user: 'We also want a buzzy brunch scene and an indie cinema nearby — nothing too corporate or touristy.',
      reply: 'Now we’re talking. Leaning into independent, creative neighbourhoods, about 8 areas nail all of it: great coffee, a run, a swim, brunch and a proper picturehouse.',
      greenN: 8, amberN: 34 },
    { user: 'Last thing — cap both our commutes at 45 minutes door-to-door, and lean toward better-value rents.',
      reply: 'Done — tightened to a 45-minute door-to-door for both of you (anything slower drops to red) and leaned into better value. Here’s your shortlist — 5 areas that hit everything:',
      greenN: 5, amberN: 10, cap: 45, final: true }
  ];

  var demoToken = 0;
  var elChat, elInput, elSend, elThink, ranked, commuteMax;

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

    ranked     = buildRanked();
    commuteMax = buildCommuteMax();
    runStage(0, ++demoToken);
  }

  // Build the fit ranking: curated trendy areas first, then every other reachable
  // area behind them. Drives which bubbles are green/amber/red at each stage.
  function buildRanked() {
    var present = {};
    (window.greenAreas || []).forEach(function (g) { if (g.circle) present[g.area.name] = true; });
    var list = CURATED.filter(function (n) { return present[n]; });
    var seen = {}; list.forEach(function (n) { seen[n] = true; });
    (window.greenAreas || []).forEach(function (g) {
      if (g.circle && !seen[g.area.name]) { list.push(g.area.name); seen[g.area.name] = true; }
    });
    return list;
  }

  // Worst (longest) door-to-door commute per area, so the 45-min cap can drop
  // anything slower to red.
  function buildCommuteMax() {
    var m = {};
    (window.greenAreas || []).forEach(function (g) {
      if (!g.circle) return;
      var times = g.memberTimes || [g.t1, g.t2 || 0];
      m[g.area.name] = Math.max.apply(null, times);
    });
    return m;
  }

  // Reflect a refined cap in the real Max-time controls (display only — we recolour
  // rather than re-running the search, to keep the demo chat intact).
  function setCommuteCap(mins) {
    ['commute-max-shared', 'mob-commute-max'].forEach(function (id) {
      var sel = document.getElementById(id);
      if (sel) sel.value = String(mins);
    });
  }

  function runStage(i, token) {
    if (token !== demoToken || i >= STAGES.length) return;
    var st = STAGES[i];
    typeInto(st.user, token, function () {           // 1. fake-type the message
      if (token !== demoToken) return;
      if (elInput) elInput.value = '';
      appendUserMsg(st.user);                        // 2. "send" → user bubble
      showThinking(true);                            // 3. Agent thinks…
      wait(1600, token, function () {
        showThinking(false);
        if (st.cap) setCommuteCap(st.cap);
        applyStageColours(st.greenN, st.amberN, st.cap); // 4. map recolours…
        appendAgentReply(st);                        //    …and the reply lands
        if (st.final) { wait(1000, token, function () { appendSignInCTA(token); }); }
        else { wait(5000, token, function () { runStage(i + 1, token); }); } // time to read + watch
      });
    });
  }

  // Show the WHOLE map (every reachable bubble) so the colour shifts read across
  // all of London. Re-measure after the sheet animates so the map isn't squashed.
  function frameMapForAgent() {
    if (!window.nfMap || !window.greenAreas) return;
    var pts = greenAreas.filter(function (g) { return g.circle; }).map(function (g) { return [g.lat, g.lng]; });
    setTimeout(function () {
      try {
        nfMap.invalidateSize();
        if (!pts.length) return;
        if (mobile()) {
          // Reserve the bottom half (chat sheet ≈50vh) PLUS the 60px bottom nav so
          // no bubbles hide under the chat; small top padding lifts the cluster up
          // into the empty space at the top of the map.
          var h = window.innerHeight || 700;
          var botPad = Math.round(h * 0.5) + 60 + 20;
          nfMap.fitBounds(pts, { paddingTopLeft: [22, 24], paddingBottomRight: [22, botPad], maxZoom: 13 });
        } else {
          nfMap.fitBounds(pts, { paddingTopLeft: [22, 64], paddingBottomRight: [22, 24], maxZoom: 13 });
        }
      } catch (e) { /* ignore */ }
    }, 380);
  }

  function typeInto(text, token, cb) {
    if (!elInput) { if (cb) cb(); return; }
    elInput.value = '';
    var i = 0;
    (function step() {
      if (token !== demoToken) return;
      i++;
      elInput.value = text.slice(0, i);
      if (i < text.length) setTimeout(step, 26);
      else wait(450, token, cb);
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

  // The areas shown green for a stage (respects the optional commute cap), so the
  // final shortlist chips match the dots on the map.
  function stageGreens(st) {
    var eligible = st.cap
      ? ranked.filter(function (n) { return commuteMax[n] !== undefined && commuteMax[n] <= st.cap; })
      : ranked;
    return eligible.slice(0, st.greenN);
  }

  function appendAgentReply(st) {
    if (!elChat) return;
    var inner = esc(st.reply);
    if (st.final) {
      inner += stageGreens(st).map(function (n) {
        return '<div style="display:flex;gap:8px;align-items:center;margin-top:7px">' +
            '<span style="flex-shrink:0;background:rgba(101,163,13,0.16);color:#3d7800;font-size:10px;font-weight:800;' +
              'text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:999px">Ideal</span>' +
            '<b>' + esc(n) + '</b></div>';
      }).join('');
      inner += '<div style="margin-top:9px;color:#6b7280">Plus ' + st.amberN +
        ' more worth a look in amber. Sign in and we can rate them, compare commutes and start booking viewings.</div>';
    }
    var d = document.createElement('div');
    d.style.cssText = 'margin-bottom:8px';
    d.innerHTML = '<span style="display:inline-block;background:#f1f5f9;color:#374151;padding:8px 11px;' +
      'border-radius:12px 12px 12px 3px;font-size:12px;max-width:94%;line-height:1.5">' + inner + '</span>';
    elChat.appendChild(d); elChat.scrollTop = elChat.scrollHeight;
  }

  function appendSignInCTA(token) {
    if (token !== demoToken || !elChat) return;
    var d = document.createElement('div');
    d.style.cssText = 'margin:14px 0 4px;text-align:center';
    d.innerHTML =
      '<div style="font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:9px">That’s the Maloca Agent — and it keeps learning as you chat. ' +
        'Sign in to tune every area to <i>your</i> life.</div>' +
      '<button onclick="if(window.AuthManager)AuthManager.signInWithGoogle()" style="background:var(--copper,#c8722a);color:#fff;' +
        'border:none;border-radius:9px;padding:11px 18px;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;' +
        'min-height:44px;touch-action:manipulation;-webkit-tap-highlight-color:transparent">Sign in to try your own →</button>';
    elChat.appendChild(d); elChat.scrollTop = elChat.scrollHeight;
    if (elInput) elInput.placeholder = 'Sign in to chat with the Agent…';
  }

  // Recolour the live map for a stage: among the eligible areas, top greenN ranked
  // → green, next amberN → amber, the rest red. A `cap` (max door-to-door minutes)
  // forces anything slower straight to red and out of the green/amber running.
  function applyStageColours(greenN, amberN, cap) {
    if (typeof applyFilterColors !== 'function' || !ranked) return;
    var cmap = {};
    ranked.forEach(function (n) { cmap[n] = 'red'; }); // default everything to red
    var eligible = cap
      ? ranked.filter(function (n) { return commuteMax[n] !== undefined && commuteMax[n] <= cap; })
      : ranked;
    eligible.forEach(function (n, idx) {
      cmap[n] = idx < greenN ? 'green' : (idx < greenN + amberN ? 'amber' : 'red');
    });
    applyFilterColors(cmap);
  }

  function wait(ms, token, cb) {
    setTimeout(function () { if (token === demoToken && cb) cb(); }, ms);
  }

  return { run: run };
})();
