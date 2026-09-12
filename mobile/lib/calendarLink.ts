import { auth } from './firebase';
import { NotSignedInError } from './ranking/anthropicClient';

/**
 * The household's subscribable calendar link.
 *
 * Maloca does not write into anyone's device calendar — see the long note
 * in functions/index.js for why that trade was made. What this fetches is
 * one private web address; a calendar app subscribed to it collects the
 * viewings from then on, on every device that person owns.
 *
 * Two things about it are worth repeating wherever it is shown:
 *
 *  - HOW OFTEN it refreshes is Apple's and Google's decision, not ours.
 *    A viewing booked shortly before it happens may not arrive in time.
 *  - THE LINK IS THE PASSWORD. A calendar app cannot sign in, so anyone
 *    holding the address can read where this household will be and when.
 *    That is why `regenerate` exists, and why it is offered plainly rather
 *    than buried.
 */

const LINK_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/calendarLink';

export interface CalendarLink {
  /** For sending to someone, and for a calendar app that wants https. */
  url: string;
  /** Same address, webcal:// — what makes a phone open its calendar app
   *  rather than downloading a file and doing nothing with it. */
  webcalUrl: string;
}

export class CalendarLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarLinkError';
  }
}

const FAILED = "Couldn't get your calendar link. Try again in a moment.";

export async function getCalendarLink(
  opts: { regenerate?: boolean } = {},
): Promise<CalendarLink> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();

  const idToken = await user.getIdToken();

  let res: Response;
  try {
    res = await fetch(LINK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ regenerate: !!opts.regenerate }),
    });
  } catch {
    throw new CalendarLinkError('No connection. Try again when you’re back online.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || typeof data?.url !== 'string' || typeof data?.webcalUrl !== 'string') {
    throw new CalendarLinkError(FAILED);
  }
  return { url: data.url, webcalUrl: data.webcalUrl };
}
