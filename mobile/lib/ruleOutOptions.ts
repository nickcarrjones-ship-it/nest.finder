import stations from '../assets/data/stations.json';

/**
 * The places somebody can pick from when saying where they will NOT live.
 *
 * STATION NAMES, not the neighbourhood identities in area-identities.json.
 * That file's values are ward names — "Beckenham Town & Copers Cope",
 * "Cathall", "Bruce Castle", "Courtfield" — and a ward name is raw input,
 * never something to put in front of a person: nobody in London says they
 * would not live in Cathall. Station names are the names people actually
 * use for places, and they are what this app has always named areas by.
 *
 * Nothing is lost by choosing them: lib/ranking/ruleOuts.ts matches a
 * rule-out against a candidate's own name AND against every station it is
 * built from, so ruling out "Canary Wharf" removes the neighbourhood
 * whatever the ward happens to be called. The free-text box beside the
 * picker covers the rest — "anywhere in east London" was never going to be
 * a row in a list.
 */
export const RULE_OUT_OPTIONS: string[] = [...new Set(stations.map((s) => s.name))].sort((a, b) =>
  a.localeCompare(b),
);

/**
 * Up to `limit` matches for what has been typed, the ones that START with
 * it first.
 *
 * The same rule the workplace picker uses, and for the same reason: typing
 * "clap" should lead with Clapham Common, not with whatever alphabetically
 * happens to contain those four letters. Already-chosen names are excluded
 * rather than shown as selected — a list of things you can still pick is
 * easier to read than a list where some rows do nothing.
 */
export function matchRuleOutOptions(query: string, chosen: string[], limit = 6): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const taken = new Set(chosen.map((c) => c.toLowerCase()));
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of RULE_OUT_OPTIONS) {
    if (taken.has(name.toLowerCase())) continue;
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) starts.push(name);
    else if (lower.includes(q)) contains.push(name);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * The free-text box, split into the separate places it names.
 *
 * Kept from the old typed-only version of this question, so somebody who
 * writes "Croydon, Barking" there still gets those hard-removed rather
 * than merely mentioned to the model. A phrase that is not a place —
 * "anywhere in east London" — simply matches nothing downstream, because
 * ruleOuts.ts matches on whole words against real area names.
 */
export function splitFreeText(text: string): string[] {
  return text
    .split(/[,\n]|\band\b/)
    .map((s) => s.trim())
    .filter(Boolean);
}
