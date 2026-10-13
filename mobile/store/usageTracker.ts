import { push, ref, serverTimestamp } from 'firebase/database';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { getRandomBytes } from 'expo-crypto';
import { db } from '../lib/firebase';
import { installIdFrom, updateLabel, usageRow, type UsageEvent, type UsageProps } from '../lib/usage';
import { useUsageStore } from './usageStore';

/**
 * Records one anonymous usage moment (see lib/usage.ts for what a row
 * may contain). Works signed out too: the funnel that matters most,
 * Get started to the first map, happens before anyone has an account.
 *
 * Fire and forget, like recordUnanswered: a lost count costs nothing, and
 * counting must never slow down or break what somebody is actually doing.
 *
 * Moments that arrive before the stored settings have loaded wait for
 * them, so an opted-out install never sends its app_open, and an existing
 * install never gets a second id.
 */
const waiting: [UsageEvent, UsageProps][] = [];

function send(event: UsageEvent, props: UsageProps) {
  const state = useUsageStore.getState();
  if (state.optedOut) return;
  let id = state.installId;
  if (!id) {
    id = installIdFrom(getRandomBytes(16));
    state.setInstallId(id);
  }
  const row = usageRow(event, props, id, Constants.expoConfig?.version ?? '0', updateLabel(Updates.updateId));
  if (!row) return;
  push(ref(db, 'usage'), { ...row, ts: serverTimestamp() }).catch(() => {});
}

export function track(event: UsageEvent, props: UsageProps = {}): void {
  try {
    if (useUsageStore.persist.hasHydrated()) {
      send(event, props);
      return;
    }
    if (waiting.length === 0) {
      useUsageStore.persist.onFinishHydration(() => {
        for (const [e, p] of waiting.splice(0)) send(e, p);
      });
    }
    if (waiting.length < 20) waiting.push([event, props]);
  } catch {
    // Never let counting get in the way.
  }
}
