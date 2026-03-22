/**
 * Searchable station picker for Person 1 / Person 2 workplace fields.
 * Used by setup.html and map.html #setup-overlay (same DOM ids: s-p1-work, search-p1-work, …).
 */
'use strict';

window.stationSelections = { p1: null, p2: null };

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
 * Fills walk-time selects and builds initial station lists for p1/p2.
 */
function populateDestDropdowns() {
  var walk = (window.APP_CONFIG && window.APP_CONFIG.walkOptions) || [0, 5, 10, 15, 20];
  var walkDefault = (window.APP_CONFIG && window.APP_CONFIG.walkDefault) || 5;

  ['p1', 'p2'].forEach(function(p) {
    var walkSel = document.getElementById('s-' + p + '-offwalk');
    if (walkSel && walkSel.children.length === 0) {
      walk.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m + ' min';
        if (m === walkDefault) opt.selected = true;
        walkSel.appendChild(opt);
      });
    }
  });

  ['p1', 'p2'].forEach(function(p) {
    if (document.getElementById('drop-' + p + '-work')) {
      buildDropdown(p, '');
    }
  });
}

window.buildDropdown = buildDropdown;
window.filterStations = filterStations;
window.openDropdown = openDropdown;
window.blurDropdown = blurDropdown;
window.selectStation = selectStation;
window.populateDestDropdowns = populateDestDropdowns;
