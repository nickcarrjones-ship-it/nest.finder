/**
 * auth.js
 * ─────────────────────────────────────────────────────────────
 * Google Firebase authentication for nest.finder
 * 
 * Handles:
 * - Google Sign-In
 * - User persistence
 * - Ratings & veto syncing to Firebase
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

var AuthManager = (function() {
  var currentUser = null;
  var isAuthenticated = false;

  /**
   * initAuth()
   * Set up Firebase auth and create Google login button
   */
  function initAuth() {
    // Check if user is already logged in
    firebase.auth().onAuthStateChanged(function(user) {
      if (user) {
        // User logged in
        currentUser = user;
        isAuthenticated = true;
        onUserLoggedIn(user);
      } else {
        // User logged out
        currentUser = null;
        isAuthenticated = false;
        onUserLoggedOut();
      }
    });
  }

  /**
   * signInWithGoogle()
   * Called when user clicks "Sign in with Google"
   */
  function signInWithGoogle() {
    var provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
      .then(function(result) {
        currentUser = result.user;
        isAuthenticated = true;
        onUserLoggedIn(result.user);
      })
      .catch(function(error) {
        console.error('[Auth] Google sign-in failed:', error);
        alert('Failed to sign in: ' + error.message);
      });
  }

  /**
   * signOut()
   * Log the user out
   */
  function signOut() {
    firebase.auth().signOut()
      .then(function() {
        currentUser = null;
        isAuthenticated = false;
        onUserLoggedOut();
      })
      .catch(function(error) {
        console.error('[Auth] Sign out failed:', error);
      });
  }

  /**
   * onUserLoggedIn(user)
   * Called when user successfully logs in
   */
  function onUserLoggedIn(user) {
    console.log('[Auth] User logged in:', user.email);
    
    // Update header to show user is logged in
    updateAuthUI(user);
    
    // Enable veto buttons
    document.querySelectorAll('.veto-btn-disabled').forEach(function(btn) {
      btn.classList.remove('veto-btn-disabled');
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    });
    
    // Show "Viewing only" banner if it exists
    var guestBanner = document.getElementById('guest-banner');
    if (guestBanner) {
      guestBanner.style.display = 'none';
    }
    
    // Load saved ratings and vetoes from Firebase
    loadRatingsFromFirebase(user.uid);
    loadVetoesFromFirebase(user.uid);
  }

  /**
   * onUserLoggedOut()
   * Called when user logs out
   */
  function onUserLoggedOut() {
    console.log('[Auth] User logged out');
    
    // Update header to show login option
    updateAuthUI(null);
    
    // Disable veto buttons
    document.querySelectorAll('[onclick*="popupVeto"]').forEach(function(btn) {
      btn.classList.add('veto-btn-disabled');
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    });
    
    // Show "Viewing only" banner
    var guestBanner = document.getElementById('guest-banner');
    if (guestBanner) {
      guestBanner.style.display = 'block';
    }
  }

  /**
   * updateAuthUI(user)
   * Update header to show login/logout button
   */
  function updateAuthUI(user) {
    var authContainer = document.getElementById('auth-container');
    if (!authContainer) return;
    
    if (user) {
      // User is logged in
      authContainer.innerHTML =
        '<button onclick="AuthManager.signOut()" style="background:transparent;color:#9ca3af;border:1px solid #4b5563;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:10px;font-family:inherit;">Sign out</button>';
    } else {
      // User is logged out
      authContainer.innerHTML =
        '<button onclick="AuthManager.signInWithGoogle()" style="background:#4285f4;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">🔐 Sign in with Google</button>';
    }
  }

  /**
   * saveRatingToFirebase(userId, areaName, person, score, comment)
   */
  function saveRatingToFirebase(userId, areaName, person, score, comment) {
    if (!isAuthenticated) {
      console.warn('[Auth] Not authenticated, ratings not saved');
      return;
    }
    
    var db = firebase.database();
    var ref = db.ref('users/' + userId + '/ratings/' + sanitizeKey(areaName) + '/' + person);
    
    ref.set({
      score: score,
      comment: comment,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).catch(function(err) {
      console.error('[Auth] Failed to save rating:', err);
    });
  }

  /**
   * loadRatingsFromFirebase(userId)
   * Load user's saved ratings from Firebase
   */
  function loadRatingsFromFirebase(userId) {
    var db = firebase.database();
    db.ref('users/' + userId + '/ratings').on('value', function(snap) {
      var fbRatings = snap.val() || {};
      // Populate the global ratingsCache so getSaved() reflects Firebase data
      Object.keys(fbRatings).forEach(function(areaKey) {
        if (typeof ratingsCache !== 'undefined') ratingsCache[areaKey] = fbRatings[areaKey];
      });
      console.log('[Auth] Ratings loaded from Firebase:', Object.keys(fbRatings).length, 'areas');
      // Re-render results/top5 if visible
      if (typeof rebuildTop5 === 'function') rebuildTop5();
    });
  }

  /**
   * saveVetoToFirebase(userId, areaName, isVetoed)
   */
  function saveVetoToFirebase(userId, areaName, isVetoed) {
    if (!isAuthenticated) {
      console.warn('[Auth] Not authenticated, veto not saved');
      return;
    }
    
    var db = firebase.database();
    var ref = db.ref('users/' + userId + '/vetoes/' + sanitizeKey(areaName));
    
    if (isVetoed) {
      ref.set(true).catch(function(err) {
        console.error('[Auth] Failed to save veto:', err);
      });
    } else {
      ref.remove().catch(function(err) {
        console.error('[Auth] Failed to remove veto:', err);
      });
    }
  }

  /**
   * loadVetoesFromFirebase(userId)
   */
  function loadVetoesFromFirebase(userId) {
    var db = firebase.database();
    db.ref('users/' + userId + '/vetoes').on('value', function(snap) {
      window.userVetoes = snap.val() || {};
      console.log('[Auth] Vetoes loaded from Firebase');
      if (typeof window.syncVetoesFromFirebase === 'function') {
        window.syncVetoesFromFirebase(window.userVetoes);
      }
    });
  }

  /**
   * Utility: sanitize area name for Firebase key
   */
  function sanitizeKey(str) {
    return str.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  }

  /**
   * getUser()
   * Returns current user object or null
   */
  function getUser() {
    return currentUser;
  }

  /**
   * isLoggedIn()
   * Returns true if user is authenticated
   */
  function isLoggedIn() {
    return isAuthenticated;
  }

  /**
   * Same key shape as RTDB path users/{uid}/vetoes/{key}
   */
  function sanitizeAreaKey(str) {
    return str.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  }

  // Public API
  return {
    init: initAuth,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    sanitizeAreaKey: sanitizeAreaKey,
    saveRating: saveRatingToFirebase,
    saveVeto: saveVetoToFirebase,
    loadRatings: loadRatingsFromFirebase,
    loadVetoes: loadVetoesFromFirebase
  };
})();

// Make available globally
window.AuthManager = AuthManager;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  if (typeof firebase !== 'undefined') {
    AuthManager.init();
  }
});
