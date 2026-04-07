/**
 * map-filter.js
 * ─────────────────────────────────────────────────────────────
 * "Ask AI" tab — AI chatbot that filters search results.
 *
 * The AI acts as an experienced London estate agent. It reads
 * the current greenAreas list (areas matching both commutes),
 * takes the user's lifestyle preferences as free text, and
 * classifies every area as green / amber / red. The map circles
 * are recoloured live. The user can then auto-veto red or
 * red+amber areas with one click.
 *
 * Depends on: callAnthropicMessages (anthropic-call.js),
 *             nfEscapeHtml (html-escape.js),
 *             greenAreas, top5Cache, isVetoed, toggleVeto (map-core/ui)
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

var filterMessages        = [];   // Full conversation history sent to Anthropic
var filterColorMap        = {};   // { 'Brixton': 'green', 'Hackney': 'amber', … }
var filterInitDone        = false; // Whether initial classification is done/in-progress
var filterAreaCount       = 0;    // greenAreas.length at last init (detect re-searches)
var filterInitialColorMap = {};   // Snapshot of initial classification (reset target)
var filterInitialTop5     = [];   // Snapshot of initial top 5
var filterInitialMessages = [];   // Snapshot of initial conversation history
var filterInitialReasons  = {};   // Snapshot of initial top5 reasons
var filterTop5Reasons     = {};   // { 'Balham': 'Great parks nearby…', … }
var filterCurrentTop5     = [];   // Most recently applied top5 list

// ── Classification cache (localStorage) ──────────────────────
var _CACHE_KEY = 'nf_classification_cache';

function _classificationFingerprint() {
  var p = typeof ProfileManager !== 'undefined' && ProfileManager.get();
  if (!p) return '';
  var cm = typeof NFCommuteSettings !== 'undefined' ? NFCommuteSettings.resolveCommute(p) : {};
  var members = (p.members || []).map(function(m, i) {
    return { workId: m.workId, maxCommuteMins: (cm.maxMins && cm.maxMins[i]) || m.maxCommuteMins };
  });
  return JSON.stringify({
    members:   members,
    lifestyle: p.lifestyle || {},
    areaCards: p.areaCards  || {}
  });
}

function saveClassificationCache() {
  try {
    var payload = JSON.stringify({
      fingerprint: _classificationFingerprint(),
      colorMap:    filterInitialColorMap,
      top5:        filterInitialTop5,
      reasons:     filterInitialReasons,
      messages:    filterMessages
    });
    localStorage.setItem(_CACHE_KEY, payload);
    // Also sync to Firebase so other devices skip the AI call
    var user = typeof AuthManager !== 'undefined' && AuthManager.getUser();
    if (user) syncCacheToFirebase(user.uid, payload);
  } catch(e) {}
}

function syncCacheToFirebase(uid, payload) {
  if (!uid || typeof firebase === 'undefined') return;
  try {
    var raw = payload || localStorage.getItem(_CACHE_KEY);
    if (!raw) return;
    firebase.database().ref('users/' + uid + '/classificationCache').set(raw)
      .catch(function(e) { console.warn('[filter] Cache Firebase sync failed:', e); });
  } catch(e) {}
}

// Loads classification cache from Firebase into localStorage if localStorage is empty.
// Calls callback() when done (whether or not data was found).
function loadCacheFromFirebase(uid, callback) {
  // Fast path: localStorage already has it
  if (localStorage.getItem(_CACHE_KEY)) { if (callback) callback(); return; }
  if (!uid || typeof firebase === 'undefined') { if (callback) callback(); return; }
  firebase.database().ref('users/' + uid + '/classificationCache').once('value', function(snap) {
    var raw = snap.val();
    if (raw) {
      try { localStorage.setItem(_CACHE_KEY, raw); } catch(e) {}
    }
    if (callback) callback();
  }).catch(function() { if (callback) callback(); });
}

function loadClassificationCache() {
  try {
    var raw = localStorage.getItem(_CACHE_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (data.fingerprint !== _classificationFingerprint()) return null;
    return data;
  } catch(e) { return null; }
}

window.syncCacheToFirebase  = syncCacheToFirebase;
window.loadCacheFromFirebase = loadCacheFromFirebase;

// ── Personalised summary line ─────────────────────────────────
function renderAgentSummary() {
  var el = document.getElementById('nf-agent-summary');
  if (!el) return;
  var p = typeof ProfileManager !== 'undefined' && ProfileManager.get();
  if (!p) return;
  var members = p.members || [];
  var parts = [];
  var names = members.map(function(m) { return m.name; }).filter(Boolean);
  if (names.length) parts.push('<strong style="color:#1a1714">' + nfEscapeHtml(names.join(' & ')) + '</strong>');
  if (p.beds && p.beds !== 'any') parts.push(p.beds + ' bed');
  if (p.maxPrice && p.maxPrice !== 'any') {
    var n = parseInt(p.maxPrice);
    parts.push('£' + (n >= 1000 ? Math.round(n / 1000) + 'k' : n.toLocaleString()));
  }
  var works = members.map(function(m) { return m.workLabel; }).filter(Boolean);
  if (works.length) parts.push(nfEscapeHtml(works.join(' & ')));
  if (parts.length) el.innerHTML = 'Filtered for ' + parts.join(' · ');
}

// ── Initialise tab ────────────────────────────────────────────
function initFilterTab() {
  var histEl   = document.getElementById('filter-chat-history');
  var inputEl  = document.getElementById('filter-input');
  var sendBtn  = document.getElementById('filter-send-btn');
  var actionsEl = document.getElementById('filter-actions');
  if (!histEl) return;

  renderAgentSummary();

  // If no search has been run yet
  if (!window.greenAreas || !window.greenAreas.length) {
    histEl.innerHTML =
      '<div style="color:#9ca3af;font-size:12px;padding:12px 0;text-align:center">' +
      'Your Maloca Agent analysis will appear here once the search loads.' +
      '</div>';
    if (inputEl)  inputEl.disabled  = true;
    if (sendBtn)  sendBtn.disabled  = true;
    filterInitDone = false;
    return;
  }

  // Re-enable input (might have been left disabled from no-results state)
  if (inputEl)  inputEl.disabled  = false;
  if (sendBtn)  sendBtn.disabled  = false;
  // Analysis is handled by runInitialAiClassification() called from computeZones()
}

// ── Send a message ────────────────────────────────────────────
function filterSend() {
  var inputEl = document.getElementById('filter-input');
  var sendBtn  = document.getElementById('filter-send-btn');
  var thinkEl  = document.getElementById('filter-thinking');
  var msg = (inputEl ? inputEl.value : '').trim();
  if (!msg) return;
  if (!window.greenAreas || !window.greenAreas.length) return;

  if (inputEl) inputEl.value = '';
  appendUserBubble(msg);
  if (inputEl) inputEl.disabled = true;
  if (sendBtn)  sendBtn.disabled  = true;
  if (thinkEl)  thinkEl.style.display = 'block';
  if (typeof nfLoadingStart === 'function') nfLoadingStart('AI is thinking\u2026');

  var profile = ProfileManager.get() ||
    { members: [{ name: 'Person 1', workLabel: 'their office' }, { name: 'Person 2', workLabel: 'their office' }] };
  var members = profile.members || [];

  // On the first turn, prefix the message with area context so the AI
  // knows exactly which areas it needs to classify.
  var userContent = msg;
  if (filterMessages.length === 0) {
    var hasEnrichment = window.enrichmentDone &&
                        typeof getAreaContext === 'function';

    var areaList = greenAreas.map(function(item) {
      var times = (item.memberTimes || [item.t1, item.t2]).map(function(t, i) {
        var name = members[i] ? members[i].name : ('Person ' + (i + 1));
        return name + ' ' + t + ' min';
      }).join(', ');
      var line = item.area.name + ' (' + times + ')';
      if (hasEnrichment) {
        var ctx = getAreaContext(item.area.name);
        if (ctx) line += ' | ' + ctx;
      }
      return line;
    }).join('\n');

    var profiles = members.map(function(m) {
      return m.name + ' works at ' + (m.workLabel || 'their office');
    }).join('. ');

    userContent =
      'Areas that match our commute requirements:\n' + areaList +
      '\n\nOur profiles: ' + profiles + '.' +
      (hasEnrichment
        ? '\n\n(Neighbourhood data above is real — crime counts from Met Police, ' +
          'air quality from DEFRA/Copernicus via Open-Meteo, venue counts from ' +
          'OpenStreetMap, zones from TfL.)'
        : '') +
      '\n\nWhat we\'re looking for: ' + msg;
  }

  filterMessages.push({ role: 'user', content: userContent });

  callAnthropicMessages({
    model:      'claude-sonnet-4-6',
    max_tokens: 8000,
    system:     buildFilterSystemPrompt(),
    messages:   filterMessages
  }).then(function(data) {
    var raw = (data.content[0].text || '').replace(/```json|```/g, '').trim();
    console.log('[Maloca] Raw AI response:', raw);
    var jsonStart = raw.indexOf('{');
    var jsonEnd = raw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      raw = raw.slice(jsonStart, jsonEnd + 1);
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch(e) {
      appendAIBubble('Sorry, I had trouble understanding that response. Could you try rephrasing your question?');
      filterReEnableInput();
      return;
    }

    var reply   = parsed.reply   || 'Here\'s my analysis of your areas.';
    var colours = parsed.colours || {};

    filterMessages.push({ role: 'assistant', content: data.content[0].text });
    appendAIBubble(reply);

    if (Object.keys(colours).length > 0) {
      applyFilterColors(colours);
    }
    if (parsed.top5 && parsed.top5.length) applyAiTop5(parsed.top5, parsed.reasons || {});
    filterReEnableInput();
    if (typeof nfLoadingDone === 'function') nfLoadingDone();

  }).catch(function(err) {
    appendAIBubble(
      'Sorry, I couldn\'t connect right now. ' +
      (err && err.message ? err.message : 'Please try again.')
    );
    filterReEnableInput();
    if (typeof nfLoadingDone === 'function') nfLoadingDone();
  });
}

function filterReEnableInput() {
  var inputEl = document.getElementById('filter-input');
  var sendBtn  = document.getElementById('filter-send-btn');
  var thinkEl  = document.getElementById('filter-thinking');
  if (inputEl) inputEl.disabled = false;
  if (sendBtn)  sendBtn.disabled  = false;
  if (thinkEl)  thinkEl.style.display = 'none';
  if (inputEl)  inputEl.focus();
}

// ── System prompt ─────────────────────────────────────────────
function buildFilterSystemPrompt() {
  return (
    'You are an expert London neighbourhood consultant helping a group find their ideal home. ' +
    'You have PRECISE, ACCURATE knowledge of what each London residential area is actually like to live in — ' +
    'not tourist impressions, not proximity to famous landmarks, but the real day-to-day character of each neighbourhood.\n\n' +

    '━━ CRITICAL: USE REAL LONDON GEOGRAPHY ━━\n' +
    'Many AI systems make embarrassing mistakes about London. You must not. Key examples:\n\n' +

    'GREEN SPACE & PARKS — what it actually means:\n' +
    'A neighbourhood scores well for parks/green space if residents can walk out of their front door ' +
    'and reach meaningful green space within 5–10 min. Being "near Hyde Park" does NOT count if you live ' +
    'in Shoreditch or Kings Cross — those are urban areas.\n' +
    'GENUINELY GREEN residential areas: Stoke Newington (Clissold Park), Hackney/London Fields, ' +
    'Battersea (Battersea Park on doorstep), Balham/Clapham (Clapham Common), Dulwich (Dulwich Park), ' +
    'Honor Oak, Crystal Palace, Brockley, Tooting (Tooting Common & Bec), Wandsworth Common, ' +
    'Wimbledon, Chiswick (Chiswick House grounds), Barnes, Putney, Highgate, Crouch End, ' +
    'Muswell Hill (Alexandra Park), Finsbury Park, Walthamstow, Wanstead, Forest Hill, ' +
    'Herne Hill (Brockwell Park), Tulse Hill, West Norwood.\n' +
    'URBAN/LOW GREEN SPACE: Shoreditch, Old Street, Farringdon, City/Bank, Blackfriars, Borough, ' +
    'Elephant & Castle, Whitechapel, Aldgate, Liverpool Street area, Canary Wharf, Vauxhall, ' +
    'Nine Elms, Waterloo, Kings Cross, Euston, Russell Square, Bermondsey, Peckham Rye (mixed).\n\n' +

    'NIGHTLIFE & BUZZ:\n' +
    'Strong nightlife: Brixton, Peckham, Dalston/Hackney, Clapton, Bethnal Green, Shoreditch/Old Street, ' +
    'Islington, Stroud Green, Stoke Newington (independent bar scene).\n' +
    'Quieter/residential: Wimbledon, Richmond, Barnes, Dulwich, Chiswick, Tooting (growing but quiet).\n\n' +

    'FAMILY-FRIENDLY & SCHOOLS:\n' +
    'Strong: Wandsworth, Wimbledon, Dulwich, Chiswick, Highgate, Crouch End, Stoke Newington, ' +
    'Tooting, Barnes, Richmond, Putney, Herne Hill.\n' +
    'Developing/mixed: Hackney, Brixton, Peckham, Walthamstow.\n\n' +

    'SAFETY & CRIME:\n' +
    'Lower crime residential areas: Wimbledon, Richmond, Dulwich, Chiswick, Barnes, Highgate, ' +
    'Stoke Newington, Tooting, Wandsworth, Balham, Honor Oak, Crystal Palace.\n' +
    'Higher crime or mixed: Elephant & Castle, Peckham, Lewisham, Tottenham, Walthamstow (improving), ' +
    'Hackney (improving), Brixton (improving but incidents still above average).\n\n' +

    'UP-AND-COMING:\n' +
    'Walthamstow, Forest Hill, Crystal Palace, Honor Oak, Brockley, Herne Hill, ' +
    'South Tottenham/Seven Sisters, Leyton, Manor Park, Catford, Penge.\n\n' +

    '━━ YOUR TASK ━━\n' +
    'Classify every area from the group\'s commute-compatible shortlist as green / amber / red ' +
    'based on their stated preferences and your accurate knowledge.\n\n' +
    'Respond ONLY with valid JSON — no markdown, no code fences, no extra text:\n' +
    '{\n' +
    '  "reply": "Warm, conversational 2–3 sentences. Sound like a knowledgeable friend, not a report. Name specific areas. Give a real opinion.",\n' +
    '  "colours": {\n' +
    '    "Area Name": "green",\n' +
    '    "Another Area": "amber",\n' +
    '    "Third Area": "red"\n' +
    '  },\n' +
    '  "top5": ["Best Area", "Second Area", "Third Area", "Fourth Area", "Fifth Area"],\n' +
    '  "reasons": {\n' +
    '    "Best Area": "One compelling sentence explaining exactly why this area suits this specific group.",\n' +
    '    "Second Area": "One compelling sentence.",\n' +
    '    "Third Area": "One compelling sentence.",\n' +
    '    "Fourth Area": "One compelling sentence.",\n' +
    '    "Fifth Area": "One compelling sentence."\n' +
    '  }\n' +
    '}\n\n' +
    'Rules:\n' +
    '- green = genuinely good fit for their preferences (label: Ideal)\n' +
    '- amber = possible fit with specific reservations (label: Potential)\n' +
    '- red = conflicts with what they want (label: Avoid)\n' +
    '- EVERY area in the list must appear in colours\n' +
    '- top5 = 5 best-fit areas, best first (fill with ambers if fewer than 5 green)\n' +
    '- reasons must include all 5 top5 areas\n' +
    '- Valid JSON only'
  );
}

// ── Apply colours to map circles ──────────────────────────────
function applyFilterColors(colourMap) {
  filterColorMap = colourMap;
  var counts = { green: 0, amber: 0, red: 0 };

  greenAreas.forEach(function(item) {
    var c = (colourMap[item.area.name] || 'green').toLowerCase();
    if (c !== 'green' && c !== 'amber' && c !== 'red') c = 'green';
    if (!item.circle) return; // vetoed — no circle on map
    counts[c] = (counts[c] || 0) + 1;
    if (c === 'red')   item.circle.setStyle({ fillColor: '#ef4444', color: '#dc2626', fillOpacity: 0.65 });
    if (c === 'amber') item.circle.setStyle({ fillColor: '#f97316', color: '#ea580c', fillOpacity: 0.60 });
    if (c === 'green') item.circle.setStyle({ fillColor: '#84cc16', color: '#65a30d', fillOpacity: 0.50 });
  });

  var sumEl = document.getElementById('filter-summary');
  if (sumEl) {
    sumEl.innerHTML =
      '<button class="nf-cat-btn nf-cat-ideal" onclick="showCategoryCard(\'green\')">' + (counts.green || 0) + ' Ideal</button>' +
      ' &nbsp;·&nbsp; ' +
      '<button class="nf-cat-btn nf-cat-potential" onclick="showCategoryCard(\'amber\')">' + (counts.amber || 0) + ' Potential</button>' +
      ' &nbsp;·&nbsp; ' +
      '<button class="nf-cat-btn nf-cat-avoid" onclick="showCategoryCard(\'red\')">' + (counts.red || 0) + ' Avoid</button>';
  }

  var gcEl = document.getElementById('key-count-green');
  var acEl = document.getElementById('key-count-amber');
  var rcEl = document.getElementById('key-count-red');
  if (gcEl) gcEl.textContent = counts.green || 0;
  if (acEl) acEl.textContent = counts.amber || 0;
  if (rcEl) rcEl.textContent = counts.red   || 0;

  var actionsEl = document.getElementById('filter-actions');
  if (actionsEl) actionsEl.style.display = 'block';

  // On mobile, show the map overlay buttons instead
  var mobileEl = document.getElementById('mobile-filter-btns');
  if (mobileEl && window.isMobile && window.isMobile()) {
    mobileEl.style.display = 'flex';
  }
}

// ── Accept filter and auto-veto ───────────────────────────────
var lastMassVeto = [];

function acceptFilter(level) {
  if (!Object.keys(filterColorMap).length) return;
  var toVeto = [];
  Object.keys(filterColorMap).forEach(function(name) {
    var c = filterColorMap[name];
    if (c === 'red') toVeto.push(name);
    if (level === 'amber' && c === 'amber') toVeto.push(name);
  });
  if (!toVeto.length) {
    appendAIBubble('No areas to veto at that level — nothing to do!');
    return;
  }
  toVeto.forEach(function(name) {
    if (typeof isVetoed === 'function' && !isVetoed(name)) {
      if (typeof toggleVeto === 'function') toggleVeto(name, true);
    }
  });
  lastMassVeto = toVeto.slice();
  var undoBtn = document.getElementById('filter-undo-btn');
  if (undoBtn) undoBtn.style.display = 'block';
  var mobileUndo = document.getElementById('mobile-filter-undo-btn');
  if (mobileUndo) mobileUndo.style.display = 'block';
  appendAIBubble(
    'Done! Hidden ' + toVeto.length + ' area' + (toVeto.length !== 1 ? 's' : '') +
    ' for this session. Hit Undo to bring them all back.'
  );
}

function undoMassVeto() {
  if (!lastMassVeto.length) return;
  var count = lastMassVeto.length;
  if (typeof batchUnveto === 'function') batchUnveto(lastMassVeto);
  lastMassVeto = [];
  var undoBtn = document.getElementById('filter-undo-btn');
  if (undoBtn) undoBtn.style.display = 'none';
  var mobileUndo = document.getElementById('mobile-filter-undo-btn');
  if (mobileUndo) mobileUndo.style.display = 'none';
  appendAIBubble('Undone — ' + count + ' area' + (count !== 1 ? 's' : '') + ' restored to the map.');
}
window.undoMassVeto = undoMassVeto;

// ── Reset colours back to AI classification (Ideal / Potential / Avoid) ──
function resetFilterColors() {
  if (!Object.keys(filterColorMap).length) {
    appendAIBubble('No AI classification to restore — run a search first.');
    return;
  }
  applyFilterColors(filterColorMap);
  appendAIBubble('Colours reset — back to the Ideal / Potential / Avoid view.');
}

// ── Chat bubble helpers ───────────────────────────────────────
function appendUserBubble(text) {
  var el = document.getElementById('filter-chat-history');
  if (!el) return;
  var div = document.createElement('div');
  div.style.cssText = 'text-align:right;margin-bottom:8px';
  div.innerHTML =
    '<span style="display:inline-block;background:#1a1f36;color:#a3e635;' +
    'padding:7px 11px;border-radius:12px 12px 3px 12px;font-size:12px;' +
    'max-width:85%;text-align:left;word-break:break-word">' +
    nfEscapeHtml(text) + '</span>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function appendAIBubble(text) {
  var el = document.getElementById('filter-chat-history');
  if (!el) return;
  var div = document.createElement('div');
  div.style.cssText = 'margin-bottom:8px';
  div.innerHTML =
    '<span style="display:inline-block;background:#f1f5f9;color:#374151;' +
    'padding:7px 11px;border-radius:12px 12px 12px 3px;font-size:12px;' +
    'max-width:90%;word-break:break-word">' +
    nfEscapeHtml(text) + '</span>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

// ── Enter key support ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  var inp = document.getElementById('filter-input');
  if (inp) {
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { hideSuggestions(); filterSend(); }
    });
    inp.addEventListener('focus', showSuggestions);
    inp.addEventListener('blur', function() {
      // Small delay so a click on a suggestion registers before blur hides the list
      setTimeout(hideSuggestions, 150);
    });
  }

  // Wire up suggestion clicks via delegation on the container
  var sugg = document.getElementById('filter-suggestions');
  if (sugg) {
    sugg.addEventListener('mousedown', function(e) {
      var item = e.target.closest('.nf-suggestion');
      if (item) { e.preventDefault(); useSuggestion(item.dataset.prompt); }
    });
  }
});

// ── Initial AI classification (runs automatically after first search) ─
function countColorsFromMap(map) {
  var c = { green: 0, amber: 0, red: 0 };
  Object.keys(map).forEach(function(k) { var v = map[k]; if (c[v] !== undefined) c[v]++; });
  return c;
}

function runInitialAiClassification() {
  var profile = ProfileManager.get();
  if (!profile) return;
  if (!window.greenAreas || !window.greenAreas.length) return;
  // Skip if already classified for this exact set of results
  if (filterInitDone && greenAreas.length === filterAreaCount) return;

  // Restore from cache if profile hasn't changed — avoids an API call on refresh
  var cached = loadClassificationCache();
  if (cached && Object.keys(cached.colorMap || {}).length) {
    filterInitialColorMap = cached.colorMap;
    filterInitialTop5     = cached.top5 || [];
    filterInitialReasons  = cached.reasons || {};
    filterMessages        = cached.messages || [];
    filterInitialMessages = filterMessages.slice();
    filterInitDone        = true;
    filterAreaCount       = greenAreas.length;
    applyFilterColors(filterInitialColorMap);
    if (filterInitialTop5.length) applyAiTop5(filterInitialTop5, filterInitialReasons);
    var counts = countColorsFromMap(filterInitialColorMap);
    var greeting = 'Welcome back! Your areas are colour-coded from your last analysis — ' +
      (counts.green || 0) + ' Ideal, ' + (counts.amber || 0) + ' Potential, ' +
      (counts.red || 0) + ' Avoid. Ask me anything to explore further.';
    var histEl = document.getElementById('filter-chat-history');
    if (histEl) { histEl.innerHTML = ''; appendAIBubble(greeting); }
    renderPromptChips();
    return;
  }

  // Build loves/hates from area card selections
  var loves = [], hates = [];
  if (profile.areaCards) {
    Object.keys(profile.areaCards).forEach(function(area) {
      if (profile.areaCards[area] === 'love') loves.push(area);
      if (profile.areaCards[area] === 'hate') hates.push(area);
    });
  }

  // Build preference summary from lifestyle answers
  var prefs = [];
  var lf = profile.lifestyle || {};
  if (lf.greenSpace === 'essential')   prefs.push('green space is essential');
  if (lf.greenSpace === 'nice')        prefs.push('green space is a nice to have');
  if (lf.streetVibe === 'buzzy')       prefs.push('prefer a buzzy high street');
  if (lf.streetVibe === 'quiet')       prefs.push('prefer quiet residential streets');
  if (lf.streetVibe === 'village')     prefs.push('prefer a village feel');
  if (lf.nightsOut === 'frequent')     prefs.push('go out frequently (3+ nights/week)');
  if (lf.nightsOut === 'regular')      prefs.push('go out regularly (1–2 nights/week)');
  if (lf.nightsOut === 'rarely')       prefs.push('rarely go out');
  if (lf.schoolsPriority === 'now')    prefs.push('school quality is a top priority');
  if (lf.schoolsPriority === 'someday') prefs.push('may need good schools in future');
  if (lf.safetyPriority === 'veryimportant') prefs.push('safety is very important');
  if (lf.dealbreakers && lf.dealbreakers.length && lf.dealbreakers[0] !== 'none') {
    prefs.push('dealbreakers: ' + lf.dealbreakers.join(', '));
  }
  if (lf.freeText) prefs.push('in their own words: "' + lf.freeText + '"');

  var hasEnrichment = window.enrichmentDone && typeof getAreaContext === 'function';
  var areaList = greenAreas.map(function(item) {
    var line = item.area.name +
      ' (' + profile.p1.name + ' ' + item.t1 + ' min, ' +
      profile.p2.name + ' ' + item.t2 + ' min)';
    if (hasEnrichment) {
      var ctx = getAreaContext(item.area.name);
      if (ctx) line += ' | ' + ctx;
    }
    return line;
  }).join('\n');

  var prompt =
    'Areas matching our commute:\n' + areaList +
    (loves.length ? '\n\nAreas we love the vibe of (from examples we picked): ' + loves.join(', ') : '') +
    (hates.length ? '\nAreas we don\'t like the vibe of: ' + hates.join(', ') : '') +
    (prefs.length ? '\n\nOur preferences:\n- ' + prefs.join('\n- ') : '') +
    '\n\nBased on this profile, classify all the commute-compatible areas above. ' +
    'Use the loved/hated example areas to calibrate the vibe we\'re looking for.';

  // Mark as in-progress BEFORE the API call so initFilterTab() doesn't interfere
  filterInitDone  = true;
  filterAreaCount = greenAreas.length;

  // Show loading message in chat and loading bar
  var histEl = document.getElementById('filter-chat-history');
  if (histEl) {
    histEl.innerHTML = '';
    appendAIBubble('Analysing your areas based on your profile\u2026');
  }
  renderSuggestions(); // Show input suggestions before API responds
  if (typeof nfLoadingStart === 'function') nfLoadingStart('Maloca Agent is analysing your areas\u2026');

  callAnthropicMessages({
    model:      'claude-sonnet-4-6',
    max_tokens: 4000,
    system:     buildFilterSystemPrompt(),
    messages:   [{ role: 'user', content: prompt }]
  }).then(function(data) {
    var raw = (data.content[0].text || '').replace(/```json|```/g, '').trim();
    var jsonStart = raw.indexOf('{');
    var jsonEnd   = raw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) raw = raw.slice(jsonStart, jsonEnd + 1);
    var parsed;
    try { parsed = JSON.parse(raw); } catch(e) {
      if (histEl) histEl.innerHTML = '';
      return;
    }

    var colours = parsed.colours || {};
    var top5    = parsed.top5    || [];

    // Seed conversation history so follow-up questions have context
    filterMessages = [
      { role: 'user',      content: prompt },
      { role: 'assistant', content: data.content[0].text }
    ];

    // Save snapshot so the header ✕ button can restore to this state
    filterInitialColorMap = JSON.parse(JSON.stringify(colours));
    filterInitialTop5     = top5.slice();
    filterInitialMessages = filterMessages.slice();
    filterInitialReasons  = JSON.parse(JSON.stringify(parsed.reasons || {}));

    // Persist to localStorage so refresh doesn't re-call the API
    saveClassificationCache();

    // Build an informative summary greeting
    var counts  = countColorsFromMap(colours);
    var greeting;
    if (top5.length) {
      greeting = 'I\'ve analysed ' + greenAreas.length + ' areas against your profile. ' +
        'Your top picks are ' + top5.slice(0, 5).join(', ') + '. ' +
        'I\'ve marked ' + (counts.green || 0) + ' as Ideal, ' +
        (counts.amber || 0) + ' as Potential, and ' +
        (counts.red || 0) + ' as Avoid — tap those counts to browse each list, ' +
        'or ask me anything to go deeper.';
    } else {
      greeting = parsed.reply || ('I\'ve looked at ' + greenAreas.length + ' areas within your commute limits and colour-coded them on the map. Ask me anything to explore further.');
    }

    if (histEl) histEl.innerHTML = '';
    appendAIBubble(greeting);
    if (Object.keys(colours).length) {
      applyFilterColors(colours);
    }
    if (top5.length) applyAiTop5(top5, parsed.reasons || {});
    renderPromptChips();
    if (typeof nfLoadingDone === 'function') nfLoadingDone();

  }).catch(function(err) {
    if (histEl) {
      histEl.innerHTML = '';
      var noKey = err && err.code === 'NO_KEY';
      appendAIBubble(
        noKey
          ? 'The Maloca Agent needs an API key to run — this is injected automatically when deployed. Ask me anything once the live site loads, or use the chat below to explore your areas manually.'
          : 'Couldn\'t connect to the Maloca Agent right now. Use the chat below to ask me anything about your ' + (window.greenAreas ? greenAreas.length : 0) + ' areas.'
      );
    }
    if (typeof nfLoadingDone === 'function') nfLoadingDone();
  });
}

// ── Personalised prompt chips ─────────────────────────────────
var GYM_DISPLAY_NAMES = {
  virginactive: 'Virgin Active', onerebe: '1Rebel',
  f45: 'F45', thirdspace: 'Third Space', psycle: 'Psycle'
};

function buildPersonalisedPrompts() {
  var profile = ProfileManager.get();
  if (!profile) return [];
  var lf = profile.lifestyle || {};
  var prompts = [];

  if (lf.greenSpace === 'essential')
    prompts.push('Best areas for parks & outdoor space');
  if (lf.streetVibe === 'buzzy')
    prompts.push('Which areas have the best restaurants & bars?');
  if (lf.streetVibe === 'village')
    prompts.push('Which areas have the strongest village community feel?');
  if (lf.nightsOut === 'frequent' || lf.nightsOut === 'regular')
    prompts.push('Top areas for nightlife that aren\'t too far from work');
  if (lf.nightsOut === 'rarely' || lf.streetVibe === 'quiet')
    prompts.push('Quietest areas that still feel like a community');
  if (lf.schoolsPriority === 'now' || lf.schoolsPriority === 'someday')
    prompts.push('Areas with the best-rated schools nearby');
  if (lf.safetyPriority === 'veryimportant')
    prompts.push('Safest areas in our commute range');

  var loves = [];
  if (profile.areaCards) {
    Object.keys(profile.areaCards).forEach(function(a) {
      if (profile.areaCards[a] === 'love') loves.push(a);
    });
  }
  if (loves.length)
    prompts.push('Areas most similar to ' + loves.slice(0, 2).join(' and '));

  var gymKey = (profile.p1 && profile.p1.gym) || (profile.p2 && profile.p2.gym);
  if (gymKey && GYM_DISPLAY_NAMES[gymKey])
    prompts.push('Areas with a ' + GYM_DISPLAY_NAMES[gymKey] + ' nearby');

  prompts.push('Which areas best match our overall profile?');
  prompts.push('Which areas are most up-and-coming right now?');

  return prompts.slice(0, 6);
}

// ── Contextual suggestions ────────────────────────────────────
// Builds the list of suggestions shown when the user focuses the input.
// Before any conversation: setup-based prompts.
// After first AI reply: mix in conversation-aware follow-ups.
function buildContextualSuggestions() {
  var base = buildPersonalisedPrompts();

  // After at least one AI response, add follow-ups based on current colour map
  if (filterMessages.length >= 2 && Object.keys(filterColorMap).length) {
    var greens = Object.keys(filterColorMap).filter(function(k) { return filterColorMap[k] === 'green'; });
    var ambers = Object.keys(filterColorMap).filter(function(k) { return filterColorMap[k] === 'amber'; });
    var reds   = Object.keys(filterColorMap).filter(function(k) { return filterColorMap[k] === 'red'; });
    var ctx = [];
    if (greens.length)           ctx.push('Tell me more about ' + greens[0]);
    if (greens.length > 1)       ctx.push('How do ' + greens[0] + ' and ' + greens[1] + ' compare?');
    if (ambers.length)           ctx.push('What would make ' + ambers[0] + ' a better fit for us?');
    if (reds.length)             ctx.push('Why is ' + reds[0] + ' not right for us?');
    ctx.push('Which of these are most up-and-coming right now?');
    ctx.push('Which areas are best value for money?');
    return ctx.slice(0, 6);
  }

  return base.slice(0, 6);
}

function renderSuggestions() {
  var container = document.getElementById('filter-suggestions');
  if (!container) return;
  var prompts = buildContextualSuggestions();
  container.innerHTML = prompts.map(function(p) {
    return '<div class="nf-suggestion" data-prompt="' + nfEscapeHtml(p) + '">' + nfEscapeHtml(p) + '</div>';
  }).join('');
}

function showSuggestions() {
  renderSuggestions();
  var container = document.getElementById('filter-suggestions');
  if (container && container.children.length) container.style.display = 'block';
}

function hideSuggestions() {
  var container = document.getElementById('filter-suggestions');
  if (container) container.style.display = 'none';
}

function useSuggestion(text) {
  var inputEl = document.getElementById('filter-input');
  if (!inputEl || !text) return;
  inputEl.value = text;
  hideSuggestions();
  filterSend();
}

// Keep renderPromptChips as alias so existing call sites don't break
function renderPromptChips() { renderSuggestions(); }

// ── Floating map veto controls ────────────────────────────────
function showMapAiControls(visible) {
  var el = document.getElementById('map-ai-controls');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

// ── Reset to initial classification ──────────────────────────
function resetToInitialClassification() {
  if (!Object.keys(filterInitialColorMap).length) return;

  // Restore state to post-initial-classification
  filterColorMap = JSON.parse(JSON.stringify(filterInitialColorMap));
  filterMessages = filterInitialMessages.slice();

  // Rebuild the initial greeting in chat
  var histEl = document.getElementById('filter-chat-history');
  if (histEl) histEl.innerHTML = '';
  var counts  = countColorsFromMap(filterInitialColorMap);
  var top5    = filterInitialTop5.slice();
  var greeting = 'Back to your initial analysis. ';
  if (top5.length) {
    greeting += 'Top picks: ' + top5.slice(0, 5).join(', ') + '. ';
  }
  greeting += (counts.green || 0) + ' Ideal · ' + (counts.amber || 0) + ' Potential · ' + (counts.red || 0) + ' Avoid. Ask me anything to explore further.';
  appendAIBubble(greeting);

  applyFilterColors(filterInitialColorMap);
  filterTop5Reasons = JSON.parse(JSON.stringify(filterInitialReasons));
  if (top5.length) applyAiTop5(top5, filterTop5Reasons);
  renderPromptChips();
}
window.resetToInitialClassification = resetToInitialClassification;

// ── AI top 5 markers + card ───────────────────────────────────
var aiTop5Markers = [];

function clearAiTop5() {
  aiTop5Markers.forEach(function(m) {
    if (window.nfLayers) window.nfLayers.aiTop5.removeLayer(m);
  });
  aiTop5Markers = [];
}

function applyAiTop5(top5, reasons) {
  filterCurrentTop5 = top5 ? top5.slice() : [];
  if (reasons) filterTop5Reasons = reasons;

  clearAiTop5();
  if (!top5 || !top5.length || !window.greenAreas || !window.nfLayers) return;

  top5.slice(0, 5).forEach(function(areaName, idx) {
    var gaItem = greenAreas.find(function(i) { return i.area.name === areaName; });
    if (!gaItem) return;
    var rank = idx + 1;
    var icon = L.divIcon({
      html: '<div style="background:#7c3aed;border:2px solid #fff;' +
        'border-radius:50%;width:24px;height:24px;' +
        'box-shadow:0 2px 6px rgba(0,0,0,0.4);pointer-events:none"></div>',
      className: '', iconSize: [24, 24], iconAnchor: [12, 12]
    });
    var marker = L.marker([gaItem.area.lat, gaItem.area.lng],
      { icon: icon, interactive: false }).addTo(window.nfLayers.aiTop5);
    aiTop5Markers.push(marker);
  });

  showTopPicksCard();
}

// ── Top picks card view ───────────────────────────────────────
function showTopPicksCard() {
  var card    = document.getElementById('ai-top5-card');
  var titleEl = document.getElementById('ai-card-title');
  var list    = document.getElementById('ai-top5-list');
  var backBtn = document.getElementById('ai-card-back-btn');
  if (!card || !list) return;

  if (titleEl) titleEl.textContent = 'Maloca Top Picks';
  if (backBtn) backBtn.style.display = 'none';

  list.innerHTML = filterCurrentTop5.slice(0, 5).map(function(name, i) {
    var reason = filterTop5Reasons && filterTop5Reasons[name];
    var safeReason = reason ? nfEscapeHtml(reason) : '';
    return '<li' + (reason ? ' onclick="toggleTop5Reason(this)" style="cursor:pointer"' : '') + '>' +
      '<div class="top5-row"><span class="top5-rank-badge">' + (i + 1) + '</span>' +
      nfEscapeHtml(name) + (reason ? ' <span style="font-size:9px;color:#9ca3af">▼</span>' : '') + '</div>' +
      (reason ? '<div class="top5-reason" style="display:none">' + safeReason + '</div>' : '') +
      '</li>';
  }).join('');
  // Reset to collapsed state each time the card is refreshed
  card.classList.remove('card-expanded');
  var expandBtn = document.getElementById('ai-expand-btn');
  if (expandBtn) expandBtn.textContent = '+';
  card.style.display = 'block';
}

function toggleTop5Reason(el) {
  var reason = el.querySelector('.top5-reason');
  if (!reason) return;
  reason.style.display = reason.style.display === 'none' ? 'block' : 'none';
}

// ── Category list card view ───────────────────────────────────
var categoryLabels = { green: 'Ideal Areas', amber: 'Potential Areas', red: 'Avoid Areas' };
var categoryColors = { green: '#16a34a', amber: '#ea580c', red: '#dc2626' };

function showCategoryCard(category) {
  var card    = document.getElementById('ai-top5-card');
  var titleEl = document.getElementById('ai-card-title');
  var list    = document.getElementById('ai-top5-list');
  var backBtn = document.getElementById('ai-card-back-btn');
  if (!card || !list) return;

  var areas = Object.keys(filterColorMap).filter(function(name) {
    return filterColorMap[name] === category;
  });
  if (!areas.length) return;

  if (titleEl) titleEl.textContent = categoryLabels[category] || category;
  if (backBtn) backBtn.style.display = 'block';

  var badgeColor = categoryColors[category] || '#7c3aed';
  list.innerHTML = areas.map(function(name, i) {
    return '<li>' +
      '<div class="top5-row">' +
      '<span class="top5-rank-badge" style="background:' + badgeColor + '">' + (i + 1) + '</span>' +
      nfEscapeHtml(name) + '</div></li>';
  }).join('');
  card.style.display = 'block';
  if (typeof isMobile === 'function' && isMobile()) {
    card.classList.remove('mob-expanded');
  }
}

// ── Expose globals ────────────────────────────────────────────
// ── Re-apply AI colours after computeZones redraws circles ───
// Called at the end of computeZones() so veto operations don't wipe
// the AI colour classification from the remaining circles.
// The filterAreaCount guard prevents stale colours from a previous
// search being re-applied when the user runs a new commute search.
function reapplyFilterColors() {
  if (Object.keys(filterColorMap).length &&
      filterInitDone &&
      window.greenAreas &&
      greenAreas.length === filterAreaCount) {
    applyFilterColors(filterColorMap);
  }
}

// Retries the initial classification — called after Firebase auth is ready
// so the proxy path is available. No-ops if classification already succeeded.
function retryInitialClassification() {
  if (Object.keys(filterColorMap).length) return; // already done
  filterInitDone  = false;
  filterAreaCount = 0;
  runInitialAiClassification();
}

window.initFilterTab              = initFilterTab;
window.filterSend                 = filterSend;
window.retryInitialClassification = retryInitialClassification;
window.applyFilterColors          = applyFilterColors;
window.acceptFilter               = acceptFilter;
window.resetFilterColors          = resetFilterColors;
window.runInitialAiClassification = runInitialAiClassification;
window.renderPromptChips          = renderPromptChips;
window.renderSuggestions          = renderSuggestions;
window.showSuggestions            = showSuggestions;
window.hideSuggestions            = hideSuggestions;
window.useSuggestion              = useSuggestion;
window.showMapAiControls          = showMapAiControls;
window.applyAiTop5                = applyAiTop5;
window.clearAiTop5                = clearAiTop5;
window.reapplyFilterColors        = reapplyFilterColors;
window.showTopPicksCard           = showTopPicksCard;
window.showCategoryCard           = showCategoryCard;
window.toggleTop5Reason           = toggleTop5Reason;
