import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './ui/BottomSheet';
import { MinuteWheel } from './MinuteWheel';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import { joinHousehold } from '../lib/household';
import { migrateProfile } from '../lib/profileMigration';
import { useAuthStore } from '../store/authStore';
import workplaceOptions from '../assets/data/workplace-options.json';
import { MalocaLogo } from './MalocaLogo';
import type { Member } from '../lib/types';

interface WorkplaceEntrySheetProps {
  visible: boolean;
  onClose: () => void;
}

const MAX_PEOPLE = 4;
const DEFAULT_OFF_WALK = 5;

interface Draft {
  id: string;
  name: string;
  workId: string | null;
  workLabel: string | null;
  /** Minutes from the station to their actual desk — asked right after
   *  picking a station (2026-08-24), not left to silently default to 0 in
   *  the commute maths the way it did for every real user before this. */
  offWalk: number;
}

let draftCounter = 0;
function newDraft(defaultName: string): Draft {
  draftCounter += 1;
  return { id: `draft-${draftCounter}`, name: defaultName, workId: null, workLabel: null, offWalk: DEFAULT_OFF_WALK };
}

/**
 * The whole first-run ask: who's moving in, which station does each of
 * them work near, and how long the walk from there to their actual desk
 * is — up to 4 people, not just a couple (Nick's call, 2026-08-23). Still
 * deliberately light: no budget/beds/baths wizard, just names, stations,
 * and a quick wheel.
 *
 * Three views in one sheet, entered in sequence per person: the list,
 * choosing a station, then the office-walk wheel — picking a station
 * advances straight into the wheel rather than returning to the list, so
 * offWalk is never left unset for someone who picked a real station
 * (unlike workId/workLabel, which genuinely start unset). Someone added
 * without a station is still dropped on Done: every listed member's
 * commute has to resolve for an area to count as usable at all (see
 * lib/walkBudget.ts), so a half-filled row would quietly break every
 * area, not just skip that one person.
 */
export function WorkplaceEntrySheet({ visible, onClose }: WorkplaceEntrySheetProps) {
  /**
   * Names start EMPTY, not pre-filled with "You" and "Person 2".
   *
   * A field already containing "You" reads as answered, so people left it —
   * which is why the map then talked about Person 2 instead of Harriet
   * (Nick, 2026-08-29). An empty field with a placeholder reads as a
   * question. The fallback on save still fills in a sensible name for
   * anyone who genuinely does not want to type one.
   */
  const [people, setPeople] = useState<Draft[]>(() => [newDraft('')]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStep, setEditStep] = useState<'station' | 'walk'>('station');
  /**
   * The household question comes BEFORE "who's moving in?" (Nick,
   * 2026-08-29).
   *
   * If a partner or housemate has already done all this, asking the second
   * person to type it again is asking them to duplicate work AND risking two
   * separate searches for one move. It only makes sense here, at the moment
   * before the typing starts — earlier, on the landing page, it competed
   * with "I already have an account" and Rosie read the two as the same
   * thing.
   */
  const [step, setStep] = useState<'household' | 'people'>(() =>
    useProfileStore.getState().profile.isDemo ? 'household' : 'people',
  );
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  /**
   * Shown on the form when someone joined a household that has not actually
   * finished setting up. The step before promises "you'll skip it entirely",
   * so landing them on the form with no explanation reads as the code having
   * failed when it worked perfectly.
   */
  const [joinedButEmpty, setJoinedButEmpty] = useState(false);
  const [query, setQuery] = useState('');
  const setMembers = useProfileStore((s) => s.setMembers);
  const isDemo = useProfileStore((s) => s.profile.isDemo);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workplaceOptions;
    return workplaceOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [query]);

  const setProfile = useProfileStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  /**
   * Joining pulls the household's profile straight back, so the second
   * person skips the form entirely — which is the whole point of asking.
   */
  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      if (!user) await signInWithGoogle();
      const result = await joinHousehold(trimmed);
      if (result.profile) {
        setProfile(migrateProfile(result.profile));
        onClose();
        return;
      }
      // Joined, but the household has nothing set up yet — fall through to
      // the form rather than leaving them on a dead end, and say why.
      setJoinedButEmpty(true);
      setStep('people');
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "That code didn't work");
    } finally {
      setJoining(false);
    }
  }

  function addPerson() {
    if (people.length >= MAX_PEOPLE) return;
    setPeople((prev) => [...prev, newDraft('')]);
  }

  function removePerson(id: string) {
    setPeople((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }

  function renamePerson(id: string, name: string) {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function chooseStation(id: string, workId: string, workLabel: string) {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, workId, workLabel } : p)));
    setQuery('');
    setEditStep('walk');
  }

  function setOffWalk(id: string, minutes: number) {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, offWalk: minutes } : p)));
  }

  function finishEditing() {
    setEditingId(null);
    setEditStep('station');
  }

  function done() {
    const ready = people.filter((p): p is Draft & { workId: string; workLabel: string } =>
      Boolean(p.workId && p.workLabel),
    );
    if (ready.length === 0) return;
    const members: Member[] = ready.map((p, i) => ({
      id: `m${i}`,
      name: p.name.trim() || `Person ${i + 1}`,
      workId: p.workId,
      workLabel: p.workLabel,
      offWalk: p.offWalk,
    }));
    setMembers(members);
    onClose();
  }

  const canFinish = people.some((p) => p.workId);
  const editingPerson = people.find((p) => p.id === editingId);

  if (editingPerson && editStep === 'station') {
    return (
      <BottomSheet visible={visible} onClose={finishEditing} title={`${editingPerson.name || 'Their'} station`}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search stations…"
          placeholderTextColor={colors.inkGhost}
          style={styles.input}
          autoCorrect={false}
          autoFocus
        />
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => chooseStation(editingPerson.id, item.id, item.label)}
              style={styles.row}
              accessibilityRole="button"
            >
              <Text style={styles.rowText}>{item.label}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No stations match "{query}"</Text>}
        />
      </BottomSheet>
    );
  }

  if (editingPerson && editStep === 'walk') {
    return (
      <BottomSheet visible={visible} onClose={finishEditing} title="Walk to the office">
        <Text style={styles.hint}>
          Once {editingPerson.name || 'they'} step off the train at {editingPerson.workLabel}, how many
          minutes is the walk to the actual desk?
        </Text>
        <View style={styles.wheelRow}>
          <MinuteWheel
            value={editingPerson.offWalk}
            onChange={(m) => setOffWalk(editingPerson.id, m)}
            min={1}
            max={20}
            label="Minutes from station to desk"
          />
          <Text style={styles.wheelUnit}>min</Text>
        </View>
        <Pressable onPress={finishEditing} style={styles.doneBtn} accessibilityRole="button">
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </BottomSheet>
    );
  }

  /**
   * Whether there is a real profile behind this sheet to return to.
   *
   * NOT "has a workplace been chosen" — that was my first attempt and it
   * failed, because the DEMO profile ships with members A and B already
   * carrying workplaces (profileStore), so the test was true before anyone
   * had typed anything and the sheet stayed dismissable.
   *
   * isDemo is the honest test: it means everything on screen is a
   * placeholder. It is cleared by setMembers, which only runs when someone
   * presses the button — so during first run the button is genuinely the
   * only way out, and afterwards this is an ordinary editable sheet.
   */
  const hasSetup = !isDemo;

  if (step === 'household') {
    return (
      <BottomSheet visible={visible} onClose={onClose} dismissable={hasSetup}>
        {/* Its own spacing, not the shared styles: those carry margins AND
            sit inside a gapped container, so every gap was being applied
            twice and the card was mostly air (Nick, 2026-08-29). */}
        <View style={styles.householdStep}>
          <MalocaLogo scale={0.8} />
          {/* "Joining someone's search?" was too vague about the
              precondition: the other person has to have FINISHED setup for
              there to be anything to join. Saying so avoids someone typing
              a code from a housemate who has only just downloaded it
              (Nick, 2026-08-29). */}
          <Text style={styles.householdTitle}>Someone in your house already set up?</Text>

          <TextInput
            value={code}
            onChangeText={(t) => { setCode(t.toUpperCase()); setJoinError(null); }}
            style={styles.input}
            placeholder="Enter their code and join their household"
            placeholderTextColor={colors.inkGhost}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleJoin}
          />
          {joinError && <Text style={styles.joinError}>{joinError}</Text>}

          <Pressable
            onPress={handleJoin}
            disabled={!code.trim() || joining}
            style={[styles.doneBtn, (!code.trim() || joining) && styles.doneBtnDisabled]}
            accessibilityRole="button"
          >
            {joining
              ? <ActivityIndicator size="small" color={colors.cream} />
              : <Text style={[styles.doneBtnText, styles.caps]}>Join</Text>}
          </Pressable>

          <Pressable onPress={() => setStep('people')} style={styles.skipBtnTight} accessibilityRole="button">
            <Text style={[styles.skipBtnText, styles.caps]}>Start fresh instead</Text>
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissable={hasSetup}>
      {/* The welcome carousel used to sit here, explaining what Maloca does
          before asking for anything. The landing page now says that in two
          sentences before anyone presses Get started, so repeating it here
          was just standing between someone and the form (Nick, 2026-08-29).
          The explanatory hint under the heading went for the same reason —
          the fields say what they want. */}
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <MalocaLogo scale={1} />

        <View style={styles.divider} />

        {joinedButEmpty && (
          <Text style={styles.joinedNote}>
            You're in — they haven't added anyone yet, so let's do it here.
          </Text>
        )}

        <Text style={styles.sectionTitle}>Who's moving in?</Text>

        {people.map((p) => (
          <View key={p.id} style={styles.personBlock}>
            <View style={styles.personRow}>
              <TextInput
                value={p.name}
                onChangeText={(text) => renamePerson(p.id, text)}
                style={styles.nameInput}
                placeholder={people[0]?.id === p.id ? 'Your name' : 'Their name'}
                placeholderTextColor={colors.inkGhost}
              />
              <Pressable
                onPress={() => { setQuery(''); setEditStep('station'); setEditingId(p.id); }}
                style={styles.stationBtn}
                accessibilityRole="button"
              >
                <Text style={[styles.stationBtnText, !p.workLabel && styles.stationBtnPlaceholder]} numberOfLines={1}>
                  {/* "Choose station" left people picking the station nearest
                      HOME, which is the one thing this field is not. Measured
                      at 197dp against 204dp available, so it fits without
                      truncating — just. */}
                  {p.workLabel ?? 'Choose your nearest work station'}
                </Text>
              </Pressable>
              {people.length > 1 && (
                <Pressable
                  onPress={() => removePerson(p.id)}
                  style={styles.removeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${p.name || 'this person'}`}
                >
                  <Text style={styles.removeBtnText}>×</Text>
                </Pressable>
              )}
            </View>
            {p.workLabel && (
              <Pressable onPress={() => { setEditStep('walk'); setEditingId(p.id); }}>
                <Text style={styles.walkNote}>{p.offWalk} min walk to the desk · edit</Text>
              </Pressable>
            )}
          </View>
        ))}

        {people.length < MAX_PEOPLE && (
          <Pressable onPress={addPerson} style={styles.addBtn} accessibilityRole="button">
            <Text style={styles.addBtnText}>+ Add another person</Text>
          </Pressable>
        )}
      </ScrollView>

      <Pressable
        onPress={done}
        disabled={!canFinish}
        style={[styles.doneBtn, !canFinish && styles.doneBtnDisabled]}
        accessibilityRole="button"
      >
        <Text style={styles.doneBtnText}>Show me where we could live</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  divider: {
    height: 1,
    backgroundColor: colors.rule,
    marginBottom: spacing.lg,
  },
  sectionTitle: { ...type.title, fontSize: 17, color: colors.ink, marginBottom: 4 },
  householdStep: { gap: spacing.sm, paddingBottom: spacing.xs },
  householdTitle: { ...type.title, fontSize: 17, color: colors.ink },
  joinedNote: {
    fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.teal,
    marginBottom: spacing.sm,
  },
  joinError: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.red, marginTop: 2 },
  skipBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  skipBtnTight: { paddingVertical: spacing.sm, alignItems: 'center' },
  skipBtnText: { ...type.bodyStrong, fontSize: 14, color: colors.teal },
  /**
   * Capitals as a TYPE TREATMENT, not typed into the string. A screen
   * reader given "JOIN" may spell it out letter by letter, and literal caps
   * get none of the letter-spacing that makes small capitals readable.
   */
  caps: { textTransform: 'uppercase', letterSpacing: 1.2 },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkLt, lineHeight: 17, marginBottom: spacing.md },
  input: { fontFamily: fonts.regular, backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.ink,
    marginBottom: spacing.sm },
  list: { maxHeight: 320 },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  rowText: { ...type.body, fontSize: 15, color: colors.ink },
  empty: { ...type.body, color: colors.inkLt, textAlign: 'center', paddingVertical: spacing.lg },
  personBlock: { marginBottom: spacing.sm },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameInput: { fontFamily: fonts.regular, width: 88,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    color: colors.ink },
  stationBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stationBtnText: { ...type.body, fontSize: 14, color: colors.ink },
  stationBtnPlaceholder: { color: colors.inkGhost },
  removeBtn: { padding: spacing.xs },
  removeBtnText: { fontSize: 20, color: colors.inkGhost, lineHeight: 22 },
  walkNote: {
    ...type.body, fontSize: 11.5, color: colors.teal,
    marginTop: 4, marginLeft: 96,
  },
  addBtn: { paddingVertical: spacing.sm, marginBottom: spacing.md },
  addBtnText: { ...type.bodyStrong, fontSize: 14, color: colors.teal },
  wheelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginBottom: spacing.lg,
  },
  wheelUnit: { ...type.body, fontSize: 15, color: colors.inkLt },
  doneBtn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  doneBtnDisabled: { opacity: 0.4 },
  doneBtnText: { ...type.bodyStrong, fontSize: 15, color: colors.white },
});
