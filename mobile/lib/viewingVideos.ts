import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, onValue, ref, remove, set, update } from 'firebase/database';
import { deleteObject, getDownloadURL, getMetadata, getStorage, ref as storageRef } from 'firebase/storage';
import { create } from 'zustand';
import { app, auth, db } from './firebase';

/**
 * Viewing videos (Nick, 2026-09-25): recorded in the app or picked from the
 * camera roll, uploaded to Firebase Storage, watched back on the scorecard
 * by anyone in the household.
 *
 * Two halves, deliberately apart:
 *   - the FILE, in Storage at {scope}/viewings/{viewingId}/videos/{id}.{ext},
 *     guarded by storage.rules;
 *   - its DETAILS (who, when, how long, finished uploading?), in the
 *     database at {scope}/viewingVideos/{viewingId}/{id}. Separate from the
 *     viewing record because that record is rewritten whole on every save,
 *     which could silently drop a video another member had just added.
 *
 * UPLOADS RUN IN THE BACKGROUND. They go through iOS's own background
 * transfer service (expo-file-system's BACKGROUND session) straight to the
 * Storage REST endpoint, not through the Firebase JS SDK, which only runs
 * while the app is open. So someone can pick their videos, lock the phone
 * and walk away. The one thing iOS will not survive is the person swiping
 * the app away — Apple cancels a force-quit app's transfers — so every
 * upload is also written to a local queue and retried on the next launch.
 * The video is copied into the app's own storage first, so a retry never
 * depends on the camera roll or a temp file still being there.
 */

export interface ViewingVideo {
  id: string;
  /** "0", "1" or "2" — the database key. Three fixed slots are how the
   *  3-per-property limit is enforced (database.rules.json). */
  slot: string;
  /** Where the file lives in Storage. */
  path: string;
  createdAt: number;
  createdBy: string;
  /** From the picker. Null if it did not say. */
  durationMs: number | null;
  sizeBytes: number | null;
  status: 'uploading' | 'ready';
}

interface PendingUpload {
  videoId: string;
  slot: string;
  viewingId: string;
  scope: string;
  storagePath: string;
  localUri: string;
  contentType: string;
}

/**
 * At most three videos per property (Nick, 2026-09-25). Enforced in the app
 * AND in database.rules.json. Rules cannot count, so each property has
 * three numbered slots and a video can only take an empty one. The app
 * writes those details before uploading anything, so a refused video never
 * uploads, and the rule is what covers two people adding at once.
 */
export const MAX_VIDEOS_PER_VIEWING = 3;
const SLOTS = ['0', '1', '2'];

const BUCKET = 'nestfinderv3.firebasestorage.app';
const PENDING_KEY = 'maloca.pendingVideoUploads.v1';
const LOCAL_DIR = `${FileSystem.documentDirectory}pending-videos/`;

const storage = getStorage(app);

/** households/{hid} or users/{uid} — the same split as every synced type. */
export function scopeFor(uid: string, householdId: string | null): string {
  return householdId ? `households/${householdId}` : `users/${uid}`;
}

function detailsPath(scope: string, viewingId: string): string {
  return `${scope}/viewingVideos/${viewingId}`;
}

function newVideoId(): string {
  return `vid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Upload progress on THIS phone, 0-1, for the scorecard to show. */
export const useVideoUploads = create<{
  progress: Record<string, number>;
  setProgress: (id: string, value: number | null) => void;
}>((setState) => ({
  progress: {},
  setProgress: (id, value) =>
    setState((s) => {
      const next = { ...s.progress };
      if (value === null) delete next[id];
      else next[id] = value;
      return { progress: next };
    }),
}));

async function readPending(): Promise<PendingUpload[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writePending(list: PendingUpload[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    // A lost queue entry only costs the automatic retry; the upload itself
    // may well still finish.
  }
}

async function dropPending(videoId: string): Promise<void> {
  await writePending((await readPending()).filter((p) => p.videoId !== videoId));
}

/** Uploads in flight in THIS app session, so a retry never doubles one. */
const inFlight = new Set<string>();

async function finish(p: PendingUpload, sizeBytes: number | null): Promise<void> {
  await update(ref(db, `${detailsPath(p.scope, p.viewingId)}/${p.slot}`), {
    status: 'ready',
    ...(sizeBytes !== null ? { sizeBytes } : {}),
  });
  await dropPending(p.videoId);
  await FileSystem.deleteAsync(p.localUri, { idempotent: true }).catch(() => {});
}

async function upload(p: PendingUpload): Promise<void> {
  if (inFlight.has(p.videoId)) return;
  const user = auth.currentUser;
  if (!user) return;
  inFlight.add(p.videoId);
  const { setProgress } = useVideoUploads.getState();
  try {
    const token = await user.getIdToken();
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(p.storagePath)}`;
    setProgress(p.videoId, 0);
    const task = FileSystem.createUploadTask(
      url,
      p.localUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
        headers: { Authorization: `Firebase ${token}`, 'Content-Type': p.contentType },
      },
      (e) => {
        if (e.totalBytesExpectedToSend > 0) {
          setProgress(p.videoId, e.totalBytesSent / e.totalBytesExpectedToSend);
        }
      },
    );
    const res = await task.uploadAsync();
    if (res && res.status >= 200 && res.status < 300) {
      let size: number | null = null;
      try {
        size = Number(JSON.parse(res.body).size) || null;
      } catch {
        // The upload worked; the size is a nicety.
      }
      await finish(p, size);
    }
    // A failure stays queued and is retried on the next launch.
  } catch {
    // Same: left in the queue for resumePendingUploads.
  } finally {
    inFlight.delete(p.videoId);
    setProgress(p.videoId, null);
  }
}

export interface PickedVideo {
  uri: string;
  durationMs: number | null;
  mimeType: string | null;
}

/**
 * Add one video to a viewing: copy it somewhere safe, record its details as
 * "uploading", queue it, and start the upload. Resolves once it is QUEUED —
 * the upload carries on in the background and the scorecard follows it.
 */
export async function addViewingVideo(opts: {
  uid: string;
  householdId: string | null;
  viewingId: string;
  video: PickedVideo;
}): Promise<void> {
  const scope = scopeFor(opts.uid, opts.householdId);
  const videoId = newVideoId();
  const ext = (opts.video.uri.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const contentType = opts.video.mimeType?.startsWith('video/')
    ? opts.video.mimeType
    : ext === 'mov' ? 'video/quicktime' : 'video/mp4';

  await FileSystem.makeDirectoryAsync(LOCAL_DIR, { intermediates: true }).catch(() => {});
  const localUri = `${LOCAL_DIR}${videoId}.${ext}`;
  await FileSystem.copyAsync({ from: opts.video.uri, to: localUri });

  // Take the first empty slot. The rules refuse a slot someone else has
  // just taken, so on a clash try the next; no slot left means full.
  const existing = (await get(ref(db, detailsPath(scope, opts.viewingId)))).val() ?? {};
  const free = SLOTS.filter((s) => !existing[s]);
  if (free.length === 0) throw new Error('viewing_full');

  const pending: PendingUpload = {
    videoId,
    slot: free[0],
    viewingId: opts.viewingId,
    scope,
    storagePath: `${scope}/viewings/${opts.viewingId}/videos/${videoId}.${ext}`,
    localUri,
    contentType,
  };

  const details: ViewingVideo = {
    id: videoId,
    slot: free[0],
    path: pending.storagePath,
    createdAt: Date.now(),
    createdBy: opts.uid,
    durationMs: opts.video.durationMs,
    sizeBytes: null,
    status: 'uploading',
  };
  let saved = false;
  for (const slot of free) {
    try {
      await set(ref(db, `${detailsPath(scope, opts.viewingId)}/${slot}`), { ...details, slot });
      pending.slot = slot;
      saved = true;
      break;
    } catch {
      // Taken a moment ago by someone else in the household.
    }
  }
  if (!saved) throw new Error('viewing_full');
  await writePending([...(await readPending()), pending]);
  void upload(pending);
}

/**
 * Pick up anything that did not finish — the app was swiped away, the
 * signal died, the token expired. Called once signed in. A file that is
 * already in Storage just gets marked ready; one whose local copy is gone
 * is dropped from the queue rather than retried forever.
 */
export async function resumePendingUploads(): Promise<void> {
  for (const p of await readPending()) {
    const info = await FileSystem.getInfoAsync(p.localUri).catch(() => null);
    try {
      await getMetadata(storageRef(storage, p.storagePath));
      await finish(p, null);
      continue;
    } catch {
      // Not in Storage yet.
    }
    if (!info?.exists) {
      await dropPending(p.videoId);
      continue;
    }
    void upload(p);
  }
}

/** Live list of a viewing's videos, oldest first. Returns the unsubscribe. */
export function watchViewingVideos(
  scope: string,
  viewingId: string,
  onChange: (videos: ViewingVideo[]) => void,
): () => void {
  return onValue(
    ref(db, detailsPath(scope, viewingId)),
    (snap) => {
      const data = snap.val();
      const list = data && typeof data === 'object'
        ? Object.entries(data as Record<string, ViewingVideo>).map(([slot, v]) => ({ ...v, slot }))
        : [];
      onChange(list.filter((v) => v && typeof v.path === 'string').sort((a, b) => a.createdAt - b.createdAt));
    },
    () => onChange([]),
  );
}

export function videoUrl(path: string): Promise<string> {
  return getDownloadURL(storageRef(storage, path));
}

export async function deleteViewingVideo(scope: string, viewingId: string, video: ViewingVideo): Promise<void> {
  await deleteObject(storageRef(storage, video.path)).catch(() => {});
  await remove(ref(db, `${detailsPath(scope, viewingId)}/${video.slot}`)).catch(() => {});
  await dropPending(video.id);
}

/** Every video on a viewing, for when the property itself is removed. */
export async function deleteAllViewingVideos(scope: string, viewingId: string): Promise<void> {
  try {
    const snap = await get(ref(db, detailsPath(scope, viewingId)));
    const data = snap.val();
    const list = data && typeof data === 'object' ? (Object.values(data) as ViewingVideo[]) : [];
    await Promise.all(list.map((v) => deleteObject(storageRef(storage, v.path)).catch(() => {})));
    await remove(ref(db, detailsPath(scope, viewingId)));
  } catch {
    // Best effort: a leftover file costs pennies, a crash here costs the
    // removal of the property someone asked to remove.
  }
}

/**
 * Make sure this sign-in's token carries the household tag storage.rules
 * checks (see functions/index.js householdClaim). Refreshes the token only
 * if the tag actually changed.
 */
export async function syncHouseholdClaim(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const token = await user.getIdToken();
    const res = await fetch('https://europe-west1-nestfinderv3.cloudfunctions.net/householdClaim', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (body && body.changed) await user.getIdToken(true);
  } catch {
    // Without it a household member cannot see videos until next sign-in;
    // nothing else depends on it.
  }
}
