/**
 * Firebase Cloud Functions for Maloca
 *
 * 1. anthropicMessages — HTTPS proxy for Anthropic API (requires Firebase ID token)
 * 2. createHousehold /
 *    joinHousehold     — up-to-4 household membership, admin-only writes
 * 3. placesSearch      — Google Places, behind a global monthly ceiling
 * 4. listingLookup     — reads a pasted Rightmove listing (see lib/rightmoveListing.js)
 * 5. calendarLink /
 *    calendarFeed      — viewings as a subscribable calendar (see lib/calendarFeed.js)
 *
 * linkPartner and speak were removed on 2026-08-31 with the web app: the
 * first served 2-person couple linking (replaced by households) and speak
 * was the Agent's text-to-speech, dead since the voice conversation was
 * dropped. Both were undeployed with `firebase functions:delete` — removing
 * the source alone leaves a live function running. calendarFeed went the
 * same way and is BACK as of 2026-09-12, rewritten rather than restored:
 * the web app's version had no timezone, no escaping and no DTSTAMP.
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

/**
 * The household this account is ACTUALLY in, or null.
 *
 * Reads the pointer at users/{uid}/householdId and then VERIFIES it against
 * households/{hid}/members/{uid}, which is the authoritative record —
 * written only by createHousehold and joinHousehold below, and unwritable
 * by any client because no rule in database.rules.json grants it.
 *
 * The verification is the whole point. Everything in this file runs with
 * admin rights, which bypass the database rules completely, so a function
 * that reads a client-writable field and acts on it has no rules
 * protecting it at all — it has only this check. Three places got that
 * wrong and each was a real hole (2026-09-12):
 *
 *   - the calendar feed resolved whose viewings to serve from the bare
 *     pointer, so setting your own householdId to someone else's handed
 *     you their addresses and the times they would be standing outside
 *     them;
 *   - the AI proxy and the listing lookup grouped their monthly quotas by
 *     users/{uid}/linkedTo, so writing a fresh random string to your own
 *     account bought a fresh allowance, as often as you liked, billed to
 *     the owner of the Anthropic key.
 *
 * linkedTo is gone with them: it was the web app's two-person linking,
 * which households replaced, and nothing in the mobile app has ever read
 * or written it.
 */
async function verifiedHouseholdId(db, uid) {
  const hid = (await db.ref('users/' + uid + '/householdId').once('value')).val();
  if (typeof hid !== 'string' || !hid) return null;
  const member = await db.ref('households/' + hid + '/members/' + uid).once('value');
  return member.val() === true ? hid : null;
}

/**
 * The bucket a quota counts against: the household when there is a real
 * one, otherwise the account itself. Never a value the client chose.
 */
async function quotaKeyFor(db, uid) {
  return (await verifiedHouseholdId(db, uid)) || uid;
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
  // A household shares one bucket, because they share one search. The key
  // is VERIFIED membership, never a pointer the client can write — see
  // verifiedHouseholdId for what that used to cost.
  const db = admin.database();
  const groupKey = await quotaKeyFor(db, uid);

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

    /**
     * Anthropic's own error object was reaching the app verbatim — so when
     * OUR account ran out of credit, a user saw "Your credit balance is
     * too low... go to Plans & Billing" (Nick's screenshot, 2026-09-11): a
     * message about an Anthropic Console account they have never seen and
     * could not act on even if they understood it.
     *
     * Our OWN rejections (model_not_allowed, monthly_limit_reached, etc.)
     * are a plain string at data.error and are already written to be
     * shown, so they pass through untouched. Anthropic's are an OBJECT —
     * that shape difference is what tells the two apart here. The real
     * detail still goes to the function logs, just never to a phone.
     */
    if (!r.ok && data && typeof data.error === 'object' && data.error !== null) {
      console.error('Anthropic upstream error:', r.status, JSON.stringify(data.error));
      return res.status(r.status).json({
        error: {
          type: 'upstream_unavailable',
          message: "The Agent is taking a breather — please try again shortly.",
        },
      });
    }

    return res.status(r.status).json(data);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Upstream request failed' });
  }
});

/**
 * Places search, proxied — the API key never reaches a phone, and the
 * global spend is capped in one place.
 *
 * The cap is the point, not an afterthought. Google withdrew the $200
 * monthly credit on 28 February 2025 and replaced it with per-SKU
 * allowances: 10k Essentials, 5k Pro and only 1k ENTERPRISE, which is the
 * tier any request asking for `rating` falls into. A request bills at the
 * highest tier of any field in its mask, so one careless field turns a
 * 5,000-call budget into a 1,000-call one. See
 * mobile/docs/explore-itinerary.md.
 *
 * PLACES_MONTHLY_LIMIT is therefore a GLOBAL ceiling across every user, not
 * a per-household one like MONTHLY_LIMIT above. A per-user cap protects a
 * user from themselves; only a global cap protects the bill from a hundred
 * users behaving perfectly normally.
 */
const PLACES_MONTHLY_LIMIT = 900; // under Google's 1,000 free Enterprise calls

exports.placesSearch = functions.region('europe-west1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authorization required' });

  try {
    await admin.auth().verifyIdToken(token);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) {
    console.error('GOOGLE_PLACES_API_KEY environment variable not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { query, lat, lng, radius, withRating } = req.body || {};
  if (typeof query !== 'string' || !query.trim() || query.length > 120) {
    return res.status(400).json({ error: 'query required' });
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  /**
   * The field mask decides the price, so it is built HERE rather than taken
   * from the client. A phone asking for `rating` on every request would
   * quietly move the whole app from the 5,000-call tier to the 1,000-call
   * one, and nothing on the device would show it happening.
   */
  const fields = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
  ];
  if (withRating === true) {
    fields.push('places.rating', 'places.userRatingCount');
  }

  const db = admin.database();
  const now = new Date();
  const yearMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  // Enterprise-tier calls are counted separately, because they are the ones
  // with only 1,000 free a month.
  const bucket = withRating === true ? 'enterprise' : 'pro';
  const usageRef = db.ref('placesUsage/' + yearMonth + '/' + bucket);

  const limit = withRating === true ? PLACES_MONTHLY_LIMIT : 4500;
  const txn = await usageRef.transaction((current) => {
    if ((current || 0) >= limit) return; // abort — over the ceiling
    return (current || 0) + 1;
  });

  if (!txn.committed) {
    return res.status(429).json({ error: 'places_monthly_limit_reached', limit });
  }

  try {
    const upstream = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': placesKey,
        'X-Goog-FieldMask': fields.join(','),
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 5,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: typeof radius === 'number' ? Math.min(radius, 3000) : 1200,
          },
        },
      }),
    });

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error('Places upstream error', upstream.status, data);
      return res.status(502).json({ error: 'Upstream request failed' });
    }
    return res.status(200).json(data);
  } catch (e) {
    console.error('Places request failed', e);
    return res.status(502).json({ error: 'Upstream request failed' });
  }
});

/**
 * Read a Rightmove listing a household has pasted in.
 *
 * The parsing lives in lib/rightmoveListing.js — see that file for why it
 * is here on the server rather than in the app, and for the SSRF reasoning
 * behind never fetching the URL the user actually typed.
 *
 * TWO caps, and they protect different things. The per-household one is
 * the usual "no single household can run away with it". The GLOBAL one
 * exists because every request here lands on someone else's servers:
 * Rightmove's terms do not invite automated access, and the mitigation
 * that matters is that this only ever fires on a deliberate paste, one
 * listing at a time, with a ceiling across all users that keeps the
 * footprint closer to a person browsing than to a crawler. If that ceiling
 * is ever actually reached, the answer is a conversation with Rightmove
 * about a feed, not a bigger number here.
 */
const LISTING_MONTHLY_LIMIT = 200; // per household
const LISTING_GLOBAL_MONTHLY_LIMIT = 5000; // across everyone
const LISTING_FETCH_TIMEOUT_MS = 12000;
const LISTING_MAX_BYTES = 4 * 1024 * 1024;

const { rightmovePropertyUrl, parseRightmoveListing, ListingParseError } = require('./lib/rightmoveListing');

exports.listingLookup = functions.region('europe-west1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authorization required' });

  let uid;
  try {
    uid = (await admin.auth().verifyIdToken(token)).uid;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Rebuilt from the id, never the pasted string. Anything that is not a
  // Rightmove property page stops here, before any network call.
  const target = rightmovePropertyUrl((req.body || {}).url);
  if (!target) return res.status(400).json({ error: 'not_a_rightmove_property' });

  const db = admin.database();
  const now = new Date();
  const yearMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  const groupKey = await quotaKeyFor(db, uid);

  const householdTxn = await db
    .ref('listingUsage/' + yearMonth + '/households/' + groupKey)
    .transaction((current) => {
      if ((current || 0) >= LISTING_MONTHLY_LIMIT) return; // abort
      return (current || 0) + 1;
    });
  if (!householdTxn.committed) {
    return res.status(429).json({ error: 'monthly_limit_reached', limit: LISTING_MONTHLY_LIMIT });
  }

  const globalTxn = await db.ref('listingUsage/' + yearMonth + '/total').transaction((current) => {
    if ((current || 0) >= LISTING_GLOBAL_MONTHLY_LIMIT) return; // abort
    return (current || 0) + 1;
  });
  if (!globalTxn.committed) {
    console.error('Listing lookups hit the global monthly ceiling');
    return res.status(429).json({ error: 'globally_unavailable' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LISTING_FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(target.url, {
      signal: controller.signal,
      headers: {
        // Says what this actually is, and how to reach whoever runs it.
        //
        // It used to claim to be Safari on an iPhone, on the reasoning that
        // a real person was looking at this exact page. The reasoning was
        // sound and the header still undercut it: this fetches ONE page a
        // person pasted, which is the same thing WhatsApp, Slack and
        // iMessage do with every link shared — and every one of those
        // identifies itself (facebookexternalhit, Slackbot-LinkExpanding,
        // WhatsApp). Wearing a browser's name is what makes an ordinary,
        // defensible request look like something hiding.
        //
        // The cost is real and accepted: naming ourselves makes us easier
        // to block. Being blocked while behaving honestly is a better place
        // to stand than being blocked while pretending to be a phone, and
        // the paste flow already degrades to typing it in by hand.
        'User-Agent': 'Maloca/1.0 (link preview on a user\'s request; +https://maloca.homes)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });

    if (upstream.status === 404 || upstream.status === 410) {
      return res.status(404).json({ error: 'listing_not_found' });
    }
    if (!upstream.ok) {
      console.error('Rightmove responded', upstream.status, 'for', target.listingId);
      return res.status(502).json({ error: 'listing_unavailable' });
    }

    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > LISTING_MAX_BYTES) {
      console.error('Listing page too large:', declared);
      return res.status(502).json({ error: 'listing_unavailable' });
    }

    const html = await upstream.text();
    if (html.length > LISTING_MAX_BYTES) {
      console.error('Listing page too large after read:', html.length);
      return res.status(502).json({ error: 'listing_unavailable' });
    }

    const listing = parseRightmoveListing(html);
    return res.status(200).json({ ...listing, listingId: target.listingId, url: target.url });
  } catch (e) {
    // A parse failure is the interesting one: it means Rightmove changed
    // something and this needs a look. Logged loudly and distinctly, while
    // the caller gets the same "type it in yourself" either way.
    if (e instanceof ListingParseError) {
      console.error('LISTING PARSE FAILED — format may have changed:', e.message, target.url);
      return res.status(422).json({ error: 'could_not_read_listing' });
    }
    if (e && e.name === 'AbortError') {
      console.error('Listing fetch timed out:', target.url);
      return res.status(504).json({ error: 'listing_timeout' });
    }
    console.error('Listing fetch failed', e);
    return res.status(502).json({ error: 'listing_unavailable' });
  } finally {
    clearTimeout(timeout);
  }
});


/**
 * calendarLink / calendarFeed — viewings in the calendar both people
 * already look at.
 *
 * The shape of this is the whole design decision, so it is worth stating.
 * Maloca does NOT write into anyone's device calendar: that needs a
 * permission prompt, a native module, a rebuild and store paperwork on two
 * platforms, and it only ever reaches the one phone that granted it.
 * Instead each person gets one private web address, subscribes to it once,
 * and their calendar app collects the viewings from then on — no
 * permissions, nothing installed, and it works on every device they own.
 *
 * The cost of that is the thing to be honest about, in both directions:
 *
 *   - REFRESH IS NOT OURS TO CONTROL. Apple and Google decide how often a
 *     subscribed calendar is re-read, and it can be hours. A viewing booked
 *     shortly before it happens may not arrive in time. The feed asks for
 *     hourly (REFRESH-INTERVAL) and is routinely ignored.
 *   - THE URL IS THE PASSWORD. A calendar app cannot sign in, so the token
 *     in the address is the only thing standing between a stranger and a
 *     list of where this household will be standing and when. That is
 *     inherent to subscribed calendars, not a shortcut taken here — which
 *     is exactly why regenerating (below) exists from the first day rather
 *     than being added after something goes wrong.
 *
 * Tokens live at calendarTokens/{token} -> { uid }, a node NO rule grants
 * access to, so RTDB's default-deny makes it server-only. A client can
 * write users/{uid}/calendarToken (its own node), but forging one there
 * gains nothing: the feed resolves the other way round, token to uid, and
 * only these functions ever write that map.
 *
 * The household is resolved FRESH on every fetch rather than stored with
 * the token, so joining or leaving a household moves the feed with you
 * instead of leaving it pointed at the old one.
 */
const crypto = require('crypto');

/** 32 hex characters from a real random source — the same standard the
 *  invite codes hold to, but long enough that it is never guessed rather
 *  than merely long enough to be typed. */
function newCalendarToken() {
  return crypto.randomBytes(16).toString('hex');
}

const { buildCalendar } = require('./lib/calendarFeed');

/** Where this account's viewings actually live — the household's if they
 *  are in one, their own if not. Mirrors mobile/lib/viewingSync.ts exactly;
 *  the two must never disagree or the feed shows the wrong list. */
async function viewingsPathFor(db, uid) {
  const householdId = await verifiedHouseholdId(db, uid);
  return householdId
    ? 'households/' + householdId + '/viewings'
    : 'users/' + uid + '/viewings';
}

/**
 * Hands the signed-in app its subscribe URL, minting one the first time.
 *
 * POST { regenerate?: true } — regenerating deletes the old token, which
 * is what makes the link revocable: anyone still holding the old address
 * gets a 404 from that moment, including a calendar app that has been
 * quietly re-reading it for months.
 */
exports.calendarLink = functions.region('europe-west1').https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const decoded = await requireAuth(req, res);
  if (decoded === null) return;
  if (!decoded) return res.status(401).json({ error: 'invalid_token' });
  const uid = decoded.uid;

  const db = admin.database();
  const existingSnap = await db.ref('users/' + uid + '/calendarToken').once('value');
  const existing = existingSnap.val();
  const regenerate = !!(req.body || {}).regenerate;

  let token = typeof existing === 'string' && existing.length === 32 ? existing : null;
  if (!token || regenerate) {
    const next = newCalendarToken();
    const updates = {};
    // Old token dies in the same write that creates the new one, so there
    // is never a moment where both addresses work.
    if (token) updates['calendarTokens/' + token] = null;
    updates['calendarTokens/' + next] = { uid: uid, createdAt: admin.database.ServerValue.TIMESTAMP };
    updates['users/' + uid + '/calendarToken'] = next;
    await db.ref().update(updates);
    token = next;
  }

  const base = 'https://' + req.hostname + '/calendarFeed?token=' + token;
  return res.status(200).json({
    url: base,
    // What Apple and Google actually accept in "add subscription". Same
    // address, different scheme — webcal:// is what makes a phone open the
    // calendar app instead of downloading a file it then does nothing with.
    webcalUrl: base.replace(/^https:/, 'webcal:'),
    regenerated: !token || regenerate,
  });
});

/**
 * The feed itself. Unauthenticated BY NECESSITY — a calendar app has no
 * way to sign in — and gated entirely on the token, which is why the
 * token is treated as a credential everywhere above.
 */
exports.calendarFeed = functions.region('europe-west1').https.onRequest(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method not allowed');
  }

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  // Checked for shape before it is used as a path segment, so a token
  // carrying a slash or a dot can never reach into another node.
  if (!/^[0-9a-f]{32}$/.test(token)) return res.status(404).send('Not found');

  const db = admin.database();
  const tokenSnap = await db.ref('calendarTokens/' + token).once('value');
  const owner = tokenSnap.val();
  if (!owner || typeof owner.uid !== 'string') return res.status(404).send('Not found');

  const path = await viewingsPathFor(db, owner.uid);
  const snap = await db.ref(path).once('value');
  const data = snap.val();
  const viewings = data && typeof data === 'object' ? Object.values(data) : [];

  const ics = buildCalendar(viewings, { name: 'Maloca viewings' });

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="maloca-viewings.ics"');
  // Never cached by anything in between. A shared cache holding a
  // household's addresses is the one thing worse than the URL leaking.
  res.set('Cache-Control', 'private, max-age=0, no-store');
  return res.status(200).send(ics);
});
