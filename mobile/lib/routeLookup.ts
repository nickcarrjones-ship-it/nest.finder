import { auth } from './firebase';
import { NotSignedInError } from './ranking/anthropicClient';
import { isValidRoute, type Route } from './routes';

/** Fetching a route from the tflRoute function (functions/index.js). */

const ROUTE_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/tflRoute';

export class RouteUnavailableError extends Error {
  constructor(message = "I couldn't get the route from TfL just now. Try again in a minute.") {
    super(message);
    this.name = 'RouteUnavailableError';
  }
}

/** One route, from an area's station to a workplace. */
export async function fetchRoute(station: string, workId: string): Promise<Route> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();
  const idToken = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(ROUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ from: station, to: workId }),
    });
  } catch {
    throw new RouteUnavailableError("Couldn't reach Maloca. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error === 'monthly_limit_reached') {
      throw new RouteUnavailableError("I've looked up a lot of routes this month, so I can't check that one right now.");
    }
    throw new RouteUnavailableError();
  }
  if (!isValidRoute(data)) throw new RouteUnavailableError();
  return data;
}
