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
 *   A short, fully scripted (fake, zero-cost) taste of the AI Agent — one chat
 *   exchange, then the map refines to green (ideal) / amber (worth a look) /
 *   red (avoid). The chat window stays scrollable throughout so the whole
 *   conversation can be read.
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
  var arrowEl = null;      // animated arrow pointing at the settings control
  var disabledControl = null; // settings control made non-clickable during the demo

  function isDemo() {
    return !!(window.ProfileManager && ProfileManager.isDemo && ProfileManager.isDemo());
  }

  function run() {
    if (shown || !isDemo()) return;
    var refs = window._demoRefs || {};
    if (!refs.aMarker || !refs.bMarker) return; // map not ready yet
    injectStyles();
    shown = true;
    showWelcome();   // collect both workplaces first, then begin the walkthrough
  }

  // Build the map-walkthrough steps from the CURRENT demo refs + member labels.
  // Called after the welcome card collects the two workplaces and the map
  // recomputes, so pins A/B and the copy reflect the visitor's own offices.
  function beginWalkthrough(retried) {
    var refs = window._demoRefs || {};
    // Fail-safe: pins can be missing if a chosen workplace didn't resolve to a
    // station (or the recompute is still running). Wait one beat, then proceed
    // with whatever we have — each step guards its own refs — rather than
    // silently stranding the visitor on a frozen map after the welcome card.
    if (!refs.aMarker || !refs.bMarker) {
      if (!retried) { setTimeout(function () { beginWalkthrough(true); }, 900); return; }
    }
    var members = (ProfileManager.get() || {}).members || [];
    var aWork = (members[0] && members[0].workLabel) || 'their office';
    var bWork = (members[1] && members[1].workLabel) || 'their office';

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
          ? 'These areas are <b>live</b>. Once you sign up, tap the <b>⚙</b> wheel here to change your max commute time or walk-to-station — and the map redraws instantly.'
          : 'These areas are <b>live</b>. Once you sign up, use the controls up top to change your <b>Max time</b> or <b>Walk to station</b> — and the map redraws instantly.',
        show: function () {
          if (window.nfMap) nfMap.closePopup();
          var ctrl = document.getElementById(mobile() ? 'mobile-settings-btn' : 'header-controls');
          disableControl(ctrl);  // not interactive in the demo — it's just a showcase
          pointArrowAt(ctrl);     // animated arrow instead of an outline
        }
      }
    ];

    stepIndex = 0;
    lockApp(); // guided from here on — stray taps on the app do nothing
    buildCard();
    renderStep();
  }

  // ── Welcome overlay (the very first thing a demo visitor sees) ──
  // A backdrop-dimmed card that floats over (and dominates) the map: says this is
  // a demo, sums up what the app does, and explains the guided tour before it begins.
  var welcomeEl = null;
  function showWelcome() {
    if (welcomeEl) return;

    // Pre-seed with the current demo workplaces so the button always works even
    // if the visitor leaves a field untouched (no dead-end).
    var prof = (ProfileManager.get() || {});
    var mem = prof.members || [];
    var picks = {
      a: { id: (mem[0] && mem[0].workId) || 'canary_wharf', label: (mem[0] && mem[0].workLabel) || 'Canary Wharf' },
      b: { id: (mem[1] && mem[1].workId) || 'holborn',      label: (mem[1] && mem[1].workLabel) || 'Holborn' }
    };

    welcomeEl = document.createElement('div');
    welcomeEl.id = 'demo-welcome';
    welcomeEl.style.cssText =
      'position:fixed;inset:0;z-index:1400;display:flex;align-items:center;justify-content:center;' +
      'padding:20px;background:rgba(16,13,11,0.62);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);' +
      'animation:demoWelcomeFade 0.35s ease-out;overflow-y:auto';
    welcomeEl.innerHTML =
      '<div style="max-width:440px;width:100%;background:var(--ink,#1a1714);color:var(--cream,#f7f4ef);' +
        'border-radius:18px;padding:26px 24px;box-shadow:0 18px 50px rgba(0,0,0,0.5);font-family:inherit;' +
        'animation:demoWelcomePop 0.4s cubic-bezier(0.16,1,0.3,1)">' +
        '<span style="display:inline-block;background:var(--copper,#c8722a);color:#fff;font-size:10.5px;' +
          'font-weight:800;letter-spacing:0.09em;text-transform:uppercase;padding:4px 10px;border-radius:999px;' +
          'margin-bottom:14px">Interactive demo</span>' +
        '<div style="font-size:21px;font-weight:800;line-height:1.25;margin-bottom:8px">Let’s make this demo yours 👋</div>' +
        '<div style="font-size:13.5px;line-height:1.55;color:rgba(247,244,239,0.78);margin-bottom:18px">' +
          'Where do you and your partner work? I’ll find the London areas that suit <b>both</b> your commutes — ' +
          'so the map actually means something to you. <span style="opacity:0.7">Nothing is saved.</span></div>' +
        workPicker('a', '📍 Where you work', picks.a.label) +
        workPicker('b', '📍 Where your partner works', picks.b.label) +
        '<div style="font-size:11.5px;line-height:1.45;color:rgba(247,244,239,0.5);margin:2px 0 18px">' +
          'Pick the nearest central (Zone 1) station to each office.</div>' +
        '<button id="dw-start" style="width:100%;background:var(--copper,#c8722a);color:#fff;border:none;' +
          'border-radius:11px;padding:14px;font-size:15px;font-weight:800;font-family:inherit;cursor:pointer;' +
          'min-height:50px;touch-action:manipulation;-webkit-tap-highlight-color:transparent">Build my demo →</button>' +
      '</div>';
    document.body.appendChild(welcomeEl);

    wireWorkPicker('a', picks);
    wireWorkPicker('b', picks);

    welcomeEl.querySelector('#dw-start').addEventListener('click', function () {
      closeWelcome();
      applyWorkplaces(picks, beginWalkthrough); // recompute for the chosen offices, then tour
    });
  }

  // One labelled station search field (dark-card styled) with an absolute dropdown.
  function workPicker(slot, labelText, value) {
    return '<div style="position:relative;margin-bottom:11px">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;' +
          'color:rgba(247,244,239,0.6);margin-bottom:5px">' + labelText + '</div>' +
        '<input id="dw-input-' + slot + '" type="text" autocomplete="off" value="' + esc(value) + '" ' +
          'placeholder="Search a station…" ' +
          'style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid rgba(247,244,239,0.18);' +
          'border-radius:9px;font-size:14px;font-family:inherit;background:#fff;color:#1a1f36;outline:none">' +
        '<div id="dw-drop-' + slot + '" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);' +
          'z-index:5;background:#fff;border:1px solid #e2e8f0;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,0.25);' +
          'max-height:190px;overflow-y:auto"></div>' +
      '</div>';
  }

  // Wire a station field to the live DESTINATIONS list (the same stations the
  // commute engine has journey-time data for). Selecting one records it in `picks`.
  function wireWorkPicker(slot, picks) {
    var input = document.getElementById('dw-input-' + slot);
    var drop  = document.getElementById('dw-drop-' + slot);
    if (!input || !drop) return;
    function render() {
      var q = input.value.toLowerCase().trim();
      var list = (window.DESTINATIONS || []).filter(function (d) {
        return !q || d.label.toLowerCase().indexOf(q) >= 0;
      }).slice(0, 8);
      drop.innerHTML = '';
      list.forEach(function (d) {
        var it = document.createElement('div');
        it.textContent = d.label;
        it.style.cssText = 'padding:10px 13px;font-size:14px;color:#1a1f36;cursor:pointer;border-bottom:1px solid #f1f5f9';
        it.addEventListener('mousedown', function (e) {
          e.preventDefault();
          picks[slot] = { id: d.id, label: d.label };
          input.value = d.label;
          drop.style.display = 'none';
        });
        it.addEventListener('mouseover', function () { it.style.background = '#f7f4ef'; });
        it.addEventListener('mouseout',  function () { it.style.background = ''; });
        drop.appendChild(it);
      });
      drop.style.display = list.length ? 'block' : 'none';
    }
    input.addEventListener('focus', function () { input.select(); render(); });
    input.addEventListener('input', render);
    input.addEventListener('blur', function () { setTimeout(function () { drop.style.display = 'none'; }, 180); });
  }

  // Save the chosen workplaces onto the demo profile and recompute the real
  // commute zones (same path as setup). Only recomputes when something changed,
  // so an untouched form goes straight to the tour without a needless reflow.
  function applyWorkplaces(picks, done) {
    var profile = ProfileManager.get();
    var changed = false;
    if (profile && profile.members && profile.members.length >= 2) {
      if (profile.members[0].workId !== picks.a.id) changed = true;
      if (profile.members[1].workId !== picks.b.id) changed = true;
      if (changed) {
        profile.members[0].workId = picks.a.id; profile.members[0].workLabel = picks.a.label;
        profile.members[1].workId = picks.b.id; profile.members[1].workLabel = picks.b.label;
        ProfileManager.save(profile);
        if (typeof computeZones === 'function') computeZones();
      }
    }
    // Give the recompute a moment to lay down fresh pins before the tour reads them.
    setTimeout(done, changed ? 550 : 0);
  }

  function welcomeRow(icon, html) {
    return '<div style="display:flex;gap:11px;align-items:flex-start;font-size:13.5px;line-height:1.5">' +
      '<span style="flex-shrink:0;font-size:17px;line-height:1.3">' + icon + '</span>' +
      '<span>' + html + '</span></div>';
  }

  function closeWelcome() {
    if (welcomeEl && welcomeEl.parentNode) welcomeEl.parentNode.removeChild(welcomeEl);
    welcomeEl = null;
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

  // An animated copper arrow bobbing just below a control, pointing up at it —
  // a cleaner attention cue than an outline. Positioned from the element's rect.
  function pointArrowAt(el) {
    clearArrow();
    if (!el) return;
    var r = el.getBoundingClientRect();
    arrowEl = document.createElement('div');
    arrowEl.id = 'demo-arrow';
    arrowEl.innerHTML = '<div class="demo-arrow-tri"></div>';
    arrowEl.style.cssText =
      'position:fixed;z-index:1260;pointer-events:none;transform:translateX(-50%);' +
      'left:' + (r.left + r.width / 2) + 'px;top:' + (r.bottom + 9) + 'px';
    document.body.appendChild(arrowEl);
  }
  function clearArrow() {
    if (arrowEl && arrowEl.parentNode) arrowEl.parentNode.removeChild(arrowEl);
    arrowEl = null;
  }

  // Make a control non-clickable for the duration of the demo (and remember it so
  // we can restore it if the user backs out before signing in).
  function disableControl(el) {
    restoreControl();
    if (!el) return;
    disabledControl = el;
    el.style.pointerEvents = 'none';
  }
  function restoreControl() {
    if (disabledControl) { disabledControl.style.pointerEvents = ''; disabledControl = null; }
  }

  // Transparent full-screen shield that swallows stray taps while the demo drives
  // the app. Sits at z-index 1100 — below every demo card, arrow, nudge and CTA
  // (1200+), above the app chrome and map. The demo's own scripted actions are JS
  // calls, so they are unaffected.
  var shieldEl = null;
  function lockApp() {
    if (shieldEl) return;
    shieldEl = document.createElement('div');
    shieldEl.id = 'demo-shield';
    shieldEl.style.cssText = 'position:fixed;inset:0;z-index:1100;background:transparent';
    document.body.appendChild(shieldEl);
  }
  function unlockApp() {
    closeShieldHole();
    if (shieldEl && shieldEl.parentNode) shieldEl.parentNode.removeChild(shieldEl);
    shieldEl = null;
  }

  // During the Agent demo the chat window must stay scrollable — readers need to
  // reach the whole conversation. Punch a "hole" in the shield over the chat box:
  // the shield container stops catching taps itself and instead hosts four strips
  // around the chat's rectangle, so ONLY the chat is live.
  var shieldHoleTarget = null;
  function openShieldHole(el) {
    if (!shieldEl || !el) return;
    shieldHoleTarget = el;
    positionShieldHole();
    window.addEventListener('resize', positionShieldHole);
  }
  function positionShieldHole() {
    if (!shieldEl || !shieldHoleTarget) return;
    var r = shieldHoleTarget.getBoundingClientRect();
    function strip(l, t, w, h) {
      return '<div style="position:absolute;pointer-events:auto;left:' + l + ';top:' + t +
        ';width:' + w + ';height:' + h + '"></div>';
    }
    function px(n) { return Math.max(0, n) + 'px'; }
    shieldEl.style.pointerEvents = 'none';
    shieldEl.innerHTML =
      strip('0', '0', '100%', px(r.top)) +
      strip('0', px(r.bottom), '100%', 'calc(100% - ' + px(r.bottom) + ')') +
      strip('0', px(r.top), px(r.left), px(r.height)) +
      strip(px(r.right), px(r.top), 'calc(100% - ' + px(r.right) + ')', px(r.height));
  }
  function closeShieldHole() {
    shieldHoleTarget = null;
    window.removeEventListener('resize', positionShieldHole);
    if (shieldEl) { shieldEl.innerHTML = ''; shieldEl.style.pointerEvents = ''; }
  }

  function injectStyles() {
    if (document.getElementById('demo-intro-styles')) return;
    var s = document.createElement('style');
    s.id = 'demo-intro-styles';
    s.textContent =
      '@keyframes demoPulse{0%{box-shadow:0 0 0 0 rgba(200,114,42,0.55)}70%{box-shadow:0 0 0 10px rgba(200,114,42,0)}100%{box-shadow:0 0 0 0 rgba(200,114,42,0)}}' +
      '@keyframes demoWelcomeFade{from{opacity:0}to{opacity:1}}' +
      '@keyframes demoWelcomePop{from{opacity:0;transform:translateY(14px) scale(0.96)}to{opacity:1;transform:none}}' +
      '@keyframes demoArrowBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-13px)}}' +
      '.demo-arrow-tri{width:0;height:0;border-left:20px solid transparent;border-right:20px solid transparent;' +
        'border-bottom:28px solid var(--copper,#c8722a);filter:drop-shadow(0 3px 6px rgba(0,0,0,0.4));' +
        'animation:demoArrowBob 1s ease-in-out infinite}' +
      '.demo-pulse{border-radius:8px;animation:demoPulse 1.4s ease-out infinite;outline:2px solid var(--copper,#c8722a);outline-offset:2px}' +
      // Copper arrow that sits to the LEFT of the demo's opening chat question,
      // nudging sideways to say "read this". Lives inside the message row, so it
      // scrolls with the conversation.
      '@keyframes demoArrowNudge{0%,100%{transform:translateX(0)}50%{transform:translateX(8px)}}' +
      '.demo-msg-arrow{position:absolute;left:4px;top:50%;margin-top:-10px;width:0;height:0;' +
        'border-top:10px solid transparent;border-bottom:10px solid transparent;' +
        'border-left:15px solid var(--copper,#c8722a);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));' +
        'animation:demoArrowNudge 1s ease-in-out infinite}' +
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
    clearArrow();
    if (window.nfMap) nfMap.closePopup();
    if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
    cardEl = null;
  }

  // "Skip" abandons the map walkthrough before the Agent demo starts.
  function finish() {
    closeCard();
    restoreControl(); // they're roaming the live map now — let them use the wheel
    unlockApp();
  }

  // ── Maloca Agent demo (Part 2) — plays in the REAL Agent tab ──
  // A scripted, zero-cost taste of the Agent kept deliberately SHORT (Rosie
  // feedback 2026-07-03). The opening question lands pre-entered in the chat
  // with an arrow cue, we pause long enough to read it, then the reply, then
  // the live map refines to green (ideal) / amber (worth a look) / red (avoid).
  // No fake typing, no API calls; the chat window scrolls freely throughout.

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

  // One exchange: greenN top-ranked areas go green, next amberN amber, rest red.
  var STAGES = [
    { user: 'We love proper independent coffee, green space we can run in at weekends and a good local pub — and we both want to be at work within 45 minutes door-to-door.',
      reply: 'Done — the map is now yours. Green areas are your ideal fits: great coffee, parks to run in, a proper local, and both commutes under 45 minutes. Amber is worth a look; red means avoid — they don’t fit your life. Your strongest fits:',
      greenN: 5, amberN: 10, cap: 45, final: true }
  ];

  var demoToken = 0;
  var elChat, elInput, elSend, elThink, ranked, commuteMax;

  // Step 1 of the Agent demo: a dominating intro card that EXPLAINS how the Agent
  // works (chat → it learns your lifestyle → it updates the map) before any chat
  // happens, then hands off into a worked example. This replaces the old straight-
  // to-fake-chat jump, which was too quick to follow.
  function launchAgentDemo() {
    showAgentIntro();
  }

  var agentIntroEl = null;
  function showAgentIntro() {
    if (agentIntroEl) return;
    agentIntroEl = document.createElement('div');
    agentIntroEl.id = 'demo-agent-intro';
    agentIntroEl.style.cssText =
      'position:fixed;inset:0;z-index:1400;display:flex;align-items:center;justify-content:center;' +
      'padding:20px;background:rgba(16,13,11,0.62);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);' +
      'animation:demoWelcomeFade 0.35s ease-out';
    agentIntroEl.innerHTML =
      '<div style="max-width:440px;width:100%;background:var(--ink,#1a1714);color:var(--cream,#f7f4ef);' +
        'border-radius:18px;padding:26px 24px;box-shadow:0 18px 50px rgba(0,0,0,0.5);font-family:inherit;' +
        'animation:demoWelcomePop 0.4s cubic-bezier(0.16,1,0.3,1)">' +
        '<span style="display:inline-block;background:var(--copper,#c8722a);color:#fff;font-size:10.5px;' +
          'font-weight:800;letter-spacing:0.09em;text-transform:uppercase;padding:4px 10px;border-radius:999px;' +
          'margin-bottom:14px">The Maloca Agent</span>' +
        '<div style="font-size:21px;font-weight:800;line-height:1.25;margin-bottom:8px">Your AI house-hunting partner 🤖</div>' +
        '<div style="font-size:13.5px;line-height:1.55;color:rgba(247,244,239,0.78);margin-bottom:18px">' +
          'Here’s where it gets clever. Just <b>chat to the Agent about your life</b> — your weekends, ' +
          'your must-haves, your dealbreakers.</div>' +
        '<div style="display:flex;flex-direction:column;gap:11px;margin-bottom:20px">' +
          welcomeRow('🗣️', 'You tell it what matters — coffee, green space, a good local, a short commute.') +
          welcomeRow('🧠', 'It <b>learns your lifestyle</b> as you chat.') +
          welcomeRow('🗺️', 'It <b>updates the map live</b>, narrowing to the neighbourhoods that fit you best.') +
        '</div>' +
        '<div style="font-size:12.5px;line-height:1.5;color:rgba(247,244,239,0.6);margin-bottom:18px">' +
          'Let’s watch a quick example of a couple finding their areas.</div>' +
        '<button id="dai-start" style="width:100%;background:var(--copper,#c8722a);color:#fff;border:none;' +
          'border-radius:11px;padding:14px;font-size:15px;font-weight:800;font-family:inherit;cursor:pointer;' +
          'min-height:50px;touch-action:manipulation;-webkit-tap-highlight-color:transparent">Watch an example →</button>' +
      '</div>';
    document.body.appendChild(agentIntroEl);
    agentIntroEl.querySelector('#dai-start').addEventListener('click', function () {
      closeAgentIntro();
      startAgentChat();
    });
  }
  function closeAgentIntro() {
    if (agentIntroEl && agentIntroEl.parentNode) agentIntroEl.parentNode.removeChild(agentIntroEl);
    agentIntroEl = null;
  }

  // Step 2: the scripted chat itself. Opens the real Agent tab; the question
  // arrives pre-entered as a sent message (no fake typing), with an arrow cue
  // and a reading pause before the Agent answers.
  function startAgentChat() {
    if (typeof switchTab === 'function') switchTab('filter');
    sheetState('half'); // map on top, Agent chat in the half-height sheet below (mobile)
    frameMapForAgent();

    elChat  = document.getElementById('filter-chat-history');
    elSend  = document.getElementById('filter-send-btn');
    elThink = document.getElementById('filter-thinking');
    elInput = document.getElementById('filter-input');

    if (elChat) elChat.innerHTML = '';
    if (elSend)  elSend.disabled = true;

    var token = ++demoToken;
    // Let the chat window scroll — the shield keeps everything ELSE locked.
    // Wait for the sheet to finish sliding so the hole lands in the right place.
    setTimeout(function () { if (token === demoToken) openShieldHole(elChat); }, 460);

    ranked     = buildRanked();
    commuteMax = buildCommuteMax();
    // Opening callout — frame what the user is about to watch before the reply.
    showFilterNudge('🗨️ Watch — chat to the Agent, and the map refines to fit you.', 4200);
    runStage(0, token);
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

  // Callout copy per turn (a single turn today, but the shape supports more).
  function stageNudgeText(i, st) {
    if (st.final) return '✨ Green = ideal · Amber = worth a look · Red = avoid';
    return '👀 Watch the map re-filter to match';
  }

  // Roughly how long a message takes to read (~240 wpm, plus a beat to notice
  // the arrow), capped so the demo never stalls.
  function readMs(text) {
    var words = String(text).split(/\s+/).length;
    return Math.min(8500, 1400 + words * 250);
  }

  function runStage(i, token) {
    if (token !== demoToken || i >= STAGES.length) return;
    var st = STAGES[i];
    appendUserMsg(st.user);                          // 1. the question lands, already sent
    var arrow = markLastMsg();                       // 2. arrow points readers at it…
    wait(readMs(st.user), token, function () {       // 3. …and we hold while they read
      if (arrow && arrow.parentNode) arrow.parentNode.removeChild(arrow);
      showThinking(true);                            // 4. Agent thinks…
      wait(2400, token, function () {
        showThinking(false);
        appendAgentReply(st);                        // 5. the REPLY lands — time to read it…
        wait(readMs(st.reply), token, function () {
          if (st.cap) setCommuteCap(st.cap);
          applyStageColours(st.greenN, st.amberN, st.cap); // 6. …THEN the map visibly re-filters
          var nudge = stageNudgeText(i, st);               //    with a callout to watch it happen
          if (nudge) showFilterNudge(nudge, st.final ? 3400 : 3800);
          if (st.final) { wait(3400, token, function () { endAgentDemo(token); }); }
          else { wait(5200, token, function () { runStage(i + 1, token); }); }
        });
      });
    });
  }

  // Drop the bobbing copper arrow to the LEFT of the newest (right-aligned) user
  // bubble, inside the chat itself so it scrolls with the conversation.
  function markLastMsg() {
    if (!elChat || !elChat.lastElementChild) return null;
    var row = elChat.lastElementChild;
    row.style.position = 'relative';
    var a = document.createElement('span');
    a.className = 'demo-msg-arrow';
    row.appendChild(a);
    return a;
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

  // Ten broadly-wanted must-haves, ordered by priority. Position drives the weight
  // the real app applies (linear decay), so #1 counts most and #10 least.
  var MUST_HAVES = [
    'Outdoor / green space',
    'Two double bedrooms',
    'Lots of natural light',
    'Good transport links',
    'Own front entrance',
    'Separate kitchen',
    'Plenty of storage',
    'Quiet street',
    'Period character',
    'Off-street parking'
  ];
  // 10 Downing Street's verdicts, aligned to MUST_HAVES — ticks the things that
  // matter most, misses parking/quiet/storage. Scores ~8.5/10 → tops the shortlist.
  var DOWNING_TICKS = [true, true, true, true, true, true, false, false, true, false];

  // Seed believable viewings + must-haves so the real tabs render with content.
  function seedTourData() {
    if (tourSeeded) return;
    tourSeeded = true;
    // Ordered by priority — top of the list carries the most weight (see MUST_HAVES).
    window.nonNegotiables = MUST_HAVES.slice();
    function results(map) {
      var out = {};
      window.nonNegotiables.forEach(function (item) { out[viewingsSanitize(item)] = !!map[item]; });
      return out;
    }
    // Per-property tick (✓ true) / cross (✗ false) maps, keyed by must-have label.
    function resultsByIndex(verdicts) {
      var map = {};
      MUST_HAVES.forEach(function (item, i) { map[item] = !!verdicts[i]; });
      return results(map);
    }
    window.viewingsCache = {
      'demo-downing': {
        address: '10 Downing Street, Westminster', area: 'Westminster',
        date: isoFromOffset(-1), time: '10:00', price: '675000', agentName: 'Crown Estates',
        status: 'viewed', rankOrder: 1, lat: 51.5034, lng: -0.1276,
        notes: 'The famous black door, St James’s Park on the doorstep — but no parking and far from quiet.',
        nnResults: resultsByIndex(DOWNING_TICKS) // pre-filled so the shortlist is right even if the tick animation is skipped
      },
      'demo-v1': {
        address: '24 Wilton Way, London Fields', area: 'London Fields',
        date: isoFromOffset(-4), time: '11:00', price: '625000', agentName: 'Foxtons',
        status: 'viewed', rankOrder: 2, lat: 51.5417, lng: -0.0586,
        notes: 'Loads of light, lovely garden, two minutes from the park.',
        nnResults: resultsByIndex([true, true, false, true, false, true, false, true, true, false])
      },
      'demo-v2': {
        address: '8 Bellenden Road, Peckham Rye', area: 'Peckham Rye',
        date: isoFromOffset(-2), time: '15:30', price: '600000', agentName: 'Winkworth',
        status: 'viewed', rankOrder: 3, lat: 51.4690, lng: -0.0690,
        notes: 'Great street, but no outside space.',
        nnResults: resultsByIndex([false, true, true, true, false, false, true, false, true, false])
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
    unlockApp(); // never leave the tap shield behind after sign-in
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
        '<span style="width:11px;height:11px;border-radius:50%;background:#84cc16;box-shadow:0 0 0 1px rgba(0,0,0,0.2)"></span>Green = ideal</span>' +
      '<span style="opacity:0.45">·</span>' +
      '<span style="display:inline-flex;align-items:center;gap:6px">' +
        '<span style="width:11px;height:11px;border-radius:50%;background:#f97316;box-shadow:0 0 0 1px rgba(0,0,0,0.2)"></span>Amber = worth a look</span>' +
      '<span style="opacity:0.45">·</span>' +
      '<span style="display:inline-flex;align-items:center;gap:6px">' +
        '<span style="width:11px;height:11px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 1px rgba(0,0,0,0.2)"></span>Red = avoid</span>';
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
    closeShieldHole();                                  // chat's gone — full tap shield back on
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
        text: '<b>📅 Found an area you love? Book a viewing.</b> Every viewing lands on a calendar that colour-codes your week — upcoming, viewed and want-to-view at a glance.',
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
      { // 7 — must-haves: priority weighting + post-viewing ticking on a real card
        text: '<b>✅ Set your must-haves once, in priority order — then tick what’s really there.</b> The higher up your list, the more it counts (see the % weights). Watch 10 Downing Street score big on green space and its own front door, less on parking.',
        show: function () { playMustHaveMock(); }
      },
      { // 8 — auto-ranked shortlist
        text: '<b>🏆 The shortlist ranks itself.</b> Each score is your must-haves, weighted by priority — so 10 Downing Street’s 8.5/10 lands it top. A clear league table, no spreadsheets — so you can <b>negotiate with confidence</b> and feel sure you’re making the right decision.',
        show: function () { clearPulse(); sheetState('full'); switchTab('shortlist'); }
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

  // ── Must-have ticking showcase (tour step 7) ────────────────────
  // Open 10 Downing Street's Viewed card, blank its checklist, then ✓/✗ each
  // must-have in priority order while the 0–10 score climbs. Uses the REAL
  // render + scoring (calculateNNScore), just driven by the in-memory cache.
  function playMustHaveMock() {
    clearPulse();
    if (typeof switchTab === 'function') switchTab('viewings');
    sheetState('full');
    var v = window.viewingsCache && window.viewingsCache['demo-downing'];
    if (v) v.nnResults = {};                       // blank slate to animate from
    if (typeof focusViewing === 'function') focusViewing('demo-downing');
    wait(800, tourToken, function () { animateTicks(0); });
  }

  function nnRowEls() {
    return document.querySelectorAll('#vc-day-panel .nn-checklist .nn-row');
  }

  // Reflect the running score on the real badge (recomputed from the cache).
  function updateDowningScore() {
    var badge = document.querySelector('#vc-day-panel .nn-checklist .nn-badge');
    if (!badge || typeof calculateNNScore !== 'function') return;
    var s = calculateNNScore('demo-downing');
    if (s === null) return;
    badge.textContent = s + '/10';
    badge.className = 'nn-badge ' + (s >= 7 ? 'nn-badge-all' : s >= 4 ? 'nn-badge-some' : 'nn-badge-none');
    badge.style.transition = 'transform 0.2s';
    badge.style.transform = 'scale(1.25)';
    setTimeout(function () { if (badge) badge.style.transform = 'scale(1)'; }, 200);
  }

  function animateTicks(i) {
    var v = window.viewingsCache && window.viewingsCache['demo-downing'];
    if (!v) return;
    if (i >= MUST_HAVES.length) { updateDowningScore(); return; }

    var verdict = !!DOWNING_TICKS[i];
    v.nnResults = v.nnResults || {};
    v.nnResults[viewingsSanitize(MUST_HAVES[i])] = verdict;

    // If the user has navigated away mid-animation, finish filling the cache
    // silently so the shortlist score is still correct, then stop.
    if (!document.getElementById('vc-day-panel')) {
      for (var j = i + 1; j < MUST_HAVES.length; j++) {
        v.nnResults[viewingsSanitize(MUST_HAVES[j])] = !!DOWNING_TICKS[j];
      }
      return;
    }

    var row = nnRowEls()[i];
    if (row) {
      var btn = row.querySelector(verdict ? '.nn-tick-btn' : '.nn-cross-btn');
      if (btn) btn.classList.add(verdict ? 'nn-active-tick' : 'nn-active-cross');
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.style.transition = 'background 0.3s';
      row.style.background = verdict ? 'rgba(101,163,13,0.14)' : 'rgba(239,68,68,0.10)';
      setTimeout(function () { if (row) row.style.background = ''; }, 650);
    }
    updateDowningScore();
    wait(620, tourToken, function () { animateTicks(i + 1); });
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
    clearArrow();
    clearFilterNudge();
    clearKeyCallout();
    restoreControl(); // demo's over — the settings wheel works again
    unlockApp();
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
