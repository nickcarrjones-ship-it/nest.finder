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

  /**
   * resolveCommute(profile)
   * Returns per-member maxCommuteMins array.
   * maxMins[i] is the commute limit for members[i].
   * Also keeps legacy P1/P2 keys for backward compat during transition.
   */
  resolveCommute: function(profile) {
    var cfg = window.APP_CONFIG || {};
    var def = cfg.commuteDefault || 30;
    if (!profile || !Array.isArray(profile.members)) {
      return {
        sharedCommuteLimit: true,
        maxCommuteMins: def,
        maxMins: [def, def],
        // legacy keys
        maxCommuteMinsP1: def,
        maxCommuteMinsP2: def
      };
    }
    var shared = profile.sharedCommuteLimit !== false;
    var maxM = profile.maxCommuteMins != null ? profile.maxCommuteMins : def;
    var maxMins = profile.members.map(function(m) {
      return m.maxCommuteMins != null ? m.maxCommuteMins : maxM;
    });
    return {
      sharedCommuteLimit: shared,
      maxCommuteMins: maxM,
      maxMins: maxMins,
      // legacy keys (first two members)
      maxCommuteMinsP1: maxMins[0] != null ? maxMins[0] : def,
      maxCommuteMinsP2: maxMins[1] != null ? maxMins[1] : def
    };
  },

  /**
   * resolveWalk(profile)
   * Returns per-member walkHomeKm array.
   * walkKms[i] is the walk distance for members[i].
   * Also keeps legacy P1/P2 keys for backward compat during transition.
   */
  resolveWalk: function(profile) {
    var cfg = window.APP_CONFIG || {};
    var defKm = cfg.walkDistanceDefault != null ? cfg.walkDistanceDefault : 1.5;
    if (!profile || !Array.isArray(profile.members)) {
      return {
        sharedWalkLimit: true,
        walkHomeKm: defKm,
        walkKms: [defKm, defKm],
        // legacy keys
        walkHomeKmP1: defKm,
        walkHomeKmP2: defKm
      };
    }
    var shared = profile.sharedWalkLimit !== false;
    if (profile.sharedWalkLimit === undefined && profile.sharedCommuteLimit !== undefined) {
      shared = profile.sharedCommuteLimit !== false;
    }
    var w = profile.walkHomeKm != null ? profile.walkHomeKm : defKm;
    var walkKms = profile.members.map(function(m) {
      return m.walkHomeKm != null ? m.walkHomeKm : w;
    });
    return {
      sharedWalkLimit: shared,
      walkHomeKm: w,
      walkKms: walkKms,
      // legacy keys (first two members)
      walkHomeKmP1: walkKms[0] != null ? walkKms[0] : defKm,
      walkHomeKmP2: walkKms[1] != null ? walkKms[1] : defKm
    };
  }
};
