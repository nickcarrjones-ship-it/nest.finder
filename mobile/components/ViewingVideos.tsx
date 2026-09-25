import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const [open, setOpen] = useState<ViewingVideo | null>(null);
  // Squares sized in points from the grid's measured width: a percentage
  // width inside a wrapping row left the tile drawn at zero size.
  const [gridWidth, setGridWidth] = useState(0);
  const tileSize = gridWidth > 0 ? Math.floor((gridWidth - 4) / 3) : 0;

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

      {/* A camera-roll grid (Nick, 2026-09-25): square previews, three to
          a row, the length in the corner. Tap one and it plays full screen.
          The first version played inline in a letterboxed strip — the
          wrong shape for phone video, and too small to see anything in. */}
      {videos.length > 0 && (
        <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {videos.map((video) => (
            <Pressable
              key={video.id}
              style={[styles.tile, { width: tileSize, height: tileSize }]}
              onPress={() => video.status === 'ready' && setOpen(video)}
              onLongPress={() => confirmDelete(video)}
              accessibilityRole="button"
              accessibilityLabel={`Video, ${formatDuration(video.durationMs) ?? 'unknown length'}. Press and hold to delete.`}
            >
              {video.status === 'ready' ? (
                <Preview path={video.path} />
              ) : (
                <View style={styles.tileUploading}>
                  <ActivityIndicator size="small" color={colors.teal} />
                  <Text style={styles.tileUploadingText}>
                    {progress[video.id] !== undefined
                      ? `${Math.round(progress[video.id] * 100)}%`
                      : video.createdBy === uid ? 'Uploading' : 'On its way'}
                  </Text>
                </View>
              )}
              {video.status === 'ready' && formatDuration(video.durationMs) && (
                <View pointerEvents="none" style={styles.overlay}>
                  <Text style={styles.duration}>{formatDuration(video.durationMs)}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      <FullScreenVideo
        video={open}
        byYou={open?.createdBy === uid}
        onClose={() => setOpen(null)}
        onDelete={(video) => { setOpen(null); confirmDelete(video); }}
      />
    </View>
  );
}

/** The download link for a stored video, or null while it loads. */
function useVideoUrl(path: string | null): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!path) return;
    let cancelled = false;
    videoUrl(path)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [path]);
  return { url, failed };
}

/**
 * A square still of the video, like a camera-roll thumbnail: a muted,
 * paused player filling the square, which shows the opening frame. Done
 * this way rather than with generated thumbnails because those need
 * expo-image, a further native module, for something this already does.
 */
function Preview({ path }: { path: string }) {
  const { url, failed } = useVideoUrl(path);
  if (failed) return <View style={styles.tileBlank}><Text style={styles.tileUploadingText}>Unavailable</Text></View>;
  if (!url) return <View style={styles.tileBlank}><ActivityIndicator size="small" color={colors.cream} /></View>;
  return <PreviewPlayer url={url} />;
}

function PreviewPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.muted = true; });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="cover"
        // iOS offers Live Text on any paused frame with writing in it, which
        // put a button over the thumbnail and hid the length.
        allowsVideoFrameAnalysis={false}
      />
    </View>
  );
}

/** Full screen, playing straight away, with the phone's own controls. */
function FullScreenVideo({
  video, byYou, onClose, onDelete,
}: {
  video: ViewingVideo | null;
  byYou: boolean;
  onClose: () => void;
  onDelete: (video: ViewingVideo) => void;
}) {
  const insets = useSafeAreaInsets();
  const { url, failed } = useVideoUrl(video?.path ?? null);
  return (
    <Modal visible={video !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.full, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.fullBar}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close video">
            <Text style={styles.fullClose}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.fullStage}>
          {failed ? (
            <Text style={styles.fullText}>Couldn't load this video.</Text>
          ) : url ? (
            <FullPlayer url={url} />
          ) : (
            <ActivityIndicator size="large" color={colors.cream} />
          )}
        </View>
        {video && (
          <View style={styles.fullBar}>
            <Text style={styles.fullText}>
              {[formatDuration(video.durationMs), byYou ? 'Added by you' : 'Added by your household']
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Pressable onPress={() => onDelete(video)} hitSlop={12} accessibilityRole="button">
              <Text style={styles.fullDelete}>Delete</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

function FullPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
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
  // Three to a row with 2pt gutters, like Photos.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: radius.md, overflow: 'hidden' },
  tile: { backgroundColor: colors.ink, overflow: 'hidden' },
  tileBlank: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  tileUploading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.creamMid,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileUploadingText: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMid },
  // A full-size layer over the tile, so the length label is laid out above
  // the native video view rather than competing with it as a sibling.
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 5,
  },
  duration: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  full: { flex: 1, backgroundColor: '#000' },
  fullBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fullStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fullClose: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white },
  fullText: { fontFamily: fonts.regular, fontSize: 13, color: colors.cream },
  fullDelete: { fontFamily: fonts.regular, fontSize: 14, color: colors.red },
});
