import { effectiveLovedOrder } from '../lovedAreas';
import type { Profile } from '../types';

/**
 * Things worth asking, built from this household's own areas.
 *
 * WHY. The Agent tab is a bare text box, and a bare text box is a promise
 * — it invites the questions people put to ChatGPT, and then answers a
 * narrow slice of them well and the rest badly (Nick, 2026-09-22: "users
 * will try and use the agent tab in a similar way to how they would use
 * Claude"). The app holds measured data about 570 London areas and almost
 * nothing about anything else, so the honest fix is not a better model, it
 * is telling people what this thing is good at.
 *
 * Every template here is a question the app answers WELL, from data:
 * per-type sold prices, named schools with verbatim Ofsted wording, a
 * comparison between two areas, a day out from real venues. Tapping one
 * is a question sent, so these double as the demand signal for what to
 * build next — what people tap is what they wanted.
 */

/** Four is a row and a bit on a phone. More reads as a menu. */
const MAX_SUGGESTIONS = 4;

/**
 * The areas this household actually cares about, best first.
 *
 * Loved areas lead because they named them; suggestions fill in behind so
 * somebody who has not loved anything yet still gets their own map back
 * rather than a worked example about Balham.
 */
function areasFor(profile: Profile, shortlist: string[]): string[] {
  const loved = effectiveLovedOrder(profile.areaCards, profile.lovedOrder);
  const seen = new Set(loved);
  return [...loved, ...shortlist.filter((n) => !seen.has(n))];
}

export function suggestedQuestions(profile: Profile, shortlist: string[] = []): string[] {
  const areas = areasFor(profile, shortlist);
  const [a, b] = areas;

  /**
   * With no areas at all, ask about the shortlist as a whole. These route
   * to the general answer, which reads their profile and their top ten —
   * so they work before anywhere has been named.
   */
  if (!a) {
    return [
      'Which of my areas is cheapest?',
      'Which should I visit first?',
      'What should I look at first?',
    ].slice(0, MAX_SUGGESTIONS);
  }

  const out = [
    // Leads with flats on purpose: it is the most common question a London
    // house-hunter asks, and until 2026-09-23 it was the one the app
    // refused while holding the answer.
    `What do flats cost in ${a}?`,
    `What are the schools like in ${b ?? a}?`,
    b ? `${a} or ${b}?` : `Plan a Sunday in ${a}`,
    b ? `Plan a Sunday in ${a}` : `Where are the gyms in ${a}?`,
  ];
  return out.slice(0, MAX_SUGGESTIONS);
}
