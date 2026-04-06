/**
 * auth.js
 * ─────────────────────────────────────────────────────────────
 * Google Firebase authentication for Maloca
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
  var linkedToUid = null; // UID of the partner whose data we share, or null
  var myRole = null;      // 'p1' or 'p2' — which person this Google account is

  /**
   * initAuth()
   * Set up Firebase auth and create Google login button
   */
  function initAuth() {
    // On mobile, sign-in uses a redirect (not a popup). When Google bounces
    // the user back to the app, getRedirectResult fires before onAuthStateChanged,
    // so we handle any errors (e.g. cancelled) here first.
    if (_isMobileAuth()) {
      firebase.auth().getRedirectResult().catch(function(error) {
        console.error('[Auth] Redirect sign-in failed:', error);
        alert('Failed to sign in: ' + error.message);
      });
    }

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

  // Returns true on phones/tablets — used to pick redirect vs popup sign-in.
  function _isMobileAuth() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /**
   * signInWithGoogle()
   * Called when user clicks "Sign in with Google"
   */
  function signInWithGoogle() {
    var provider = new firebase.auth.GoogleAuthProvider();
    if (_isMobileAuth()) {
      // Mobile Safari blocks popups — use a full-page redirect instead.
      // onAuthStateChanged picks up the result when Google bounces back.
      firebase.auth().signInWithRedirect(provider);
    } else {
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

    // Dismiss tutorial now that user is signed in
    if (window.TutorialManager) TutorialManager.onSignIn();

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
    
    // Load saved ratings from Firebase (always user's own)
    loadRatingsFromFirebase(user.uid);

    // Determine role ('p1'/'p2') by matching email to profile
    resolveRoleFromEmail(user.email);

    // Check for couple link first, then load viewings from the right UID
    loadLinkedStatus(user.uid, function() {
      updateAuthUI(user); // re-render so link button reflects linked state
      var dataUid = getDataUid();
      if (typeof loadViewingsFromFirebase === 'function') loadViewingsFromFirebase(dataUid);
      if (typeof loadNonNegotiablesFromFirebase === 'function') loadNonNegotiablesFromFirebase(dataUid);
      if (typeof loadWishlistFromFirebase === 'function') loadWishlistFromFirebase(dataUid);
    });

    // Profile + cache sync: pull from Firebase, then retry classification.
    // retryInitialClassification() is called inside _syncProfile once both
    // the profile and the classification cache are loaded — so mobile devices
    // skip the AI call if the cache already exists in Firebase.
    _syncProfile(user.uid);
  }

  /**
   * _syncProfile(uid)
   * Two-way profile sync between Firebase and localStorage.
   * Firebase wins if it has a valid profile (most authoritative across devices).
   * Falls back to uploading the local profile if Firebase has nothing.
   */
  function _syncProfile(uid) {
    firebase.database().ref('users/' + uid + '/profile').once('value', function(snap) {
      var fbProfile = snap.val();
      var fbValid = fbProfile && fbProfile.p1 && fbProfile.p1.workId &&
                                 fbProfile.p2 && fbProfile.p2.workId;
      if (fbValid) {
        // Firebase has a profile → push it to localStorage and re-resolve role
        if (typeof ProfileManager !== 'undefined') {
          ProfileManager.save(fbProfile);
          resolveRoleFromEmail(currentUser.email);
        }
      } else {
        // Firebase has no profile → upload from localStorage if available
        var localProfile = (typeof ProfileManager !== 'undefined') &&
                           ProfileManager.load() && ProfileManager.get();
        if (localProfile) {
          firebase.database().ref('users/' + uid + '/profile').set(localProfile)
            .catch(function(e) { console.warn('[Auth] Profile upload failed:', e); });
        }
      }

      // Load classification cache from Firebase into localStorage (if not already there),
      // then retry the AI classification — so mobile devices use the cached result
      // from the web session instead of running a fresh agent search.
      if (typeof loadCacheFromFirebase === 'function') {
        loadCacheFromFirebase(uid, function() {
          if (typeof retryInitialClassification === 'function') {
            retryInitialClassification();
          }
        });
      } else {
        if (typeof retryInitialClassification === 'function') {
          retryInitialClassification();
        }
      }
    }).catch(function(e) {
      console.warn('[Auth] Profile sync failed:', e);
      // Still retry classification even if sync failed
      if (typeof retryInitialClassification === 'function') {
        retryInitialClassification();
      }
    });
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
      var linkLabel = linkedToUid ? '🔗 Linked' : '🔗 Link';
      authContainer.innerHTML =
        '<button onclick="AuthManager.showLinkModal()" style="background:transparent;color:' + (linkedToUid ? '#16a34a' : '#9ca3af') + ';border:1px solid ' + (linkedToUid ? '#bbf7d0' : '#4b5563') + ';padding:4px 10px;border-radius:4px;cursor:pointer;font-size:10px;font-family:inherit;margin-right:6px;">' + linkLabel + '</button>' +
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
      if (typeof renderNestScores === 'function') renderNestScores();
    });
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

  /**
   * getDataUid()
   * Returns the UID whose Firebase data we should read/write.
   * If this user is linked to a partner, returns the partner's UID.
   */
  function getDataUid() {
    if (!currentUser) return null;
    return linkedToUid || currentUser.uid;
  }

  /**
   * loadLinkedStatus(uid, callback)
   * Checks Firebase for an existing couple link, caches it, then fires callback.
   */
  function loadLinkedStatus(uid, callback) {
    firebase.database().ref('users/' + uid + '/linkedTo').once('value', function(snap) {
      linkedToUid = snap.val() || null;
      if (callback) callback();
    });
  }

  /**
   * resolveRoleFromEmail(email)
   * Matches the logged-in Google email against p1.email / p2.email in the
   * profile. Sets myRole to 'p1' or 'p2' automatically — no picker needed.
   */
  function resolveRoleFromEmail(email) {
    var profile = (typeof ProfileManager !== 'undefined' && ProfileManager.get()) || {};
    var p1email = (profile.p1 && profile.p1.email) ? profile.p1.email.toLowerCase() : null;
    var p2email = (profile.p2 && profile.p2.email) ? profile.p2.email.toLowerCase() : null;
    var lowerEmail = (email || '').toLowerCase();

    if (p1email && lowerEmail === p1email) {
      myRole = 'p1';
    } else if (p2email && lowerEmail === p2email) {
      myRole = 'p2';
    } else {
      myRole = null; // email not in profile yet — both rows editable as fallback
      console.warn('[Auth] Logged-in email not found in profile — add it via Edit profile to lock score rows.');
    }
    if (typeof applyRoleLock === 'function') applyRoleLock();
  }

  /**
   * getMyRole()
   * Returns 'p1', 'p2', or null if email not matched to profile.
   */
  function getMyRole() {
    return myRole;
  }

  /**
   * generateInviteCode()
   * Creates a 6-char code in Firebase under invites/{code} and displays it.
   */
  function generateInviteCode() {
    if (!currentUser) return;
    var code = Math.random().toString(36).substr(2, 6).toUpperCase();
    var profile = (typeof ProfileManager !== 'undefined' && ProfileManager.get()) || {};
    firebase.database().ref('invites/' + code).set({
      uid: currentUser.uid,
      profile: profile,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function() {
      var codeEl = document.getElementById('lm-generated-code');
      if (codeEl) codeEl.textContent = code;
      var codeWrap = document.getElementById('lm-code-wrap');
      if (codeWrap) codeWrap.style.display = 'block';
      var genBtn = document.getElementById('lm-gen-btn');
      if (genBtn) genBtn.style.display = 'none';
    });
  }

  /**
   * redeemInviteCode(code)
   * Looks up the invite, links this account to the partner's UID, reloads viewings.
   */
  function redeemInviteCode(code) {
    if (!currentUser) return;
    var cleaned = code.trim().toUpperCase();
    firebase.database().ref('invites/' + cleaned).once('value', function(snap) {
      var invite = snap.val();
      if (!invite) {
        alert('Code not found. Check it and try again.');
        return;
      }
      if (invite.uid === currentUser.uid) {
        alert('That\'s your own code — share it with your partner!');
        return;
      }
      var partnerUid = invite.uid;
      // Write the link to this user's record, then delete the invite
      firebase.database().ref('users/' + currentUser.uid + '/linkedTo').set(partnerUid)
        .then(function() {
          return firebase.database().ref('invites/' + cleaned).remove();
        })
        .then(function() {
          linkedToUid = partnerUid;
          hideLinkModal();
          updateAuthUI(currentUser);
          // Reload viewings from the partner's data
          if (typeof loadViewingsFromFirebase === 'function') loadViewingsFromFirebase(partnerUid);
          alert('Linked! You\'re now sharing viewings and starred properties.');
        });
    });
  }

  /**
   * unlinkPartner()
   * Removes the couple link and reloads viewings from own data.
   */
  function unlinkPartner() {
    if (!currentUser) return;
    if (!confirm('Unlink from your partner? You\'ll return to your own separate data.')) return;
    firebase.database().ref('users/' + currentUser.uid + '/linkedTo').remove()
      .then(function() {
        linkedToUid = null;
        hideLinkModal();
        updateAuthUI(currentUser);
        if (typeof loadViewingsFromFirebase === 'function') loadViewingsFromFirebase(currentUser.uid);
      });
  }

  /**
   * showLinkModal() / hideLinkModal()
   * Renders the couple-linking modal overlay.
   */
  function showLinkModal() {
    var existing = document.getElementById('lm-overlay');
    if (existing) { existing.remove(); }

    var content;
    if (linkedToUid) {
      content =
        '<div class="lm-section">' +
          '<div class="lm-linked-badge">🔗 Linked</div>' +
          '<p class="lm-hint">You\'re sharing viewings and starred properties with your partner.</p>' +
          '<button class="lm-btn lm-btn-danger" onclick="AuthManager.unlinkPartner()">Unlink</button>' +
        '</div>';
    } else {
      content =
        '<div class="lm-section">' +
          '<div class="lm-section-title">Share your code</div>' +
          '<p class="lm-hint">Generate a one-time code and share it with your partner.</p>' +
          '<button id="lm-gen-btn" class="lm-btn" onclick="AuthManager.generateInviteCode()">Generate code</button>' +
          '<div id="lm-code-wrap" style="display:none">' +
            '<div class="lm-code" id="lm-generated-code"></div>' +
            '<p class="lm-hint">Share this with your partner. It works once.</p>' +
          '</div>' +
        '</div>' +
        '<div class="lm-divider"></div>' +
        '<div class="lm-section">' +
          '<div class="lm-section-title">Enter partner\'s code</div>' +
          '<input id="lm-code-input" class="lm-input" type="text" maxlength="6" placeholder="ABC123" />' +
          '<button class="lm-btn" onclick="AuthManager.redeemInviteCode(document.getElementById(\'lm-code-input\').value)">Link up</button>' +
        '</div>';
    }

    var overlay = document.createElement('div');
    overlay.id = 'lm-overlay';
    overlay.className = 'lm-overlay';
    overlay.innerHTML =
      '<div class="lm-modal">' +
        '<div class="lm-header"><span>Link partner</span><button class="lm-close" onclick="AuthManager.hideLinkModal()">✕</button></div>' +
        content +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) hideLinkModal();
    });
  }

  function hideLinkModal() {
    var overlay = document.getElementById('lm-overlay');
    if (overlay) overlay.remove();
  }

  /**
   * getOrCreateCalToken(callback)
   * Returns (via callback) the user's secret calendar token, creating one if needed.
   * Token is stored at users/{uid}/calToken in Firebase.
   */
  function getOrCreateCalToken(callback) {
    if (!currentUser) return;
    var ref = firebase.database().ref('users/' + currentUser.uid + '/calToken');
    ref.once('value', function(snap) {
      if (snap.val()) {
        callback(snap.val());
      } else {
        var token = Math.random().toString(36).substr(2, 10) +
                    Math.random().toString(36).substr(2, 10);
        ref.set(token).then(function() { callback(token); });
      }
    });
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
    loadRatings: loadRatingsFromFirebase,
    getDataUid: getDataUid,
    showLinkModal: showLinkModal,
    hideLinkModal: hideLinkModal,
    generateInviteCode: generateInviteCode,
    redeemInviteCode: redeemInviteCode,
    unlinkPartner: unlinkPartner,
    getMyRole: getMyRole,
    getOrCreateCalToken: getOrCreateCalToken
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
