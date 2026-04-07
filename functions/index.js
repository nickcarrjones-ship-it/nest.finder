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
  res.set('Content-Disposition', 'attachment; filename="maloca-viewings.ics"');
  return res.status(200).send(lines.join('\r\n'));
});

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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error('ANTHROPIC_API_KEY environment variable not set');
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
