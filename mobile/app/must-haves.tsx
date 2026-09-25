import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
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
 * Reordering is up/down arrows, NOT drag-and-drop. There is no Expo package
 * for a draggable list (checked against the SDK 57 API list), so dragging
 * would mean hand-building one on gesture-handler and reanimated — a lot of
 * surface area for a list most households will reorder a handful of times.
 * Arrows also work with a screen reader, which a hand-rolled drag would
 * not without a second implementation.
 */
export default function MustHavesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, add, rename, remove, move } = useMustHaves();
  const [draft, setDraft] = useState('');

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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Capped, not the raw inset. This is presented as a modal card, so
          it already starts below the notch — adding the full inset on top
          of that leaves a thumb's worth of dead space above the title.
          Android presents it higher, so the inset still has to count for
          something, hence a cap rather than dropping it. */}
      <View style={[styles.header, { paddingTop: Math.min(insets.top, spacing.md) + spacing.md }]}>
        <Text style={styles.wordmark}>MUST-HAVES</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
              <Row
                key={mustHave.id}
                mustHave={mustHave}
                rank={i + 1}
                /* The honest share, not a made-up "importance %": this is
                   exactly how much of the final score this line can move. */
                share={Math.round((weights[i] / totalWeight) * 100)}
                first={i === 0}
                last={i === items.length - 1}
                onUp={() => move(mustHave.id, -1)}
                onDown={() => move(mustHave.id, 1)}
                onRename={(text) => rename(mustHave.id, text)}
                onRemove={() => confirmRemove(mustHave)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({
  mustHave,
  rank,
  share,
  first,
  last,
  onUp,
  onDown,
  onRename,
  onRemove,
}: {
  mustHave: MustHave;
  rank: number;
  share: number;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRename: (text: string) => void;
  onRemove: () => void;
}) {
  // Edited locally and committed on blur, so a whole-list write does not
  // fire on every keystroke (see mustHavesSync.ts — the list is saved
  // whole, so per-keystroke saves would be per-keystroke list writes).
  // Shown in capitals even if it was saved before that rule existed; the
  // stored copy catches up the next time it is edited (onBlur below).
  const [text, setText] = useState(mustHave.text.toUpperCase());

  return (
    <View style={styles.row}>
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

      <View style={styles.arrows}>
        <Pressable
          onPress={onUp}
          disabled={first}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Move ${mustHave.text} up`}
        >
          <Text style={[styles.arrow, first && styles.arrowOff]}>↑</Text>
        </Pressable>
        <Pressable
          onPress={onDown}
          disabled={last}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Move ${mustHave.text} down`}
        >
          <Text style={[styles.arrow, last && styles.arrowOff]}>↓</Text>
        </Pressable>
      </View>

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
  arrows: { gap: 0 },
  arrow: { fontFamily: fonts.semibold, fontSize: 15, color: colors.teal, lineHeight: 18 },
  arrowOff: { color: colors.creamDk },
  remove: { fontFamily: fonts.regular, fontSize: 22, color: colors.inkGhost, lineHeight: 24 },
});
