/**
 * Firebase Cloud Functions for Maloca
 *
 * 1. anthropicMessages — HTTPS proxy for Anthropic API (requires Firebase ID token)
 * 2. createHousehold /
 *    joinHousehold     — up-to-4 household membership, admin-only writes
 *
 * calendarFeed, linkPartner and speak were removed on 2026-08-31 with the
 * web app: the first two served the web app's calendar feed and 2-person
 * couple linking (replaced by households), and speak was the Agent's
 * text-to-speech, dead since the voice conversation was dropped. All three
 * were undeployed with `firebase functions:delete` — removing the source
 * alone leaves a live function running.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // codes expire after 24h


/**
 * createHousehold / joinHousehold
 *
 * Mobile's household model (2026-08-24): up to 4 people sharing ONE
 * profile, replacing the web app's 2-person couple linking. A
 * household is its own node (households/{id}), not attached to one
 * person's account, so there's no natural "owner writes, partner reads"
 * shape to lean on — instead, EVERY membership change (creating a
 * household, joining one) happens here with admin rights, and the
 * database rules make households/{id}/members and /ownerUid entirely
 * unwritable by clients (no rule grants it, so RTDB's default-deny
 * applies) — only households/{id}/profile is client-writable, and only
 * to someone already listed as a member. The principle is the one the
 * web app's linking established: never trust the client with who may
 * read whose data.
 *
 * Invite codes themselves (householdInvites/{code}) ARE plain client
 * writes, same as the invites/ node above — a code just claims "I made
 * this, pointing at a household I'm actually in", which database.rules.json
 * verifies directly. It proves nothing about WHO may join; only
 * joinHousehold's own checks below do that.
 */
const MAX_HOUSEHOLD_SIZE = 4;

function requireAuth(req, res) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    res.status(401).json({ error: 'auth_required' });
    return null;
  }
  return admin.auth().verifyIdToken(idToken).catch(() => null);
}

function isValidProfile(data) {
  return !!data && Array.isArray(data.members) && data.members.length >= 1 &&
    data.members.every((m) => m && typeof m.name === 'string' && typeof m.workId === 'string');
}

exports.createHousehold = functions.region('europe-west1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const decoded = await requireAuth(req, res);
  if (!decoded) { if (!res.headersSent) res.status(401).json({ error: 'invalid_token' }); return; }
  const uid = decoded.uid;

  const profile = (req.body || {}).profile;
  if (!isValidProfile(profile)) {
    return res.status(400).json({ error: 'profile_invalid' });
  }

  const db = admin.database();
  const existing = (await db.ref('users/' + uid + '/householdId').once('value')).val();
  if (existing) {
    return res.status(409).json({ error: 'already_in_household' });
  }

  const hid = db.ref('households').push().key;
  await db.ref().update({
    ['households/' + hid]: {
      ownerUid: uid,
      members: { [uid]: true },
      profile: profile,
      createdAt: admin.database.ServerValue.TIMESTAMP,
    },
    ['users/' + uid + '/householdId']: hid,
  });

  return res.status(200).json({ householdId: hid });
});

exports.joinHousehold = functions.region('europe-west1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const decoded = await requireAuth(req, res);
  if (!decoded) { if (!res.headersSent) res.status(401).json({ error: 'invalid_token' }); return; }
  const uid = decoded.uid;

  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,8}$/.test(code)) {
    return res.status(400).json({ error: 'code_invalid' });
  }

  const db = admin.database();

  const alreadyIn = (await db.ref('users/' + uid + '/householdId').once('value')).val();
  if (alreadyIn) {
    return res.status(409).json({ error: 'already_in_household' });
  }

  const invite = (await db.ref('householdInvites/' + code).once('value')).val();
  if (!invite || !invite.householdId) {
    return res.status(404).json({ error: 'code_not_found' });
  }
  if (invite.createdAt && Date.now() - invite.createdAt > INVITE_TTL_MS) {
    await db.ref('householdInvites/' + code).remove();
    return res.status(410).json({ error: 'code_expired' });
  }

  const householdSnap = await db.ref('households/' + invite.householdId).once('value');
  const household = householdSnap.val();
  if (!household) {
    return res.status(404).json({ error: 'household_not_found' });
  }
  const members = household.members || {};
  if (members[uid]) {
    return res.status(409).json({ error: 'already_a_member' });
  }
  if (Object.keys(members).length >= MAX_HOUSEHOLD_SIZE) {
    return res.status(409).json({ error: 'household_full' });
  }

  await db.ref().update({
    ['households/' + invite.householdId + '/members/' + uid]: true,
    ['users/' + uid + '/householdId']: invite.householdId,
    ['householdInvites/' + code]: null,
  });

  return res.status(200).json({ householdId: invite.householdId, profile: household.profile || null });
});

// Raised from 50 (2026-08-26). 50 was set when one interaction meant one
// request; a ranking run is several, so a single Agent conversation could
// exhaust a whole month. Batches are larger and ranking now waits for
// preferences to settle, so a full onboarding is roughly 10 requests —
// this leaves room to redo it and to keep tweaking afterwards.
const MONTHLY_LIMIT = 200;

// Only the models Maloca actually uses may pass through the proxy,
// and max_tokens is capped at the largest value the app requests
// (8000 for area classification). Anything else is rejected so a
// stolen auth token can't run up the Anthropic bill.
const ALLOWED_MODELS = ['claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
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

  // ── Usage limit: MONTHLY_LIMIT requests per group per month ───
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
