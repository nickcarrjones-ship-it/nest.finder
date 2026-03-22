/**
 * Shared journey options: max commute (minutes) + walk to station (km) for setup + search tab.
 */
'use strict';

window.NFCommuteSettings = {
  fillCommuteSelect: function(sel, selectedValue) {
    if (!sel) return;
    var cfg = window.APP_CONFIG || {};
    var commuteOpts = cfg.commuteOptions || [20, 30, 45, 60];
    var def = cfg.commuteDefault || 30;
    var pick = selectedValue != null && !isNaN(selectedValue) ? selectedValue : def;
    sel.innerHTML = '';
    commuteOpts.forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m + ' min';
      if (m === pick) opt.selected = true;
      sel.appendChild(opt);
    });
  },

  fillWalkSelect: function(sel, selectedKm) {
    if (!sel) return;
    var opts = window.WALK_DISTANCE_OPTIONS || [];
    var cfg = window.APP_CONFIG || {};
    var def = cfg.walkDistanceDefault != null ? cfg.walkDistanceDefault : 1.5;
    var pick = selectedKm != null && !isNaN(selectedKm) ? selectedKm : def;
    sel.innerHTML = '';
    opts.forEach(function(w) {
      var opt = document.createElement('option');
      opt.value = w.km;
      opt.textContent = w.label;
      if (w.km === pick) opt.selected = true;
      sel.appendChild(opt);
    });
  },

  resolveCommute: function(profile) {
    var cfg = window.APP_CONFIG || {};
    var def = cfg.commuteDefault || 30;
    if (!profile) {
      return {
        sharedCommuteLimit: true,
        maxCommuteMins: def,
        maxCommuteMinsP1: def,
        maxCommuteMinsP2: def
      };
    }
    var shared = profile.sharedCommuteLimit !== false;
    var maxM = profile.maxCommuteMins != null ? profile.maxCommuteMins : def;
    var m1 = profile.maxCommuteMinsP1 != null ? profile.maxCommuteMinsP1 : maxM;
    var m2 = profile.maxCommuteMinsP2 != null ? profile.maxCommuteMinsP2 : maxM;
    return {
      sharedCommuteLimit: shared,
      maxCommuteMins: maxM,
      maxCommuteMinsP1: m1,
      maxCommuteMinsP2: m2
    };
  },

  resolveWalk: function(profile) {
    var cfg = window.APP_CONFIG || {};
    var defKm = cfg.walkDistanceDefault != null ? cfg.walkDistanceDefault : 1.5;
    if (!profile) {
      return {
        sharedWalkLimit: true,
        walkHomeKm: defKm,
        walkHomeKmP1: defKm,
        walkHomeKmP2: defKm
      };
    }
    var shared = profile.sharedWalkLimit !== false;
    if (profile.sharedWalkLimit === undefined && profile.sharedCommuteLimit !== undefined) {
      shared = profile.sharedCommuteLimit !== false;
    }
    var w = profile.walkHomeKm != null ? profile.walkHomeKm : defKm;
    var w1 = profile.walkHomeKmP1 != null ? profile.walkHomeKmP1 : w;
    var w2 = profile.walkHomeKmP2 != null ? profile.walkHomeKmP2 : w;
    return {
      sharedWalkLimit: shared,
      walkHomeKm: w,
      walkHomeKmP1: w1,
      walkHomeKmP2: w2
    };
  }
};
