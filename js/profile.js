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
 *   maxCommuteMins: 30,
 *   maxCommuteMinsP1: 30,
 *   maxCommuteMinsP2: 40,
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
      console.warn('[NestFinder] Could not load profile from localStorage:', e);
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
      console.warn('[NestFinder] Could not save profile:', e);
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
   * clear()
   * Wipes the stored profile (for testing / reset).
   */
  function clear() {
    _profile = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // Public API
  return { load: load, save: save, get: get, clear: clear };

}());

// Make available globally
window.ProfileManager = ProfileManager;
