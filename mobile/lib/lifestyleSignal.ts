import type { Lifestyle } from './types';
import { sanitiseLifestyle } from './profileMigration';

/**
 * Has this household actually told the Agent anything the app can USE?
 *
 * Counts recognised preferences, not keys. Counting keys meant a web-era
 * profile carrying only values this build doesn't understand —
 * `nightsOut: "occasional"`, `schoolsPriority: "notrelevant"`,
 * `safetyPriority: "somewhat"` — answered yes (2026-08-27). That was the
 * worst possible answer: it hid the "talk to the Agent" card, so the person
 * was never invited to fix it, AND it let the AI ranking run on
 * preferences the prompt then emitted zero lines for. Ranked areas with
 * nothing behind them, and no way to tell.
 *
 * Shares sanitiseLifestyle with the migration rather than keeping a second
 * copy of the enums — two lists would drift, and drifting apart is exactly
 * how this bug happened.
 */
export function hasLifestyleSignal(lifestyle: Lifestyle | undefined): boolean {
  return sanitiseLifestyle(lifestyle) !== undefined;
}
