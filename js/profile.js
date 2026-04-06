/**
 * profile.js
 * ─────────────────────────────────────────────────────────────
 * Manages reading and writing the couple's setup profile.
 * The profile is stored in localStorage so it persists between
 * browser sessions. When Firebase is connected it also syncs.
 *
 * A profile looks like this:
 * {
 *   sharedCommuteLimit: true,
 *   maxCommuteMins: 30, maxCommuteMinsP1: 30, maxCommuteMinsP2: 40,
 *   walkHomeKm: 1.5, walkHomeKmP1: 1.5, walkHomeKmP2: 2.0,
 *   travelTime: 'peak',         // 'peak' | 'offpeak' | 'varies'
 *   propertyType: 'rent',       // 'rent' | 'sale'
 *   maxPrice: '600000',         // string or 'any'
 *   beds: '2',                  // string or 'any'
 *   bathrooms: '1',             // string or 'any'
 *   propertyFormat: 'flat',     // 'flat' | 'house' | 'either'
 *   hasRunInitialAi: false,     // whether AI has pre-classified on first load
 *   areaCards: {                // area personality card selections
 *     'Richmond': 'love',
 *     'Brixton': 'hate',
 *     ...
 *   },
 *   lifestyle: {
 *     freeText: '...',
 *     greenSpace: 'essential',
 *     streetVibe: 'buzzy',
 *     nightsOut: 'occasional',
 *     schoolsPriority: 'someday',
 *     safetyPriority: 'veryimportant',
 *     dealbreakers: ['nightlife']
 *   },
 *   p1: { name: "Alice", workId: "canary_wharf", workLabel: "Canary Wharf", offWalk: 5, gym: "thirdspace" },
 *   p2: { name: "Bob",   workId: "holborn",       workLabel: "Holborn",       offWalk: 5, gym: "f45" }
 * }
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

var ProfileManager = (function () {

  var STORAGE_KEY = (window.APP_CONFIG && window.APP_CONFIG.storagePrefix || 'nf_') + 'profile';

  // The currently loaded profile — null if no setup done yet.
  var _profile = null;

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
      // Basic validation — must have p1 and p2 with name + workId
      if (parsed && parsed.p1 && parsed.p1.name && parsed.p1.workId &&
                    parsed.p2 && parsed.p2.name && parsed.p2.workId) {
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
      if (data && data.p1 && data.p1.name && data.p1.workId &&
                  data.p2 && data.p2.name && data.p2.workId) {
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
