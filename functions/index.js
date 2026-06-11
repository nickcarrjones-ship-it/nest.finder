/**
 * Firebase Cloud Functions for Maloca
 *
 * 1. anthropicMessages — HTTPS proxy for Anthropic API (requires Firebase ID token)
 * 2. calendarFeed      — webcal .ics feed for a user's viewings (token-protected)
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * calendarFeed
 * GET /calendarFeed?token=<calToken>
 * Returns a .ics webcal feed of the user's scheduled viewings.
 * The calToken is stored at users/{uid}/calToken — it proves identity
 * without requiring a Firebase session (calendar apps can't do that).
 */
exports.calendarFeed = functions.region('europe-west1').https.onRequest(async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).send('Missing token');
  }

  // Find the uid whose calToken matches
  const db = admin.database();
  const snap = await db.ref('users').orderByChild('calToken').equalTo(token).once('value');
  if (!snap.exists()) {
    return res.status(401).send('Invalid token');
  }

  const uid = Object.keys(snap.val())[0];
  const userData = snap.val()[uid];
  const viewings = userData.viewings || {};

  // Build .ics lines
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maloca//maloca.homes//EN',
    'X-WR-CALNAME:Maloca Viewings',
    'X-WR-CALDESC:Property viewings from Maloca',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:Europe/London',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/London',
    'BEGIN:STANDARD',
    'TZNAME:GMT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0000',
    'DTSTART:19701025T020000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZNAME:BST',
    'TZOFFSETFROM:+0000',
    'TZOFFSETTO:+0100',
    'DTSTART:19700329T010000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'END:DAYLIGHT',
    'END:VTIMEZONE'
  ];

  Object.entries(viewings).forEach(([id, v]) => {
    if (!v.date) return; // skip entries with no date
    const dateParts = v.date.split('-');
    const rawTime = v.time || '09:00';
    const timeParts = rawTime.split(':');
    const pad = n => String(n).padStart(2, '0');

    const dtStart = dateParts[0] + dateParts[1] + dateParts[2] + 'T' + timeParts[0] + timeParts[1] + '00';
    // 30-minute viewing slot
    const startMins = parseInt(timeParts[0], 10) * 60 + parseInt(timeParts[1], 10);
    const endMins   = startMins + 30;
    const endHour   = pad(Math.floor(endMins / 60) % 24);
    const endMin    = pad(endMins % 60);
    const dtEnd     = dateParts[0] + dateParts[1] + dateParts[2] + 'T' + endHour + endMin + '00';

    const summary  = 'Viewing: ' + (v.address || v.area || 'Property');
    const location = v.address || '';
    const descParts = [];
    if (v.notes)      descParts.push(v.notes);
    if (v.agentName)  descParts.push('Agent: ' + v.agentName);
    if (v.listingUrl) descParts.push('Listing: ' + v.listingUrl);
    if (v.price)      descParts.push('Price: ' + v.price);
    const description = descParts.join('\\n');

    // Use the Firebase push ID as the UID so edits update the same event
    const eventUid = id + '@maloca';

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + eventUid);
    lines.push('DTSTART;TZID=Europe/London:' + dtStart);
    lines.push('DTEND;TZID=Europe/London:' + dtEnd);
    lines.push('SUMMARY:' + summary);
    if (location)    lines.push('LOCATION:' + location);
    if (description) lines.push('DESCRIPTION:' + description);
    lines.push('STATUS:' + (v.status === 'viewed' ? 'COMPLETED' : 'CONFIRMED'));
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Cache-Control', 'no-cache, no-store');
  return res.status(200).send(lines.join('\r\n'));
});

/**
 * linkPartner
 * POST { code } with a Firebase ID token in the Authorization header.
 *
 * Couple linking must happen server-side: database rules only grant
 * partner access when BOTH sides of the link are recorded
 * (redeemer/linkedTo + creator/linkedPartner), and clients can't write
 * each other's nodes. This function validates the invite code and
 * writes both sides atomically with admin rights.
 */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // codes expire after 24h

exports.linkPartner = functions.region('europe-west1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: 'auth_required' });
  }

  let uid;
  try {
    uid = (await admin.auth().verifyIdToken(idToken)).uid;
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,8}$/.test(code)) {
    return res.status(400).json({ error: 'code_invalid' });
  }

  const db = admin.database();
  const inviteSnap = await db.ref('invites/' + code).once('value');
  const invite = inviteSnap.val();
  if (!invite || !invite.uid) {
    return res.status(404).json({ error: 'code_not_found' });
  }
  if (invite.createdAt && Date.now() - invite.createdAt > INVITE_TTL_MS) {
    await db.ref('invites/' + code).remove();
    return res.status(410).json({ error: 'code_expired' });
  }

  const partnerUid = invite.uid;
  if (partnerUid === uid) {
    return res.status(400).json({ error: 'own_code' });
  }

  const [myLinkedTo, theirLinkedTo, theirPartner] = (await Promise.all([
    db.ref('users/' + uid + '/linkedTo').once('value'),
    db.ref('users/' + partnerUid + '/linkedTo').once('value'),
    db.ref('users/' + partnerUid + '/linkedPartner').once('value')
  ])).map((s) => s.val());

  // If the code creator is already linked TO the redeemer, the couple is
  // linked the other way round. Completing this redemption would flip
  // which account hosts the shared data and hide their viewings.
  if (theirLinkedTo === uid) {
    return res.status(409).json({ error: 'reverse_link_exists' });
  }
  if (myLinkedTo && myLinkedTo !== partnerUid) {
    return res.status(409).json({ error: 'already_linked' });
  }
  if (theirPartner && theirPartner !== uid) {
    return res.status(409).json({ error: 'partner_already_linked' });
  }

  await db.ref().update({
    ['users/' + uid + '/linkedTo']: partnerUid,
    ['users/' + partnerUid + '/linkedPartner']: uid,
    ['invites/' + code]: null
  });

  // profile lets the redeemer inherit the creator's commute settings
  return res.status(200).json({ partnerUid: partnerUid, profile: invite.profile || null });
});

const MONTHLY_LIMIT = 50;

// Only the models Maloca actually uses may pass through the proxy,
// and max_tokens is capped at the largest value the app requests
// (8000 for area classification). Anything else is rejected so a
// stolen auth token can't run up the Anthropic bill.
const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
const MAX_TOKENS_CAP = 8192;
const MAX_BODY_BYTES = 100000; // ~25k input tokens — far above any Maloca prompt

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

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('ANTHROPIC_API_KEY environment variable not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ── Validate the request body before it reaches Anthropic ─────
  const body = req.body || {};
  if (!ALLOWED_MODELS.includes(body.model)) {
    return res.status(400).json({ error: 'model_not_allowed' });
  }
  if (typeof body.max_tokens !== 'number' || body.max_tokens < 1 || body.max_tokens > MAX_TOKENS_CAP) {
    return res.status(400).json({ error: 'max_tokens_invalid' });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'messages_invalid' });
  }
  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'request_too_large' });
  }

  // ── Usage limit: 30 messages per group per month ──────────────
  // Groups share a bucket: if the user is linked to a partner, use
  // the partner's UID as the group key (mirrors getDataUid() logic).
  const db = admin.database();
  const userSnap = await db.ref('users/' + uid + '/linkedTo').once('value');
  const groupKey = userSnap.val() || uid;

  const now = new Date();
  const yearMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const usageRef = db.ref('usage/' + groupKey + '/' + yearMonth);

  // Increment usage atomically before calling Anthropic so a slow/failed
  // request still counts, and parallel requests can't slip past the cap.
  const txn = await usageRef.transaction((current) => {
    if ((current || 0) >= MONTHLY_LIMIT) return; // abort — over the limit
    return (current || 0) + 1;
  });

  if (!txn.committed) {
    return res.status(429).json({
      error: 'monthly_limit_reached',
      limit: MONTHLY_LIMIT,
      used: txn.snapshot.val() || MONTHLY_LIMIT
    });
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
