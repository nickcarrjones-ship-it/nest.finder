/**
 * profile.js
 * ─────────────────────────────────────────────────────────────
 * Manages reading and writing the group's setup profile.
 * The profile is stored in localStorage so it persists between
 * browser sessions. When Firebase is connected it also syncs.
 *
 * A profile looks like this:
 * {
 *   groupType: 'couple' | 'group',   // set during setup
 *   sharedCommuteLimit: true,
 *   maxCommuteMins: 30,
 *   travelTime: 'peak',         // 'peak' | 'offpeak' | 'varies'
 *   propertyType: 'rent',       // 'rent' | 'sale'
 *   maxPrice: '600000',         // string or 'any'
 *   beds: '2',                  // string or 'any'
 *   bathrooms: '1',             // string or 'any'
 *   propertyFormat: 'flat',     // 'flat' | 'house' | 'either'
 *   hasRunInitialAi: false,
 *   areaCards: { 'Richmond': 'love', ... },
 *   lifestyle: { freeText: '...', greenSpace: 'essential', ... },
 *   members: [
 *     { id: 'm0', name: 'Alice', workId: 'canary_wharf', workLabel: 'Canary Wharf',
 *       offWalk: 5, gym: 'thirdspace', email: 'alice@gmail.com',
 *       maxCommuteMins: 30, walkHomeKm: 1.5 },
 *     { id: 'm1', name: 'Bob', workId: 'holborn', workLabel: 'Holborn',
 *       offWalk: 5, gym: 'f45', email: 'bob@gmail.com',
 *       maxCommuteMins: 40, walkHomeKm: 2.0 }
 *     // up to 5 members total
 *   ]
 * }
 *
 * Old profiles with p1/p2 keys are automatically migrated to members[]
 * on first load.
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

var ProfileManager = (function () {

  var STORAGE_KEY = (window.APP_CONFIG && window.APP_CONFIG.storagePrefix || 'nf_') + 'profile';

  // The currently loaded profile — null if no setup done yet.
  var _profile = null;

  /**
   * _migrate(data)
   * Converts old {p1, p2} profiles to the new {members: []} shape.
   * Returns the data unchanged if members[] is already present.
   */
  function _migrate(data) {
    if (!data) return data;
    if (data.members && Array.isArray(data.members)) return data; // already new shape
    if (data.p1) {
      // Convert old couple shape to members array
      var members = [];
      if (data.p1) {
        var m0 = Object.assign({}, data.p1, { id: 'm0' });
        // Move per-person commute/walk from top-level profile fields onto member
        if (m0.maxCommuteMins == null && data.maxCommuteMinsP1 != null) m0.maxCommuteMins = data.maxCommuteMinsP1;
        if (m0.walkHomeKm == null && data.walkHomeKmP1 != null) m0.walkHomeKm = data.walkHomeKmP1;
        members.push(m0);
      }
      if (data.p2) {
        var m1 = Object.assign({}, data.p2, { id: 'm1' });
        if (m1.maxCommuteMins == null && data.maxCommuteMinsP2 != null) m1.maxCommuteMins = data.maxCommuteMinsP2;
        if (m1.walkHomeKm == null && data.walkHomeKmP2 != null) m1.walkHomeKm = data.walkHomeKmP2;
        members.push(m1);
      }
      var migrated = Object.assign({}, data, { members: members, groupType: data.groupType || 'couple' });
      // Remove old keys to keep profile clean
      delete migrated.p1;
      delete migrated.p2;
      delete migrated.maxCommuteMinsP1;
      delete migrated.maxCommuteMinsP2;
      delete migrated.walkHomeKmP1;
      delete migrated.walkHomeKmP2;
      return migrated;
    }
    return data;
  }

  /**
   * _isValid(data)
   * Returns true if the profile has the required fields.
   */
  function _isValid(data) {
    return data &&
      Array.isArray(data.members) &&
      data.members.length >= 2 &&
      data.members.every(function(m) { return m && m.name && m.workId; });
  }

  /**
   * load()
   * Reads the profile from localStorage.
   * Returns true if a valid profile was found, false otherwise.
   */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      parsed = _migrate(parsed);
      if (_isValid(parsed)) {
        _profile = parsed;
        return true;
      }
    } catch (e) {
      console.warn('[Maloca] Could not load profile from localStorage:', e);
    }
    return false;
  }

  /**
   * save(profileData)
   * Writes a profile object to localStorage and caches it.
   */
  function save(profileData) {
    _profile = profileData;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_profile));
    } catch (e) {
      console.warn('[Maloca] Could not save profile:', e);
    }
  }

  /**
   * get()
   * Returns the currently loaded profile, or null.
   */
  function get() {
    return _profile;
  }

  /**
   * syncToFirebase(uid)
   * Writes the current profile to Firebase under users/{uid}/profile.
   * Fire-and-forget — does not block the caller.
   */
  function syncToFirebase(uid) {
    if (!_profile || !uid) return;
    if (typeof firebase === 'undefined' || !firebase.database) return;
    firebase.database().ref('users/' + uid + '/profile').set(_profile)
      .catch(function(e) {
        console.warn('[ProfileManager] Firebase sync failed:', e);
      });
  }

  /**
   * loadFromFirebase(uid, callback)
   * Reads profile from Firebase. If valid, saves to localStorage.
   * Calls callback(true) if a profile was found, callback(false) otherwise.
   */
  function loadFromFirebase(uid, callback) {
    if (!uid) { if (callback) callback(false); return; }
    if (typeof firebase === 'undefined' || !firebase.database) {
      if (callback) callback(false);
      return;
    }
    firebase.database().ref('users/' + uid + '/profile').once('value', function(snap) {
      var data = snap.val();
      data = _migrate(data);
      if (_isValid(data)) {
        save(data);
        if (callback) callback(true);
      } else {
        if (callback) callback(false);
      }
    }).catch(function(e) {
      console.warn('[ProfileManager] Firebase load failed:', e);
      if (callback) callback(false);
    });
  }

  /**
   * clear()
   * Wipes the stored profile (for testing / reset).
   */
  function clear() {
    _profile = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // Public API
  return { load: load, save: save, get: get, clear: clear, syncToFirebase: syncToFirebase, loadFromFirebase: loadFromFirebase };

}());

// Make available globally
window.ProfileManager = ProfileManager;
