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

// ── Initialise tab ────────────────────────────────────────────
function initFilterTab() {
  var histEl   = document.getElementById('filter-chat-history');
  var inputEl  = document.getElementById('filter-input');
  var sendBtn  = document.getElementById('filter-send-btn');
  var actionsEl = document.getElementById('filter-actions');
  if (!histEl) return;

  // If no search has been run yet
  if (!window.greenAreas || !window.greenAreas.length) {
    histEl.innerHTML =
      '<div style="color:#9ca3af;font-size:12px;padding:12px 0;text-align:center">' +
      'Your Nest Agent analysis will appear here once the search loads.' +
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
    { p1: { name: 'Person 1', workLabel: 'their office' },
      p2: { name: 'Person 2', workLabel: 'their office' } };

  // On the first turn, prefix the message with area context so the AI
  // knows exactly which areas it needs to classify.
  var userContent = msg;
  if (filterMessages.length === 0) {
    var hasEnrichment = window.enrichmentDone &&
                        typeof getAreaContext === 'function';

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

    userContent =
      'Areas that match our commute requirements:\n' + areaList +
      '\n\nOur profiles: ' +
      profile.p1.name + ' works at ' + (profile.p1.workLabel || 'their office') + '. ' +
      profile.p2.name + ' works at ' + (profile.p2.workLabel || 'their office') + '.' +
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
    console.log('[NestFinder] Raw AI response:', raw);
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
      showMapAiControls(true);
    }
    if (parsed.top5 && parsed.top5.length) applyAiTop5(parsed.top5);
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
    'You are an expert London neighbourhood consultant helping a couple find their ideal home. ' +
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
    'Classify every area from the couple\'s commute-compatible shortlist as green / amber / red ' +
    'based on their stated preferences and your accurate knowledge.\n\n' +
    'Respond ONLY with valid JSON — no markdown, no code fences, no extra text:\n' +
    '{\n' +
    '  "reply": "Conversational response (2–4 sentences). Name specific areas. Be direct.",\n' +
    '  "colours": {\n' +
    '    "Area Name": "green",\n' +
    '    "Another Area": "amber",\n' +
    '    "Third Area": "red"\n' +
    '  },\n' +
    '  "top5": ["Best Area", "Second Area", "Third Area", "Fourth Area", "Fifth Area"]\n' +
    '}\n\n' +
    'Rules:\n' +
    '- green = genuinely good fit for their preferences\n' +
    '- amber = possible fit with specific reservations\n' +
    '- red = conflicts with what they want\n' +
    '- EVERY area in the list must appear in colours\n' +
    '- top5 = 5 best-fit areas, best first (fill with ambers if fewer than 5 green)\n' +
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
    counts[c] = (counts[c] || 0) + 1;
    if (!item.circle) return;
    // Leave grey ghost circles alone — they're set aside
    if (typeof isVetoed === 'function' && isVetoed(item.area.name)) return;
    if (c === 'red')   item.circle.setStyle({ fillColor: '#ef4444', color: '#dc2626', fillOpacity: 0.65 });
    if (c === 'amber') item.circle.setStyle({ fillColor: '#f97316', color: '#ea580c', fillOpacity: 0.60 });
    if (c === 'green') item.circle.setStyle({ fillColor: '#84cc16', color: '#65a30d', fillOpacity: 0.50 });
  });

  var sumEl = document.getElementById('filter-summary');
  if (sumEl) {
    sumEl.innerHTML =
      '<span style="color:#16a34a;font-weight:700">' + (counts.green || 0) + ' green</span>' +
      ' &nbsp;·&nbsp; ' +
      '<span style="color:#ea580c;font-weight:700">' + (counts.amber || 0) + ' amber</span>' +
      ' &nbsp;·&nbsp; ' +
      '<span style="color:#dc2626;font-weight:700">' + (counts.red || 0) + ' red</span>';
  }

  var actionsEl = document.getElementById('filter-actions');
  if (actionsEl) actionsEl.style.display = 'block';
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
  appendAIBubble(
    'Done! I\'ve vetoed ' + toVeto.length + ' area' + (toVeto.length !== 1 ? 's' : '') +
    '. Head to the Shortlist tab to review, or hit Undo to bring them all back.'
  );
}

function undoMassVeto() {
  if (!lastMassVeto.length) return;
  var count = lastMassVeto.length;
  if (typeof batchUnveto === 'function') batchUnveto(lastMassVeto);
  lastMassVeto = [];
  var undoBtn = document.getElementById('filter-undo-btn');
  if (undoBtn) undoBtn.style.display = 'none';
  appendAIBubble('Undone — ' + count + ' area' + (count !== 1 ? 's' : '') + ' restored to the map.');
}
window.undoMassVeto = undoMassVeto;

// ── Reset colours back to original green/gold ─────────────────
function resetFilterColors() {
  filterColorMap = {};
  if (window.greenAreas) {
    greenAreas.forEach(function(item) {
      if (!item.circle) return;
      // Restore grey circles to grey, not green
      if (typeof isVetoed === 'function' && isVetoed(item.area.name)) {
        item.circle.setStyle({ fillColor: '#cbd5e1', color: '#cbd5e1', weight: 1, fillOpacity: 0.2 });
        return;
      }
      var ranked = window.top5Cache && window.top5Cache[item.area.name];
      var isTop  = !!(ranked && ranked.rank);
      if (isTop) {
        item.circle.setStyle({ fillColor: '#f59e0b', color: '#d97706', fillOpacity: 0.75 });
      } else {
        item.circle.setStyle({ fillColor: '#84cc16', color: '#65a30d', fillOpacity: 0.45 });
      }
    });
  }
  var actionsEl = document.getElementById('filter-actions');
  if (actionsEl) actionsEl.style.display = 'none';
  showMapAiControls(false);
  clearAiTop5();
  var card = document.getElementById('ai-top5-card');
  if (card) card.style.display = 'none';
  appendAIBubble('Colours reset — the map is back to the original view.');
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
  if (typeof nfLoadingStart === 'function') nfLoadingStart('Nest Agent is analysing your areas\u2026');

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

    // Build an informative summary greeting
    var counts  = countColorsFromMap(colours);
    var greeting;
    if (top5.length) {
      greeting = greenAreas.length + ' areas sit within your maximum journey time. ' +
        'Based on your setup profile, your strongest matches look to be ' +
        top5.slice(0, 5).join(', ') + '. ' +
        (counts.green || 0) + ' areas are a great fit (green), ' +
        (counts.amber || 0) + ' are worth a closer look (amber), and ' +
        (counts.red || 0) + ' don\'t quite match your preferences (red). ' +
        'Ask me to dig deeper into any of these or refine the results further.';
    } else {
      greeting = parsed.reply || (greenAreas.length + ' areas are within your commute limits. I\'ve colour-coded them on the map — ask me anything about them.');
    }

    if (histEl) histEl.innerHTML = '';
    appendAIBubble(greeting);
    if (Object.keys(colours).length) {
      applyFilterColors(colours);
      showMapAiControls(true);
    }
    if (top5.length) applyAiTop5(top5);
    renderPromptChips();
    if (typeof nfLoadingDone === 'function') nfLoadingDone();

  }).catch(function(err) {
    if (histEl) {
      histEl.innerHTML = '';
      var noKey = err && err.code === 'NO_KEY';
      appendAIBubble(
        noKey
          ? 'The Nest Agent needs an API key to run — this is injected automatically when deployed. Ask me anything once the live site loads, or use the chat below to explore your areas manually.'
          : 'Couldn\'t connect to the Nest Agent right now. Use the chat below to ask me anything about your ' + (window.greenAreas ? greenAreas.length : 0) + ' areas.'
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
  var profile = ProfileManager.get() || { p1: { name: 'P1' }, p2: { name: 'P2' } };
  var greeting = (window.greenAreas ? greenAreas.length : 0) + ' areas sit within your maximum journey time. ';
  if (top5.length) {
    greeting += 'Your top matches based on your setup profile: ' + top5.slice(0, 5).join(', ') + '. ';
  }
  greeting += (counts.green || 0) + ' green · ' + (counts.amber || 0) + ' amber · ' + (counts.red || 0) + ' red. Ask me anything to explore further.';
  appendAIBubble(greeting);

  applyFilterColors(filterInitialColorMap);
  if (top5.length) applyAiTop5(top5);
  showMapAiControls(true);
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

function applyAiTop5(top5) {
  clearAiTop5();
  if (!top5 || !top5.length || !window.greenAreas || !window.nfLayers) return;

  top5.slice(0, 5).forEach(function(areaName, idx) {
    var gaItem = greenAreas.find(function(i) { return i.area.name === areaName; });
    if (!gaItem) return;
    var rank = idx + 1;
    var icon = L.divIcon({
      html: '<div style="background:#7c3aed;color:#fff;border:2px solid #fff;' +
        'border-radius:50%;width:24px;height:24px;display:flex;align-items:center;' +
        'justify-content:center;font-size:11px;font-weight:900;' +
        'box-shadow:0 2px 6px rgba(0,0,0,0.4);pointer-events:none">' + rank + '</div>',
      className: '', iconSize: [24, 24], iconAnchor: [12, 12]
    });
    var marker = L.marker([gaItem.area.lat, gaItem.area.lng],
      { icon: icon, interactive: false }).addTo(window.nfLayers.aiTop5);
    aiTop5Markers.push(marker);
  });

  // Update top5 card
  var card = document.getElementById('ai-top5-card');
  var list = document.getElementById('ai-top5-list');
  if (!card || !list) return;
  list.innerHTML = top5.slice(0, 5).map(function(name, i) {
    return '<li><span class="top5-rank-badge">' + (i + 1) + '</span>' +
      nfEscapeHtml(name) + '</li>';
  }).join('');
  card.style.display = 'block';
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
