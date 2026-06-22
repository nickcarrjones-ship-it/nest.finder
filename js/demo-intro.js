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
      // Bigger, more legible chat input while the Agent demo fake-types into it.
      '.demo-big-input{font-size:15px !important;padding:12px 14px !important;min-height:48px;line-height:1.4}' +
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
    sheetState('half'); // map on top, Agent chat in the half-height sheet below (mobile)
    frameMapForAgent();

    elChat  = document.getElementById('filter-chat-history');
    elInput = document.getElementById('filter-input');
    elSend  = document.getElementById('filter-send-btn');
    elThink = document.getElementById('filter-thinking');

    if (elChat) elChat.innerHTML = '';
    // Enlarge the input so the fake typing is clearly legible as it appears.
    if (elInput) { elInput.disabled = true; elInput.placeholder = 'Demo — watch the Agent work…'; elInput.classList.add('demo-big-input'); }
    if (elSend)  elSend.disabled = true;

    ranked     = buildRanked();
    commuteMax = buildCommuteMax();
    // Opening callout — frame what the user is about to watch before the first reply.
    showFilterNudge('🗨️ Tell the Agent about your life in the box below — watch the map change as it suggests the areas that suit you.', 4200);
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

  // Per-turn callout copy. Turns 1-2 explain how the Agent works (replacing the
  // old generic pills); later turns just nudge the eye to the re-filtering map.
  function stageNudgeText(i, st) {
    if (st.final) return '✨ Your shortlist — the map just narrowed to the best fits';
    if (i === 1) return '➕ Add more detail any time — the map updates live as you go.';
    if (i === 0) return null; // covered by the opening callout in launchAgentDemo
    return '👀 Watch the map re-filter to match';
  }

  function runStage(i, token) {
    if (token !== demoToken || i >= STAGES.length) return;
    var st = STAGES[i];
    typeInto(st.user, token, function () {           // 1. fake-type the message (enlarged input)
      if (token !== demoToken) return;
      if (elInput) elInput.value = '';
      appendUserMsg(st.user);                        // 2. "send" → user bubble
      showThinking(true);                            // 3. Agent thinks…
      wait(1500, token, function () {
        showThinking(false);
        appendAgentReply(st);                        // 4. the REPLY lands first — the user reads it…
        wait(1100, token, function () {
          if (st.cap) setCommuteCap(st.cap);
          applyStageColours(st.greenN, st.amberN, st.cap); // 5. …THEN the map visibly re-filters
          var nudge = stageNudgeText(i, st);               //    with a callout to watch it happen
          if (nudge) showFilterNudge(nudge, st.final ? 2800 : 3000);
          if (st.final) { wait(2600, token, function () { endAgentDemo(token); }); }
          else { wait(3800, token, function () { runStage(i + 1, token); }); }
        });
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

  // ── Part 3 — post-areas tour (real tabs, seeded demo data) ──────
  // Shows what happens AFTER the areas are found: track viewings on a calendar,
  // quick-add straight from a listing link, and an auto-ranked shortlist. Demo
  // data is seeded into the in-memory caches only (no Firebase writes — the user
  // isn't signed in) and cleared by auth.js / clearSeed() on sign-in. The tour is
  // user-paced via a top coach card so it never outruns a reader.

  var tourCard = null, tourIndex = 0, tourSteps = [], tourSeeded = false, tourToken = 0;

  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoFromOffset(days) {
    var d = new Date(); d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Seed believable viewings + must-haves so the real tabs render with content.
  function seedTourData() {
    if (tourSeeded) return;
    tourSeeded = true;
    window.nonNegotiables = ['Garden', 'Period features', 'Near a park', 'Two bathrooms'];
    function results(map) {
      var out = {};
      window.nonNegotiables.forEach(function (item) { out[viewingsSanitize(item)] = !!map[item]; });
      return out;
    }
    window.viewingsCache = {
      'demo-v1': {
        address: '24 Wilton Way, London Fields', area: 'London Fields',
        date: isoFromOffset(-4), time: '11:00', price: '625000', agentName: 'Foxtons',
        status: 'viewed', rankOrder: 1, lat: 51.5417, lng: -0.0586,
        notes: 'Loads of light, lovely garden, two minutes from the park.',
        nnResults: results({ 'Garden': true, 'Period features': true, 'Near a park': true, 'Two bathrooms': false })
      },
      'demo-v2': {
        address: '8 Bellenden Road, Peckham Rye', area: 'Peckham Rye',
        date: isoFromOffset(-2), time: '15:30', price: '600000', agentName: 'Winkworth',
        status: 'viewed', rankOrder: 2, lat: 51.4690, lng: -0.0690,
        notes: 'Great street, but no outside space.',
        nnResults: results({ 'Garden': false, 'Period features': true, 'Near a park': true, 'Two bathrooms': false })
      },
      'demo-v3': {
        address: '15 Saltoun Road, Brixton', area: 'Brixton',
        date: isoFromOffset(3), time: '14:00', price: '650000', agentName: 'Hamptons',
        status: 'scheduled', lat: 51.4626, lng: -0.1145, notes: ''
      }
    };
    if (typeof renderViewingPins === 'function') { try { renderViewingPins(); } catch (e) {} }
  }

  // Wipe seeded demo data (called on sign-in via DemoIntro.clearSeed too).
  function clearSeed() {
    tourSeeded = false;
    window.viewingsCache = {};
    window.wishlistCache = {};
    window.nonNegotiables = [];
    if (typeof renderViewingPins === 'function') { try { renderViewingPins(); } catch (e) {} }
  }

  // A small floating callout near the top of the map. Longer Agent-demo copy wraps
  // onto two lines (no ellipsis). pointer-events:none so it never blocks a tap.
  var filterNudge = null;
  function showFilterNudge(text, holdMs) {
    clearFilterNudge();
    filterNudge = document.createElement('div');
    filterNudge.id = 'demo-filter-nudge';
    filterNudge.innerHTML = text;
    filterNudge.style.cssText =
      'position:fixed;top:' + (mobile() ? 'calc(env(safe-area-inset-top) + 10px)' : '72px') + ';' +
      'left:50%;transform:translateX(-50%);z-index:1250;background:rgba(26,23,20,0.92);' +
      'color:var(--cream,#f7f4ef);font-family:inherit;font-size:12.5px;font-weight:600;line-height:1.45;' +
      'padding:9px 15px;border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,0.3);' +
      'pointer-events:none;max-width:min(420px,90vw);text-align:center';
    document.body.appendChild(filterNudge);
    if (holdMs) wait(holdMs, demoToken, clearFilterNudge);
  }

  // Persistent colour key, shown once the chat collapses to a full-screen map so
  // the recoloured bubbles read on their own while the tour invites the first tap.
  var keyCallout = null;
  function showKeyCallout(token) {
    if (token !== demoToken) return;
    clearKeyCallout();
    keyCallout = document.createElement('div');
    keyCallout.id = 'demo-key-callout';
    keyCallout.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:6px">' +
        '<span style="width:11px;height:11px;border-radius:50%;background:#84cc16;box-shadow:0 0 0 1px rgba(0,0,0,0.2)"></span>Green = your ideal areas</span>' +
      '<span style="opacity:0.45">·</span>' +
      '<span style="display:inline-flex;align-items:center;gap:6px">' +
        '<span style="width:11px;height:11px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 1px rgba(0,0,0,0.2)"></span>Red = areas to avoid</span>';
    keyCallout.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);' +
      'bottom:calc(' + (mobile() ? '72px' : '24px') + ' + env(safe-area-inset-bottom));z-index:1250;' +
      'display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;' +
      'background:rgba(26,23,20,0.92);color:var(--cream,#f7f4ef);font-family:inherit;font-size:12px;font-weight:600;' +
      'padding:9px 15px;border-radius:14px;box-shadow:0 4px 16px rgba(0,0,0,0.3);pointer-events:none;max-width:90vw;text-align:center';
    document.body.appendChild(keyCallout);
  }
  function clearKeyCallout() {
    if (keyCallout && keyCallout.parentNode) keyCallout.parentNode.removeChild(keyCallout);
    keyCallout = null;
  }

  // End of the scripted Agent chat: collapse the sheet to a full-screen map,
  // re-fit the bubbles, then reveal the colour key before the guided tour begins.
  function endAgentDemo(token) {
    if (token !== demoToken) return;
    clearFilterNudge();
    sheetState('map');                                  // slide the chat sheet away (mobile)
    if (elInput) elInput.classList.remove('demo-big-input');
    setTimeout(function () {
      if (token !== demoToken) return;
      if (window.nfMap && window.greenAreas) {
        try {
          nfMap.invalidateSize();
          var pts = greenAreas.filter(function (g) { return g.circle; }).map(function (g) { return [g.lat, g.lng]; });
          if (pts.length) {
            var topPad = mobile() ? 70 : 80;   // clear the tour card at the top
            var botPad = mobile() ? 130 : 60;  // clear the bottom nav + colour key
            nfMap.fitBounds(pts, { paddingTopLeft: [22, topPad], paddingBottomRight: [22, botPad], maxZoom: 13 });
          }
        } catch (e) { /* ignore */ }
      }
      showKeyCallout(token);
      wait(2200, token, function () { startTour(token); });
    }, 360);
  }
  function clearFilterNudge() {
    if (filterNudge && filterNudge.parentNode) filterNudge.parentNode.removeChild(filterNudge);
    filterNudge = null;
  }

  // Three sheet states for the demo:
  //   'map'  → sheet hidden, map full-screen (mobile needs sheet-open removed)
  //   'half' → map on top, chat/content in a 50vh sheet below
  //   'full' → sheet covers ~2/3 for tab-content focus
  // On desktop the sidebar is always present, so these classes are inert there.
  function sheetState(state) {
    var sb = document.getElementById('sidebar');
    if (!sb) return;
    if (state === 'half') {
      sb.classList.add('demo-half-sheet');
      if (mobile()) sb.classList.add('sheet-open');
    } else if (state === 'full') {
      sb.classList.remove('demo-half-sheet');
      if (mobile()) sb.classList.add('sheet-open');
    } else { // 'map'
      sb.classList.remove('demo-half-sheet');
      if (mobile()) sb.classList.remove('sheet-open');
    }
  }

  // The strongest-fit green area on the live map — what we open in the Area-tab steps.
  function sampleGreenArea() {
    var greens = (typeof stageGreens === 'function')
      ? stageGreens(STAGES[STAGES.length - 1]) : [];
    var name = greens[0] || (ranked && ranked[0]);
    var greenList = window.greenAreas || [];
    var match = greenList.filter(function (g) { return g.circle && g.area && g.area.name === name; })[0];
    return match || greenList.filter(function (g) { return g.circle; })[0] || null;
  }

  function scrollAreaTo(id) {
    var el = document.getElementById(id);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // ── The guided tour: green bubble → Area tab → Viewings → Shortlist → CTA ──
  function startTour(token) {
    if (token !== demoToken) return;
    tourToken = token;
    clearFilterNudge();
    seedTourData();

    tourSteps = [
      { // 1 — invite the tap, with the map visible
        text: '<b>🟢 Tap a green bubble to explore it.</b> Every green area reaches both your works in time — and there’s a whole profile behind each one. I’ll open one for you.',
        show: function () {
          sheetState('map'); // keep the full map + colour key on screen for this step
          var g = sampleGreenArea();
          if (g && window.nfMap) {
            var ll = g.circle.getLatLng ? g.circle.getLatLng() : [g.lat, g.lng];
            nfMap.panTo(ll, { animate: true });
            if (g.circle.openPopup) g.circle.openPopup();
          }
        }
      },
      { // 2 — Area tab: profile + the 1–10 score
        text: '<b>Here’s the area’s profile.</b> When you visit in person, you and your partner each give it a score out of 10 — that’s how you high-grade the places you both love.',
        show: function () {
          clearKeyCallout();
          sheetState('full');
          if (window.nfMap) nfMap.closePopup();
          var g = sampleGreenArea();
          if (g && typeof openAreaInfo === 'function') {
            var times = g.memberTimes || [g.t1, g.t2];
            openAreaInfo(g.area, times[0], times[1], true);
          }
          setTimeout(function () {
            scrollAreaTo('score-rows-container');
            highlight(document.getElementById('score-rows-container'));
          }, 400);
        }
      },
      { // 3 — the rest of the sections
        text: '<b>Everything else is here too.</b> Council tax, the high street, lifestyle &amp; amenities, transport, crime and noise — all in one place, instead of ten browser tabs.',
        show: function () { clearPulse(); scrollAreaTo('ai-lifestyle-content'); }
      },
      { // 4 — into Viewings / calendar
        text: '<b>📅 Found one you love? Book a viewing.</b> Every viewing lands on a calendar that colour-codes your week — upcoming, viewed and want-to-view at a glance.',
        show: function () { clearPulse(); switchTab('viewings'); }
      },
      { // 5 — paste-to-add (scripted illusion in the demo; it’s real once you sign in)
        text: '<b>🔗 Adding a place is one paste.</b> Drop in a Rightmove or Zoopla link and Maloca reads the address, area and price for you.',
        show: function () { playPasteMock(); }
      },
      { // 6 — shared calendar
        text: '<b>🗓 Sync to your shared calendar.</b> One tap sends a viewing to Apple or Google Calendar — straight into the calendar you and your partner both see.',
        show: function () {
          switchTab('viewings');
          setTimeout(function () { highlight(document.querySelector('#content-viewings button[onclick*="showCalLinkModal"]')); }, 150);
        }
      },
      { // 7 — must-haves
        text: '<b>✅ Set your must-haves once.</b> Garden, two bathrooms, near a park — your list as a couple. After each viewing you tick what’s actually there.',
        show: function () {
          clearPulse();
          switchTab('viewings');
          setTimeout(function () { highlight(document.querySelector('#content-viewings button[onclick*="showNNSetupModal"]')); }, 150);
        }
      },
      { // 8 — auto-ranked shortlist
        text: '<b>🏆 The shortlist ranks itself.</b> Every property is scored by how many must-haves it hits and ordered automatically — a clear, data-driven league table, no spreadsheets.',
        show: function () { clearPulse(); switchTab('shortlist'); }
      },
      { // 9 — sign-in CTA
        text: '<b>That’s Maloca.</b> Sign in and it’s all yours — your areas, your viewings, your shortlist, in sync with your partner.',
        show: function () { clearPulse(); }
      }
    ];

    tourIndex = 0;
    buildTourCard();
    renderTourStep();
  }

  // Scripted paste-a-listing illusion: reveal the add form, fake-type a listing
  // URL, then auto-fill the address/area/price as if parsed from the link.
  function playPasteMock() {
    switchTab('viewings');
    setTimeout(function () {
      if (typeof toggleAddForm === 'function') toggleAddForm(true);
      var form = document.getElementById('viewing-add-form');
      if (!form) return;
      var urlEl  = form.querySelector('[name="listingUrl"]');
      var addrEl = form.querySelector('[name="address"]');
      var areaEl = form.querySelector('[name="area"]');
      var priceEl = form.querySelector('[name="price"]');
      if (urlEl) urlEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      var url = 'https://www.rightmove.co.uk/properties/152418321';
      typeIntoEl(urlEl, url, tourToken, function () {
        highlight(urlEl);
        wait(900, tourToken, function () {
          clearPulse();
          if (areaEl)  areaEl.value = 'Brixton';
          if (priceEl) priceEl.value = '650000';
          typeIntoEl(addrEl, '15 Saltoun Road, Brixton, SW2 1EP', tourToken, function () {
            highlight(addrEl);
            wait(700, tourToken, function () { clearPulse(); });
          });
        });
      });
    }, 160);
  }

  // Like typeInto but targets an arbitrary input/textarea element.
  function typeIntoEl(el, text, token, cb) {
    if (!el) { if (cb) cb(); return; }
    el.value = '';
    var i = 0;
    (function step() {
      if (token !== tourToken) return;
      i++;
      el.value = text.slice(0, i);
      if (i < text.length) setTimeout(step, 24);
      else wait(350, token, cb);
    })();
  }

  function buildTourCard() {
    if (tourCard) return;
    tourCard = document.createElement('div');
    tourCard.id = 'demo-tour';
    tourCard.style.cssText =
      'position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));' +
      'max-width:440px;margin:0 auto;z-index:1300;background:var(--ink,#1a1714);color:var(--cream,#f7f4ef);' +
      'border-radius:14px;padding:14px 16px;box-shadow:0 8px 28px rgba(0,0,0,0.35);font-family:inherit';
    tourCard.innerHTML =
      '<div id="dt-text" style="font-size:13.5px;line-height:1.5;margin-bottom:10px"></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span id="dt-count" style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:rgba(247,244,239,0.55)"></span>' +
        '<button id="dt-skip" style="background:none;border:none;color:rgba(247,244,239,0.55);font-size:12px;font-family:inherit;cursor:pointer;padding:6px 4px">Skip</button>' +
        '<button id="dt-next" style="margin-left:auto;background:var(--copper,#c8722a);color:#fff;border:none;border-radius:8px;' +
          'padding:9px 16px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;min-height:40px;' +
          'touch-action:manipulation;-webkit-tap-highlight-color:transparent"></button>' +
      '</div>';
    document.body.appendChild(tourCard);
    tourCard.querySelector('#dt-next').addEventListener('click', tourNext);
    tourCard.querySelector('#dt-skip').addEventListener('click', endTour);
  }

  function renderTourStep() {
    if (!tourCard) return;
    var step = tourSteps[tourIndex];
    var isLast = tourIndex === tourSteps.length - 1;
    tourCard.querySelector('#dt-text').innerHTML = step.text;
    tourCard.querySelector('#dt-count').textContent = (tourIndex + 1) + ' of ' + tourSteps.length;
    tourCard.querySelector('#dt-next').textContent = isLast ? 'Sign in to try your own →' : 'Next →';
    try { step.show(); } catch (e) { /* fail quietly */ }
  }

  function tourNext() {
    if (tourIndex >= tourSteps.length - 1) {
      endTour();
      if (window.AuthManager) AuthManager.signInWithGoogle();
      return;
    }
    tourIndex++;
    renderTourStep();
  }

  function endTour() {
    clearPulse();
    clearFilterNudge();
    clearKeyCallout();
    sheetState('full');
    if (tourCard && tourCard.parentNode) tourCard.parentNode.removeChild(tourCard);
    tourCard = null;
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

  return { run: run, clearSeed: clearSeed };
})();
