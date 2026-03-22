/**
 * Calls Anthropic Messages API via the Firebase Cloud Function proxy.
 * The proxy keeps the API key server-side; the browser never sees it.
 * Requires the user to be signed in with Google (Firebase auth).
 */
'use strict';

async function callAnthropicMessages(body) {
  var cfg = window.APP_CONFIG || {};
  var proxyUrl = cfg.anthropicProxyUrl || '';

  if (proxyUrl) {
    // Proxy is configured — require sign-in
    var currentUser = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
    if (!currentUser) {
      var authErr = new Error('AUTH_REQUIRED');
      authErr.code = 'AUTH_REQUIRED';
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
    var proxyData = await resp.json();
    if (!resp.ok) {
      var proxyErr = new Error('Proxy error ' + resp.status + ': ' + (proxyData.error || JSON.stringify(proxyData)));
      proxyErr.status = resp.status;
      throw proxyErr;
    }
    return proxyData;
  }

  // No proxy — direct browser call (local dev only; blocked by CORS in production)
  var key = cfg.anthropicKey || '';
  if (!key || key.indexOf('%%') !== -1) {
    var noKey = new Error('NO_KEY');
    noKey.code = 'NO_KEY';
    throw noKey;
  }
  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-iab-ash-pchd': 'true'
    },
    body: JSON.stringify(body)
  });
  var data = await r.json();
  if (!r.ok) {
    var msg = (data.error && data.error.message) ? data.error.message : ('HTTP ' + r.status);
    var apiErr = new Error('Anthropic API error: ' + msg);
    apiErr.status = r.status;
    throw apiErr;
  }
  return data;
}

window.callAnthropicMessages = callAnthropicMessages;
