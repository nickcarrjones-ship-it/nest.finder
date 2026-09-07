import type { Profile } from './types';

/**
 * What the household has already told the Agent, in a form a card can show.
 *
 * The Agent tab used to reopen on "Which areas of London are you already
 * looking at, or do you love?" — a question they had answered days ago
 * (Nick, 2026-09-07). Asking it again is worse than merely redundant: it
 * suggests nothing was kept, which makes answering it a second time feel
 * pointless too.
 *
 * So the tab leads with what it remembers instead. This file turns the
 * profile back into readable English; it is deliberately pure and
 * display-only, so what the summary claims can be tested against what was
 * actually stored, rather than drifting into a second, prettier account of
 * the truth.
 */

export interface SummaryLine {
  /** Short label, e.g. "Evenings". */
  label: string;
  /** What they said, in their words where we have them. */
  value: string;
}

export interface ConversationSummary {
  loves: string[];
  hates: string[];
  /** Their own words about why — never paraphrased. */
  reason?: string;
  /** The tapped answers and the lifestyle read, one line each. Used where
   *  the pairing matters — notably the brief handed to the model. */
  lines: SummaryLine[];
  /**
   * The same answers as short standalone phrases, for showing as pills.
   *
   * Separate from `lines` because a label/value table reads as a form, and
   * this card is meant to read as recognition — "yes, that's us". A pill
   * saying "south of the river" needs no column heading to be understood,
   * where "The river: south of it" needs the pairing to make sense.
   */
  chips: string[];
  /** False when there is genuinely nothing to show yet. */
  hasAnything: boolean;
}

const STREET_VIBE: Record<string, string> = {
  buzzy: 'somewhere with a buzz',
  quiet: 'somewhere quiet',
  village: 'a village feel',
};

const NIGHTS_OUT: Record<string, string> = {
  frequent: 'out often',
  regular: 'out now and then',
  rarely: 'mostly nights in',
};

const GREEN_SPACE: Record<string, string> = {
  essential: 'green space is essential',
  nice: 'green space is a bonus',
  unimportant: 'not fussed about green space',
};

const CIRCLE: Record<string, string> = {
  N: 'north London', E: 'east London', S: 'south London', W: 'west London',
};

const PHASE: Record<string, string> = {
  primary: 'primary schools matter',
  secondary: 'secondary schools matter',
  both: 'primary and secondary both matter',
};

const SCHOOLS: Record<string, string> = {
  now: 'schools matter now',
  someday: 'schools matter one day',
  no: 'schools not a factor',
};

export function summariseConversation(profile: Profile | null): ConversationSummary {
  const cards = profile?.areaCards ?? {};
  const loves = Object.entries(cards).filter(([, v]) => v === 'love').map(([k]) => k).sort();
  const hates = Object.entries(cards).filter(([, v]) => v === 'hate').map(([k]) => k).sort();
  const ls = profile?.lifestyle;

  const lines: SummaryLine[] = [];

  // The evenings answer arrives as up to three separate fields, and reads
  // as one sentence rather than three near-identical rows.
  const evenings = [
    ls?.streetVibe && STREET_VIBE[ls.streetVibe],
    ls?.nightsOut && NIGHTS_OUT[ls.nightsOut],
    ls?.greenSpace && GREEN_SPACE[ls.greenSpace],
  ].filter((x): x is string => Boolean(x));
  if (evenings.length) lines.push({ label: 'Evenings', value: joinWords(evenings) });

  if (ls?.riverSide === 'north' || ls?.riverSide === 'south') {
    lines.push({ label: 'The river', value: `${ls.riverSide} of it` });
  } else if (ls?.riverSide === 'either') {
    lines.push({ label: 'The river', value: 'either side' });
  }

  if (typeof ls?.zone1Ok === 'boolean') {
    lines.push({ label: 'Zone 1', value: ls.zone1Ok ? 'happy there' : 'ruled out' });
  }

  if (ls?.socialCircle && CIRCLE[ls.socialCircle]) {
    lines.push({ label: 'Your people', value: `mostly in ${CIRCLE[ls.socialCircle]}` });
  }

  if (ls?.schoolsPriority && SCHOOLS[ls.schoolsPriority]) {
    lines.push({ label: 'Schools', value: SCHOOLS[ls.schoolsPriority] });
  }

  if (ls?.dealbreakers?.length) {
    lines.push({ label: 'Ruled out', value: joinWords(ls.dealbreakers) });
  }

  const reason = ls?.anchorReason?.trim() || undefined;

  const chips: string[] = [];
  if (ls?.streetVibe) chips.push(STREET_VIBE[ls.streetVibe]);
  if (ls?.nightsOut) chips.push(NIGHTS_OUT[ls.nightsOut]);
  if (ls?.greenSpace) chips.push(GREEN_SPACE[ls.greenSpace]);
  if (ls?.riverSide === 'north' || ls?.riverSide === 'south') chips.push(`${ls.riverSide} of the river`);
  if (ls?.riverSide === 'either') chips.push('either side of the river');
  if (typeof ls?.zone1Ok === 'boolean') chips.push(ls.zone1Ok ? 'Zone 1 is fine' : 'not Zone 1');
  if (ls?.socialCircle && CIRCLE[ls.socialCircle]) chips.push(`people in ${CIRCLE[ls.socialCircle]}`);
  if (ls?.schoolsPriority && SCHOOLS[ls.schoolsPriority]) chips.push(SCHOOLS[ls.schoolsPriority]);
  if (ls?.schoolPhase && PHASE[ls.schoolPhase]) chips.push(PHASE[ls.schoolPhase]);

  return {
    loves,
    hates,
    reason,
    lines,
    chips,
    hasAnything: loves.length > 0 || hates.length > 0 || Boolean(reason) || lines.length > 0,
  };
}

/** "a, b and c" — the way it would be said aloud, not "a, b, c". */
export function joinWords(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
