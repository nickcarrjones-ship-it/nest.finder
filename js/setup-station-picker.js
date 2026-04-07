/**
 * Searchable station picker — supports both legacy p1/p2 keys (map overlay)
 * and index-based access for the dynamic setup form.
 */
'use strict';

// Legacy object for map overlay (still uses p1/p2 ids)
window.stationSelections = { p1: null, p2: null };

// Array for setup form dynamic blocks
window.stationSelectionsArr = [];

// ── Index-based API (setup form dynamic blocks) ───────────────

function buildDropdownIdx(idx, query) {
  var destinations = window.DESTINATIONS || [];
  var drop = document.getElementById('drop-' + idx + '-work');
  if (!drop) return;
  var q = query.toLowerCase().trim();
  var filtered = q
    ? destinations.filter(function(d) { return d.label.toLowerCase().includes(q); })
    : destinations;

  drop.innerHTML = '';
  filtered.forEach(function(d) {
    var item = document.createElement('div');
    item.className = 'station-option';
    item.textContent = d.label;
    item.setAttribute('data-id', d.id);
    item.addEventListener('mousedown', function(e) {
      e.preventDefault();
      selectStationIdx(idx, d.id, d.label);
    });
    drop.appendChild(item);
  });

  if (filtered.length === 0) {
    drop.innerHTML = '<div class="station-option no-result">No stations found</div>';
  }
}

function filterStationsIdx(idx) {
  var input = document.getElementById('search-' + idx + '-work');
  if (!input) return;
  buildDropdownIdx(idx, input.value);
  var drop = document.getElementById('drop-' + idx + '-work');
  if (drop) drop.classList.add('open');
}

function openDropdownIdx(idx) {
  var input = document.getElementById('search-' + idx + '-work');
  buildDropdownIdx(idx, input ? input.value : '');
  var drop = document.getElementById('drop-' + idx + '-work');
  if (drop) drop.classList.add('open');
}

function blurDropdownIdx(idx) {
  setTimeout(function() {
    var drop = document.getElementById('drop-' + idx + '-work');
    if (drop) drop.classList.remove('open');
  }, 180);
}

function selectStationIdx(idx, id, label) {
  window.stationSelectionsArr[idx] = id;
  var hidden = document.getElementById('s-work-' + idx);
  var search = document.getElementById('search-' + idx + '-work');
  if (hidden) hidden.value = id;
  if (search) search.value = label;
  var drop = document.getElementById('drop-' + idx + '-work');
  if (drop) drop.classList.remove('open');
  document.querySelectorAll('#drop-' + idx + '-work .station-option').forEach(function(el) {
    el.classList.toggle('selected', el.getAttribute('data-id') === id);
  });
}

// ── Legacy p1/p2 API (map.html setup overlay) ─────────────────

function buildDropdown(person, query) {
  var destinations = window.DESTINATIONS || [];
  var drop = document.getElementById('drop-' + person + '-work');
  if (!drop) return;
  var q = query.toLowerCase().trim();
  var filtered = q
    ? destinations.filter(function(d) { return d.label.toLowerCase().includes(q); })
    : destinations;

  drop.innerHTML = '';
  filtered.forEach(function(d) {
    var item = document.createElement('div');
    item.className = 'station-option';
    item.textContent = d.label;
    item.setAttribute('data-id', d.id);
    item.addEventListener('mousedown', function(e) {
      e.preventDefault();
      selectStation(person, d.id, d.label);
    });
    drop.appendChild(item);
  });

  if (filtered.length === 0) {
    drop.innerHTML = '<div class="station-option no-result">No stations found</div>';
  }
}

function filterStations(person) {
  var input = document.getElementById('search-' + person + '-work');
  if (!input) return;
  buildDropdown(person, input.value);
  var drop = document.getElementById('drop-' + person + '-work');
  if (drop) drop.classList.add('open');
}

function openDropdown(person) {
  var input = document.getElementById('search-' + person + '-work');
  buildDropdown(person, input ? input.value : '');
  var drop = document.getElementById('drop-' + person + '-work');
  if (drop) drop.classList.add('open');
}

function blurDropdown(person) {
  setTimeout(function() {
    var drop = document.getElementById('drop-' + person + '-work');
    if (drop) drop.classList.remove('open');
  }, 180);
}

function selectStation(person, id, label) {
  window.stationSelections[person] = id;
  var hidden = document.getElementById('s-' + person + '-work');
  var search = document.getElementById('search-' + person + '-work');
  if (hidden) hidden.value = id;
  if (search) search.value = label;
  var drop = document.getElementById('drop-' + person + '-work');
  if (drop) drop.classList.remove('open');
  document.querySelectorAll('#drop-' + person + '-work .station-option').forEach(function(el) {
    el.classList.toggle('selected', el.getAttribute('data-id') === id);
  });
}

/**
 * populateDestDropdowns()
 * Legacy: fills old p1/p2 elements (map overlay) if they exist.
 * The dynamic setup form uses _initPersonBlockSelects() instead.
 */
function populateDestDropdowns() {
  ['p1', 'p2'].forEach(function(p) {
    if (document.getElementById('drop-' + p + '-work')) {
      buildDropdown(p, '');
    }
  });
}

window.buildDropdown        = buildDropdown;
window.buildDropdownIdx     = buildDropdownIdx;
window.filterStations       = filterStations;
window.filterStationsIdx    = filterStationsIdx;
window.openDropdown         = openDropdown;
window.openDropdownIdx      = openDropdownIdx;
window.blurDropdown         = blurDropdown;
window.blurDropdownIdx      = blurDropdownIdx;
window.selectStation        = selectStation;
window.selectStationIdx     = selectStationIdx;
window.populateDestDropdowns = populateDestDropdowns;
