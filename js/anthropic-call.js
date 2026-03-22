/**
 * Calls Anthropic Messages API via Firebase Cloud Function proxy (preferred)
 * or direct browser call when anthropicKey is set for local development only.
 */
'use strict';

async function callAnthropicMessages(body) {
  var cfg = window.APP_CONFIG || {};
  var proxyUrl = cfg.anthropicProxyUrl || '';
  if (proxyUrl) {
    if (typeof firebase === 'undefined' || !firebase.auth || !firebase.auth().currentUser) {
      var needAuth = new Error('AUTH_REQUIRED');
      needAuth.code = 'AUTH_REQUIRED';
      throw needAuth;
    }
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
  var key = cfg.anthropicKey || '';
  if (!key || key.indexOf('%%') === 0) {
    var noKey = new Error('NO_KEY');
    noKey.code = 'NO_KEY';
    throw noKey;
  }
  var resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-iab-ash-pchd': 'true'
    },
    body: JSON.stringify(body)
  });
  return resp.json();
}

window.callAnthropicMessages = callAnthropicMessages;
