import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useMustHaves } from '../hooks/useMustHaves';
import { MAX_MUST_HAVES, weightsFor, type MustHave } from '../lib/mustHaves';

/**
 * The list a household scores every property against.
 *
 * The ORDER IS THE INPUT. There is no importance slider and no 1-to-5
 * rating, because ranking a list is something people can do and agree on,
 * while putting numbers on their own preferences is something they do
 * inconsistently and then argue about. Top counts most; the screen says so
 * in a sentence rather than making anyone infer it.
 *
 * Reordering is by DRAGGING a row by its handle (Nick, 2026-10-06: "not
 * just via small arrows"). The drag is a gesture-handler Pan, not React
 * Native's own PanResponder: this screen is an iOS sheet, and the sheet's
 * swipe-to-close gesture cancelled a PanResponder drag after a few points
 * every time (tried first, logged, 2026-10-06). Gesture-handler gestures
 * take part in iOS's own arbitration, so the handle wins. The library was
 * already in the native build, so this still ships over the air. The
 * handle is also "adjustable" for VoiceOver, so a screen reader can still
 * move a row up or down with a swipe, which no drag can offer.
 */
export default function MustHavesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, add, rename, remove, move, moveTo } = useMustHaves();
  const [draft, setDraft] = useState('');

  // ── Dragging ────────────────────────────────────────────────────────
  /**
   * NOTHING here is React state, on purpose. Re-rendering the list while a
   * finger is down rebuilt the native view under it, and iOS cancelled the
   * touch: the row lifted and then froze (logged, 2026-10-06). So the
   * lift, the follow and the others making room are all Animated values
   * set directly, and the list only re-renders once, after letting go.
   */
  const dragging = useRef<string | null>(null);
  const landing = useRef(-1);
  /** Every row's height, measured, so the others know how far to slide. */
  const heights = useRef<Record<string, number>>({});
  /** Per row: how far it has been dragged, how far it has slid to make
   *  room, and how lifted it is (0 at rest, 1 held). */
  const motion = useRef<Record<string, { drag: Animated.Value; shift: Animated.Value; lift: Animated.Value }>>({});
  const motionOf = (id: string) =>
    (motion.current[id] ??= { drag: new Animated.Value(0), shift: new Animated.Value(0), lift: new Animated.Value(0) });
  const scrollRef = useRef(null);
  const GAP = spacing.sm;

  function startDrag(id: string) {
    dragging.current = id;
    landing.current = items.findIndex((m) => m.id === id);
    const m = motionOf(id);
    m.drag.setValue(0);
    Animated.timing(m.lift, { toValue: 1, duration: 120, useNativeDriver: false }).start();
  }

  function moveDrag(id: string, dy: number) {
    if (dragging.current !== id) return;
    motionOf(id).drag.setValue(dy);
    const from = items.findIndex((m) => m.id === id);
    // Walk past each neighbour once the held row is halfway over it.
    let target = from;
    let travelled = 0;
    if (dy > 0) {
      for (let j = from + 1; j < items.length; j++) {
        const pitch = (heights.current[items[j].id] ?? 52) + GAP;
        if (dy > travelled + pitch / 2) { target = j; travelled += pitch; } else break;
      }
    } else {
      for (let j = from - 1; j >= 0; j--) {
        const pitch = (heights.current[items[j].id] ?? 52) + GAP;
        if (-dy > travelled + pitch / 2) { target = j; travelled += pitch; } else break;
      }
    }
    if (target === landing.current) return;
    landing.current = target;
    const room = (heights.current[id] ?? 52) + GAP;
    items.forEach((m, k) => {
      if (m.id === id) return;
      const toValue = from < k && k <= target ? -room : target <= k && k < from ? room : 0;
      Animated.timing(motionOf(m.id).shift, { toValue, duration: 140, useNativeDriver: false }).start();
    });
  }

  function endDrag(id: string) {
    if (dragging.current !== id) return;
    const to = landing.current;
    dragging.current = null;
    landing.current = -1;
    moveTo(id, to);
    // Back to rest in the same moment the list redraws in its new order,
    // so nothing visibly jumps.
    for (const m of Object.values(motion.current)) {
      m.drag.setValue(0);
      m.shift.setValue(0);
      m.lift.setValue(0);
    }
  }

  const weights = weightsFor(items.length);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const full = items.length >= MAX_MUST_HAVES;

  function submit() {
    const text = draft.trim();
    if (!text) return;
    add(text);
    setDraft('');
  }

  function confirmRemove(mustHave: MustHave) {
    Alert.alert('Remove this must-have?', mustHave.text, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        // Said out loud, because it is not obvious: the ticks and crosses
        // already recorded against this on every property stop counting,
        // and every score moves as a result.
        onPress: () => remove(mustHave.id),
      },
    ]);
  }

  return (
    // Gestures need a root of their own inside a modal (gesture-handler
    // docs): the app's root does not reach into a separately presented sheet.
    <GestureHandlerRootView style={styles.flex}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* The full inset now: this is a full-screen page rather than a
          card sheet (see app/_layout.tsx), so it starts at the very top of
          the screen, under the notch. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.wordmark}>MUST-HAVES</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      {/* gesture-handler's scroll view, not React Native's, so a drag
          handle can tell it to wait (blocksExternalGesture in Row): the
          page then never starts scrolling under a row being dragged.
          Switching scrolling off mid-touch instead made iOS cancel the drag
          (logged, 2026-10-06). */}
      <GestureScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          The things that matter when you walk in. Put the most important at the top -
          {items.length > 1
            ? ` your first counts ${items.length} times as much as your last.`
            : ' the order decides how much each one counts.'}
        </Text>

        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={(t) => setDraft(t.toUpperCase())}
            onSubmitEditing={submit}
            placeholder={items.length === 0 ? 'NO RENOVATION NEEDED' : 'Add another'}
            placeholderTextColor={colors.inkGhost}
            autoCapitalize="characters"
            returnKeyType="done"
            editable={!full}
            accessibilityLabel="Add a must-have"
          />
          <Pressable
            style={[styles.addBtn, (!draft.trim() || full) && styles.addBtnOff]}
            onPress={submit}
            disabled={!draft.trim() || full}
            accessibilityRole="button"
          >
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {full && (
          <Text style={styles.hint}>
            That's the maximum of {MAX_MUST_HAVES}. Past this the bottom of the list stops
            making any real difference to a score.
          </Text>
        )}

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing on the list yet</Text>
            <Text style={styles.emptyBody}>
              Add what you're actually looking for - "south-facing garden", "no renovation",
              "room for a desk". You'll tick them off at each viewing and we'll score the
              property out of 10.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((mustHave, i) => (
              <Animated.View
                key={mustHave.id}
                onLayout={(e) => { heights.current[mustHave.id] = e.nativeEvent.layout.height; }}
                style={liftStyle(motionOf(mustHave.id))}
              >
                <Row
                  mustHave={mustHave}
                  rank={i + 1}
                  total={items.length}
                  /* The honest share, not a made-up "importance %": this is
                     exactly how much of the final score this line can move. */
                  share={Math.round((weights[i] / totalWeight) * 100)}
                  scrollRef={scrollRef}
                  onUp={() => move(mustHave.id, -1)}
                  onDown={() => move(mustHave.id, 1)}
                  onDragStart={() => startDrag(mustHave.id)}
                  onDragMove={(dy) => moveDrag(mustHave.id, dy)}
                  onDragEnd={() => endDrag(mustHave.id)}
                  onRename={(text) => rename(mustHave.id, text)}
                  onRemove={() => confirmRemove(mustHave)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </GestureScrollView>
    </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

function Row({
  mustHave,
  rank,
  total,
  share,
  scrollRef,
  onUp,
  onDown,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRename,
  onRemove,
}: {
  mustHave: MustHave;
  rank: number;
  total: number;
  share: number;
  scrollRef: React.RefObject<null>;
  onUp: () => void;
  onDown: () => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: () => void;
  onRename: (text: string) => void;
  onRemove: () => void;
}) {
  // The gesture is made once; the callbacks it calls are read fresh, so it
  // always acts on the list as it is now rather than when it was made.
  // runOnJS: these move ordinary Animated values and the list's state, so
  // they belong on the JavaScript side, not the UI thread.
  const latest = useRef({ onDragStart, onDragMove, onDragEnd });
  latest.current = { onDragStart, onDragMove, onDragEnd };
  // No "has it started?" flag in here: gesture-handler copies each of
  // these callbacks, so a variable set in one is never seen by another
  // (the drop silently did nothing, logged 2026-10-06). The screen keeps
  // track of which row is held instead, and ignores a stray end.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        // The page's scroll waits for this, so it cannot claim the finger.
        .blocksExternalGesture(scrollRef)
        .onBegin(() => latest.current.onDragStart())
        .onUpdate((e) => latest.current.onDragMove(e.translationY))
        .onFinalize(() => latest.current.onDragEnd()),
    [scrollRef],
  );

  // Edited locally and committed on blur, so a whole-list write does not
  // fire on every keystroke (see mustHavesSync.ts — the list is saved
  // whole, so per-keystroke saves would be per-keystroke list writes).
  // Shown in capitals even if it was saved before that rule existed; the
  // stored copy catches up the next time it is edited (onBlur below).
  const [text, setText] = useState(mustHave.text.toUpperCase());

  return (
    <View style={styles.row}>
      {/* The handle. Hold and drag it to move the row. For VoiceOver it is
          "adjustable": swipe up to move up, down to move down. */}
      <GestureDetector gesture={pan}>
      <View
        style={styles.handle}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Reorder ${mustHave.text}`}
        accessibilityValue={{ text: `${rank} of ${total}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onUp();
          if (e.nativeEvent.actionName === 'decrement') onDown();
        }}
      >
        <View style={styles.gripLine} />
        <View style={styles.gripLine} />
        <View style={styles.gripLine} />
      </View>
      </GestureDetector>

      <View style={styles.rankCol}>
        <Text style={styles.rank}>{rank}</Text>
        <Text style={styles.share}>{share}%</Text>
      </View>

      <TextInput
        style={styles.rowInput}
        value={text}
        onChangeText={(t) => setText(t.toUpperCase())}
        autoCapitalize="characters"
        onBlur={() => {
          const trimmed = text.trim().toUpperCase();
          if (!trimmed) {
            setText(mustHave.text.toUpperCase()); // blanking it is not how you delete it
            return;
          }
          if (trimmed !== mustHave.text) onRename(trimmed);
        }}
        accessibilityLabel={`Must-have number ${rank}`}
      />

      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${mustHave.text}`}
      >
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
  );
}

/**
 * A row's place and lift, all driven by its Animated values (see the note
 * on dragging): following the finger, sliding to make room, and floating
 * above the others while held. On the JavaScript driver throughout, since
 * zIndex and shadows cannot be animated natively and one view cannot mix
 * the two.
 */
function liftStyle(m: { drag: Animated.Value; shift: Animated.Value; lift: Animated.Value }) {
  return {
    zIndex: m.lift.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }),
    elevation: m.lift.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }),
    shadowColor: colors.ink,
    shadowOpacity: m.lift.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    transform: [
      { translateY: Animated.add(m.drag, m.shift) },
      { scale: m.lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) },
    ],
  };
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  wordmark: { ...type.label, color: colors.ink, fontSize: 14, letterSpacing: 4 },
  done: { fontFamily: fonts.semibold, fontSize: 15, color: colors.teal },

  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  intro: { ...type.body, color: colors.inkMid, lineHeight: 20 },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkLt, lineHeight: 17 },

  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  addBtn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  addBtnOff: { opacity: 0.4 },
  addBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyTitle: { ...type.title, color: colors.ink },
  emptyBody: {
    ...type.body,
    color: colors.inkLt,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },

  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rankCol: { alignItems: 'center', width: 30 },
  rank: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  share: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.inkGhost },
  rowInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 4,
  },
  /** Big enough for a thumb; the lines are only the visible part. */
  handle: {
    width: 28,
    height: 40,
    marginLeft: -spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3.5,
  },
  gripLine: { width: 16, height: 2, borderRadius: 1, backgroundColor: colors.inkGhost },

  remove: { fontFamily: fonts.regular, fontSize: 22, color: colors.inkGhost, lineHeight: 24 },
});
