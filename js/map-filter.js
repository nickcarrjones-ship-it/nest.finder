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

var filterMessages   = [];   // Full conversation history sent to Anthropic
var filterColorMap   = {};   // { 'Brixton': 'green', 'Hackney': 'amber', … }
var filterInitDone   = false; // Whether greeting has been shown for this session
var filterAreaCount  = 0;    // greenAreas.length at last init (detect re-searches)

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
      'Run a search first, then come back here to filter results with AI.' +
      '</div>';
    if (inputEl)  inputEl.disabled  = true;
    if (sendBtn)  sendBtn.disabled  = true;
    filterInitDone = false;
    return;
  }

  // Re-enable input (might have been left disabled from no-results state)
  if (inputEl)  inputEl.disabled  = false;
  if (sendBtn)  sendBtn.disabled  = false;

  // Reset if the user ran a new search (area count changed)
  if (filterInitDone && greenAreas.length === filterAreaCount) return;

  // Fresh start
  histEl.innerHTML = '';
  filterMessages   = [];
  filterColorMap   = {};
  filterAreaCount  = greenAreas.length;
  if (actionsEl) actionsEl.style.display = 'none';

  var profile = ProfileManager.get() ||
    { p1: { name: 'Person 1', workLabel: 'their office' },
      p2: { name: 'Person 2', workLabel: 'their office' } };

  var greeting =
    'Hi! I can see ' + greenAreas.length + ' areas that work for both ' +
    profile.p1.name + ' and ' + profile.p2.name +
    '. Tell me what matters most to you — neighbourhood vibe, nightlife, parks, ' +
    'schools, cafés, quietness — and I\'ll colour the map green for great fits, ' +
    'amber for maybes, and red for poor fits.';

  appendAIBubble(greeting);
  filterInitDone = true;
  renderPromptChips();
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
    model:      'claude-haiku-4-5-20251001',
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
    }
    filterReEnableInput();

  }).catch(function(err) {
    appendAIBubble(
      'Sorry, I couldn\'t connect right now. ' +
      (err && err.message ? err.message : 'Please try again.')
    );
    filterReEnableInput();
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
    'You are an experienced London estate agent and local neighbourhood expert ' +
    'helping a couple narrow down their shortlist.\n\n' +
    'You have been given a list of London areas that already meet their commute ' +
    'requirements. Your job is to classify each area based on their lifestyle ' +
    'preferences using your knowledge of London neighbourhoods — their character, ' +
    'demographics, café culture, nightlife, green spaces, school quality, noise ' +
    'levels, gentrification stage, safety, and general vibe.\n\n' +
    'You MUST respond ONLY with valid JSON in exactly this format — no markdown, ' +
    'no code fences, no extra text:\n' +
    '{\n' +
    '  "reply": "Your friendly conversational response (2–4 sentences max)",\n' +
    '  "colours": {\n' +
    '    "Area Name": "green",\n' +
    '    "Another Area": "amber",\n' +
    '    "Third Area": "red"\n' +
    '  }\n' +
    '}\n\n' +
    'Colour rules:\n' +
    '- green = good fit for their stated preferences\n' +
    '- amber = possible fit, some reservations worth mentioning\n' +
    '- red = poor fit or clearly conflicts with what they want\n\n' +
    'Every area from the list must appear in the colours object. ' +
    'Use only lowercase "green", "amber", or "red" as values. ' +
    'Valid JSON only — no markdown, no code fences.'
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
      if (e.key === 'Enter') filterSend();
    });
  }
});

// ── Initial AI classification (runs automatically after first search) ─
function runInitialAiClassification() {
  var profile = ProfileManager.get();
  if (!profile) return;
  if (profile.hasRunInitialAi) return;
  if (!window.greenAreas || !window.greenAreas.length) return;

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

  // Show loading message in chat
  var histEl = document.getElementById('filter-chat-history');
  if (histEl) {
    histEl.innerHTML = '';
    appendAIBubble('Analysing your areas based on your profile\u2026');
  }

  callAnthropicMessages({
    model:      'claude-haiku-4-5-20251001',
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

    var reply   = parsed.reply   || 'Here\'s my initial read based on your profile.';
    var colours = parsed.colours || {};

    // Seed conversation history so follow-up questions have context
    filterMessages   = [
      { role: 'user',      content: prompt },
      { role: 'assistant', content: data.content[0].text }
    ];
    filterInitDone  = true;
    filterAreaCount = greenAreas.length;

    if (histEl) histEl.innerHTML = '';
    appendAIBubble(reply);
    if (Object.keys(colours).length) applyFilterColors(colours);

    // Mark done so it won't re-run on subsequent searches
    var p = ProfileManager.get();
    if (p) { p.hasRunInitialAi = true; ProfileManager.save(p); }

  }).catch(function() {
    // Fail silently — don't break the map experience
    if (histEl) histEl.innerHTML = '';
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

function renderPromptChips() {
  var container = document.getElementById('filter-prompt-chips');
  if (!container) return;
  var prompts = buildPersonalisedPrompts();
  if (!prompts.length) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  container.innerHTML = prompts.map(function(p) {
    return '<button class="prompt-chip" onclick="usePromptChip(' +
      JSON.stringify(p) + ')">' + nfEscapeHtml(p) + '</button>';
  }).join('');
}

function usePromptChip(text) {
  var inputEl = document.getElementById('filter-input');
  if (!inputEl) return;
  inputEl.value = text;
  filterSend();
}

// ── Expose globals ────────────────────────────────────────────
window.initFilterTab              = initFilterTab;
window.filterSend                 = filterSend;
window.applyFilterColors          = applyFilterColors;
window.acceptFilter               = acceptFilter;
window.resetFilterColors          = resetFilterColors;
window.runInitialAiClassification = runInitialAiClassification;
window.renderPromptChips          = renderPromptChips;
window.usePromptChip              = usePromptChip;
