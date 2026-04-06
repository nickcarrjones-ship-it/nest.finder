/**
 * Calls Anthropic Messages API via the Firebase Cloud Function proxy.
 * The proxy keeps the API key server-side; the browser never sees it.
 * Requires the user to be signed in with Google (Firebase auth).
 */
'use strict';

async function callAnthropicMessages(body) {
  var proxyUrl = (window.APP_CONFIG || {}).anthropicProxyUrl || '';

  if (!proxyUrl) {
    throw new Error('AI proxy not configured.');
  }

  var currentUser = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
  if (!currentUser) {
    var authErr = new Error('Please sign in to use AI features.');
    authErr.code = 'NOT_SIGNED_IN';
    throw authErr;
  }

  var token = await currentUser.getIdToken();
  var resp = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(body)
  });

  var data = await resp.json();
  if (!resp.ok) {
    console.warn('[Maloca] Proxy error:', JSON.stringify(data));
    var err = new Error('AI service temporarily unavailable. Please try again in a moment.');
    err.status = resp.status;
    throw err;
  }
  return data;
}

window.callAnthropicMessages = callAnthropicMessages;
