/**
 * The setup spine: every question asked between signing in and seeing the
 * map, in the order they are asked.
 *
 * ONE list, because the progress line, the setup screen and the Agent's
 * system prompt all need to agree on how many questions there are and
 * which is which. They used to agree only by coincidence: the card
 * counted "Question N of 5" while two more questions waited in a card
 * nobody had been told about, so the app announced the finish line and
 * then moved it (Nick, Rosie and Harriet's feedback, 2026-08-30).
 *
 * Three are typed, four are tapped (Nick, 2026-08-30). "Would you live in
 * Zone 1?" is a yes/no and "anywhere you'd rule out?" is usually "no" —
 * both were costing a full conversational turn to answer in one word. What
 * stays typed is the part that actually feeds the matching: the areas they
 * love, and what they love about them.
 */

export type StepKind = 'chat' | 'tap';

export interface SetupStep {
  id: string;
  kind: StepKind;
  /** The canonical wording. The Agent rewords the chat ones in its own
   *  voice; the tap ones are shown exactly as written here. */
  question: string;
}

/**
 * Typed, in order. The anchor comes FIRST (Nick, 2026-08-28): almost
 * nobody starts from nothing, and naming the area they already love is
 * what turns this from a generic ranking into "where else feels like
 * that" — the whole product.
 *
 * One and two are deliberately SEPARATE. Two people can both say
 * "Clapham" and mean opposite things — one means the Common, the other
 * the High Street on a Friday — and without asking which, every match is
 * generic.
 */
export const CHAT_STEPS: SetupStep[] = [
  {
    id: 'anchor',
    kind: 'chat',
    question: "First things first — tell me which areas you're already looking at or would love to move to?",
  },
  {
    id: 'anchorReason',
    kind: 'chat',
    question: 'What is it about there that you like?',
  },
  {
    id: 'evenings',
    kind: 'chat',
    question:
      'Talk me through your weekday evenings and weekends — are you out socialising, or getting comfy at home?',
  },
];

/**
 * Tapped, in order, after the conversation.
 *
 * `ruleOut` keeps an escape hatch to typing: the common answer is "nowhere",
 * which should cost one tap, but when there IS somewhere it is a real place
 * name the app has to parse. A pure button set would have made the rare
 * honest answer impossible to give.
 */
/**
 * "North or south of the river?" was removed on 2026-09-21 (Nick): the app
 * exists to broaden where somebody will look, and that question invites
 * them to narrow it before they have seen anything. The riverSide field
 * survives — the Agent can still record it if somebody volunteers it in
 * conversation — but nobody is asked.
 */
export const TAP_STEPS: SetupStep[] = [
  { id: 'ruleOut', kind: 'tap', question: 'Anywhere you’d rule out?' },
  { id: 'zone1', kind: 'tap', question: 'Would you live in Zone 1?' },
  { id: 'circle', kind: 'tap', question: 'Where do most of your people live?' },
  /**
   * Schools, as ONE question rather than two. "Do schools matter?" and
   * "primary or secondary?" are separate fields but a single decision, and
   * asking them in sequence would cost two taps to say the common thing.
   * Setup was deliberately trimmed once already (2026-08-30), so a new
   * question earns its place by collapsing two, not by adding one.
   *
   * The fee-paying follow-up is deliberately NOT in this list: it is only
   * asked of people who said schools matter, so it is an extra tap in the
   * sense setupProgress already understands rather than a fixed step
   * everyone walks through.
   */
  { id: 'schools', kind: 'tap', question: 'Do schools matter to you?' },
];

export const SETUP_STEPS: SetupStep[] = [...CHAT_STEPS, ...TAP_STEPS];

export const TOTAL_STEPS = SETUP_STEPS.length;

/**
 * How far along the whole setup someone is, 0 to 1 — what the progress
 * line fills to.
 *
 * Takes answers to the chat and taps separately because they are counted
 * differently: chat answers are messages the user sent (minus any
 * off-script follow-ups), taps are questions resolved. Clamped because the
 * model and the app can disagree about whether the conversation is over,
 * and a bar past 100% is worse than one that sits at it.
 */
export function setupProgress(chatAnswers: number, tapsDone: number, extraTaps = 0): number {
  return clampedDone(chatAnswers, tapsDone, extraTaps) / (TOTAL_STEPS + extraTaps);
}

/** Which step number (1-based) someone is being asked right now. */
export function currentStepNumber(chatAnswers: number, tapsDone: number, extraTaps = 0): number {
  return Math.min(clampedDone(chatAnswers, tapsDone, extraTaps) + 1, TOTAL_STEPS + extraTaps);
}

/**
 * `extraTaps` is the deferred clarifications — "which Clapham did you
 * mean?" — which only exist if someone named an ambiguous area, so the
 * total is not always seven.
 *
 * They are counted from the moment they are QUEUED, during the
 * conversation, rather than appearing at the end. Adding a step late is
 * exactly the moving finish line this rework set out to kill; adding it at
 * question one, while the bar is barely started, costs a percent or two
 * that nobody can see.
 */
function clampedDone(chatAnswers: number, tapsDone: number, extraTaps: number): number {
  const totalTaps = TAP_STEPS.length + extraTaps;
  const done = Math.min(Math.max(chatAnswers, 0), CHAT_STEPS.length)
    + Math.min(Math.max(tapsDone, 0), totalTaps);
  return Math.max(0, Math.min(done, TOTAL_STEPS + extraTaps));
}
