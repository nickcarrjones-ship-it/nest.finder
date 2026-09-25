import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors, fonts, radius, spacing } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useHouseholdStore } from '../store/householdStore';
import {
  addViewingVideo,
  deleteViewingVideo,
  scopeFor,
  useVideoUploads,
  videoUrl,
  watchViewingVideos,
  type PickedVideo,
  type ViewingVideo,
} from '../lib/viewingVideos';

/**
 * Videos of a viewing, at the foot of the scorecard (Nick, 2026-09-25).
 *
 * Two ways in, side by side: record one now, or add ones already filmed in
 * the phone's own camera — which is how most people actually film, with the
 * zoom and settings they already know, and which keeps a copy on the phone
 * whatever happens to the upload.
 *
 * 1080p either way. Picked 4K footage is converted on the phone before it
 * uploads (HEVC 1920x1080), which keeps a three-minute walkthrough around
 * 180MB instead of half a gigabyte.
 */
const EXPORT = ImagePicker.VideoExportPreset.HEVC_1920x1080;

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedVideo {
  return {
    uri: asset.uri,
    // The picker reports milliseconds.
    durationMs: typeof asset.duration === 'number' ? Math.round(asset.duration) : null,
    mimeType: asset.mimeType ?? null,
  };
}

function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function ViewingVideos({ viewingId }: { viewingId: string }) {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const householdId = useHouseholdStore((s) => s.householdId);
  const progress = useVideoUploads((s) => s.progress);
  const [videos, setVideos] = useState<ViewingVideo[]>([]);
  const [adding, setAdding] = useState(false);

  const scope = uid ? scopeFor(uid, householdId) : null;

  useEffect(() => {
    if (!scope) return;
    return watchViewingVideos(scope, viewingId, setVideos);
  }, [scope, viewingId]);

  if (!uid || !scope) {
    return <Text style={styles.hint}>Sign in to add videos of this viewing.</Text>;
  }

  async function queue(assets: ImagePicker.ImagePickerAsset[]) {
    setAdding(true);
    try {
      for (const asset of assets) {
        await addViewingVideo({ uid: uid as string, householdId, viewingId, video: toPicked(asset) });
      }
    } catch {
      Alert.alert("Couldn't add that video", 'Please try again.');
    } finally {
      setAdding(false);
    }
  }

  async function record() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access is off', 'Turn it on for Maloca in Settings to record a viewing.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
      videoExportPreset: EXPORT,
      videoMaxDuration: 0,
    });
    if (!result.canceled) await queue(result.assets);
  }

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      videoExportPreset: EXPORT,
    });
    if (!result.canceled) await queue(result.assets);
  }

  function confirmDelete(video: ViewingVideo) {
    Alert.alert('Delete this video?', 'It will be gone for everyone in your household.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteViewingVideo(scope as string, viewingId, video) },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>VIDEOS</Text>

      <View style={styles.buttons}>
        <Pressable style={styles.btn} onPress={record} disabled={adding} accessibilityRole="button">
          <Text style={styles.btnText}>Record video</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={pick} disabled={adding} accessibilityRole="button">
          <Text style={styles.btnText}>Add from camera roll</Text>
        </Pressable>
      </View>

      {adding && (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.teal} />
          <Text style={styles.hint}>Getting your video ready…</Text>
        </View>
      )}

      {videos.length === 0 && !adding && (
        <Text style={styles.hint}>
          Film a walkthrough and it uploads in the background - you can lock your phone.
        </Text>
      )}

      {videos.map((video) => (
        <View key={video.id} style={styles.video}>
          {video.status === 'ready' ? (
            <Player path={video.path} />
          ) : (
            <View style={styles.uploading}>
              <ActivityIndicator size="small" color={colors.teal} />
              <Text style={styles.uploadingText}>
                {progress[video.id] !== undefined
                  ? `Uploading… ${Math.round(progress[video.id] * 100)}%`
                  : video.createdBy === uid
                    ? 'Uploading… it will carry on in the background'
                    : 'Uploading from their phone…'}
              </Text>
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.metaText}>
              {[
                formatDuration(video.durationMs),
                video.createdBy === uid ? 'Added by you' : 'Added by your household',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Pressable onPress={() => confirmDelete(video)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.delete}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

/** One uploaded video, played with the phone's own controls and fullscreen. */
function Player({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    videoUrl(path)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [path]);

  if (failed) return <Text style={styles.hint}>Couldn't load this video.</Text>;
  if (!url) {
    return (
      <View style={styles.uploading}>
        <ActivityIndicator size="small" color={colors.teal} />
      </View>
    );
  }
  return <LoadedPlayer url={url} />;
}

function LoadedPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return (
    <VideoView
      player={player}
      style={styles.player}
      nativeControls
      fullscreenOptions={{ enable: true }}
      contentFit="contain"
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1.3, color: colors.inkGhost },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 10,
  },
  btnText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.teal },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkLt, lineHeight: 17 },
  video: { gap: 6 },
  player: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: colors.ink },
  uploading: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.creamMid,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  uploadingText: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMid, textAlign: 'center' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkLt },
  delete: { fontFamily: fonts.regular, fontSize: 12, color: colors.red },
});
