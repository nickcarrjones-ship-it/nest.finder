/**
 * Calls Anthropic Messages API.
 * Production: key injected by CI into config.js (never committed to git).
 * The special browser header opts in to direct browser usage per Anthropic's policy.
 */
'use strict';

async function callAnthropicMessages(body) {
  var cfg = window.APP_CONFIG || {};

  // Try proxy first (if configured and user is signed in)
  var proxyUrl = cfg.anthropicProxyUrl || '';
  if (proxyUrl) {
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      var token = await firebase.auth().currentUser.getIdToken();
      var resp = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(body)
      });
      return resp.json();
    }
  }

  // Fall back to direct browser call
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
    apiErr.apiError = data.error;
    throw apiErr;
  }
  return data;
}

window.callAnthropicMessages = callAnthropicMessages;
