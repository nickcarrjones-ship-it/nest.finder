// Separate from commuteSettings.ts on purpose: this pulls in loadData,
// which imports expo-file-system, and expo-file-system cannot be imported
// even transitively by anything a plain Node test touches (Nick's tests
// broke the moment commuteSettings.ts gained that import — see the fix on
// 2026-09-11). commuteSettings.ts stays pure and testable; this file is
// RN-only, same as the store files that call it.
import type { JourneyTimes, Profile } from './types';
import { loadData } from './dataSource';
import { COMMUTE_DEFAULT_MINS, commuteMinsNeededFor, roundUpToCommuteOption } from './commuteSettings';

/**
 * Called the moment setup finishes (Nick, 2026-09-11): if someone spent the
 * conversation with the commute slider wherever it happened to be left and
 * then named a loved area that needs longer, the map they land on would
 * silently exclude the very area they just said they loved. Returns the
 * limit to widen to, or null when the current one already covers every
 * loved area — never narrows it, since a shorter commute than someone
 * already chose is never the "correct" answer to load over them.
 */
export async function widenCommuteForLovedAreas(profile: Profile): Promise<number | null> {
  const loved = Object.entries(profile.areaCards ?? {})
    .filter(([, verdict]) => verdict === 'love')
    .map(([name]) => name);
  if (!loved.length || !profile.members?.length) return null;

  const journeyTimes = await loadData<JourneyTimes>('journey-times.json');
  const needed = commuteMinsNeededFor(loved, profile.members, journeyTimes);
  if (needed === undefined) return null;

  const current = profile.maxCommuteMins ?? COMMUTE_DEFAULT_MINS;
  if (needed <= current) return null;
  return roundUpToCommuteOption(needed);
}
