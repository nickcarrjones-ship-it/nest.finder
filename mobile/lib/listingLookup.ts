import { auth } from './firebase';
import { NotSignedInError } from './ranking/anthropicClient';
import type { ListingDetails } from './viewings';

/**
 * Asks the Cloud Function to read a pasted Rightmove listing.
 *
 * The app deliberately does NOT parse the page itself — see
 * functions/lib/rightmoveListing.js for why that has to be somewhere it can
 * be fixed by a deploy rather than an App Store release.
 *
 * Every failure here is recoverable: whatever goes wrong, the household can
 * still type the address in. So these messages say what happened and leave
 * the next move to the sheet, which always offers manual entry.
 */

const LOOKUP_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/listingLookup';

export class ListingLookupError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ListingLookupError';
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  not_a_rightmove_property:
    "That doesn't look like a Rightmove property link — it should end in /properties/ and a number.",
  listing_not_found: "That listing has gone — it may have been taken down.",
  could_not_read_listing: "Couldn't read that listing. You can still add it by hand.",
  listing_timeout: 'Rightmove took too long to answer. Try again, or add it by hand.',
  monthly_limit_reached: "You've added a lot of listings this month. Add this one by hand.",
  globally_unavailable: 'Link reading is unavailable right now. You can still add it by hand.',
};

const FALLBACK = "Couldn't reach Rightmove. You can still add it by hand.";

export async function lookupListing(url: string): Promise<ListingDetails> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();

  const idToken = await user.getIdToken();

  let res: Response;
  try {
    res = await fetch(LOOKUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ url }),
    });
  } catch {
    // No connection at all — distinct from the server saying no.
    throw new ListingLookupError('offline', FALLBACK);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : 'unknown';
    throw new ListingLookupError(code, MESSAGES[code] ?? FALLBACK);
  }

  // The two fields a viewing cannot exist without. Checked here as well as
  // on the server, because a response that parsed but arrived incomplete
  // must not become a pin dropped at (0, 0) in the Atlantic.
  if (
    !data ||
    typeof data.address !== 'string' ||
    typeof data.lat !== 'number' ||
    typeof data.lng !== 'number'
  ) {
    throw new ListingLookupError('could_not_read_listing', MESSAGES.could_not_read_listing);
  }

  return data as ListingDetails;
}
