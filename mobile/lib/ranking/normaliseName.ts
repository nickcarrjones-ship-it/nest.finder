/**
 * One way of flattening a place name, shared by everything that matches on
 * one.
 *
 * It lives on its own because two things now depend on agreeing exactly:
 * the area resolver, and the place-label lookup it consults. If they
 * normalised differently, "St John's Wood" would find a label the resolver
 * could not, and the disagreement would show up as a pin in the wrong
 * place rather than as an error.
 */
export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/ & /g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}
