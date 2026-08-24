import type { Lifestyle } from './types';

/**
 * Whether the Agent chat has actually produced anything yet. Shared between
 * usePicks (gates the AI ranking itself) and the Map screen (gates the
 * prominent "talk to the Agent" call-to-action vs. the small launcher) so
 * the two can't drift into disagreeing about what "engaged" means.
 */
export function hasLifestyleSignal(lifestyle: Lifestyle | undefined): boolean {
  return Boolean(lifestyle && Object.keys(lifestyle).length > 0);
}
