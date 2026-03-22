/**
 * HTTPS proxy for Anthropic Messages API.
 * Requires Firebase ID token (Google sign-in). API key via:
 *   firebase functions:config:set anthropic.key="YOUR_ANTHROPIC_KEY"
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.anthropicMessages = functions.region('europe-west1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  try {
    await admin.auth().verifyIdToken(token);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const anthropicKey =
    (functions.config().anthropic && functions.config().anthropic.key) || process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('anthropic.key not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Upstream request failed' });
  }
});
