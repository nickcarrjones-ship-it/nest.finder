/**
 * The clarifying question, composed locally.
 *
 * It used to be asked by the model: the app detected an ambiguous place
 * name, injected a note, and waited for a reply. That was wrong twice over.
 *
 * SLOW — it put an Anthropic round trip in front of a question we already
 * knew the words to. Nick, on device: "It's also incredibly slow between
 * answer and reply" (2026-08-28).
 *
 * AND OUT OF ORDER — back when the card ran ahead of the network, the
 * model's clarification landed after question two had already been asked,
 * so the sequence came out as question two, the clarification, then
 * question two again.
 *
 * Both vanish if the app simply asks. The clarification is as knowable as
 * the five scripted questions, so it is written from local text with no
 * network wait at all. The model still sees the exchange and keeps
 * extracting the profile from it — it just is not on the critical path for
 * something we could say ourselves.
 */

/**
 * How a Londoner would name the choice, rather than reading out stations.
 * The shared word can sit at either end — "Clapham Common" but "North
 * Ealing" — so both are stripped.
 */
function shorten(name: string, stem: string): string {
  const rest = name
    .replace(new RegExp(`^${stem}\\s+`, 'i'), '')
    .replace(new RegExp(`\\s+${stem}$`, 'i'), '')
    .trim();
  return rest || name;
}

/** More than three options is a list nobody can hold in their head. */
const MAX_SPOKEN_OPTIONS = 3;

/** The stem they actually said — the word common to every option. */
function stemOf(options: string[]): string {
  const words = options.map((o) => o.toLowerCase().split(' '));
  const first = words[0] ?? [];
  for (const w of first) {
    if (words.every((parts) => parts.includes(w))) {
      const i = first.indexOf(w);
      return options[0].split(' ')[i];
    }
  }
  return '';
}

/**
 * "Clapham — do you mean the Common, the High Street, or the Junction?"
 *
 * Deliberately offers "or all of it": the engine handles several anchors,
 * and "both" is a real answer people give.
 */
export function clarifyQuestion(options: string[]): string {
  // One match is the risky case, not the safe one: "Liverpool" resolves to
  // Liverpool Street, so we check rather than assume.
  if (options.length === 1) {
    return `When you say that — do you mean ${options[0]} here in London?`;
  }

  const stem = stemOf(options);
  const parts = options.map((o) => shorten(o, stem)).filter(Boolean);
  if (!stem || parts.length < 2) {
    return `Which part did you mean — ${options.slice(0, 2).join(' or ')}?`;
  }

  const shown = parts.slice(0, MAX_SPOKEN_OPTIONS);
  const more = parts.length > MAX_SPOKEN_OPTIONS;
  const listed =
    shown.length === 2
      ? `${shown[0]} or ${shown[1]}`
      : `${shown.slice(0, -1).join(', ')}, or ${shown[shown.length - 1]}`;
  // "Or all of it" matters: the engine handles several anchors, and "both"
  // is a real answer people give.
  return more
    ? `${stem}'s a big place — whereabouts? ${listed}? Or all of it?`
    : `${stem}'s a big place — are you thinking ${listed}? Or all of it?`;
}
