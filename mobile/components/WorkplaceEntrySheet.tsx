import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './ui/BottomSheet';
import { MinuteWheel } from './MinuteWheel';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import { joinHousehold } from '../lib/household';
import { migrateProfile } from '../lib/profileMigration';
import { useAuthStore } from '../store/authStore';
import workplaceOptions from '../assets/data/workplace-options.json';
import { MalocaLogo } from './MalocaLogo';
import { SignInButtons } from './SignInButtons';
import type { Member } from '../lib/types';

interface WorkplaceEntrySheetProps {
  visible: boolean;
  onClose: () => void;
}

const MAX_PEOPLE = 4;
const DEFAULT_OFF_WALK = 5;
const MAX_SUGGESTIONS = 5;

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

/**
 * Not a module-level counter: that resets to 0 whenever this file hot-reloads
 * during development, while React keeps the in-progress sheet state around —
 * so the next person added after an edit-triggered reload could be handed
 * the same "draft-1" id as one already on screen, and React would refuse to
 * render two list children with the same key. Time + a random suffix can't
 * collide across a reload.
 */
function newDraft(defaultName: string): Draft {
  const id = `draft-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return { id, name: defaultName, workId: null, workLabel: null, offWalk: DEFAULT_OFF_WALK };
}

/**
 * The whole first-run ask: who's moving in, which station does each of
 * them work near, and how long the walk from there to their actual desk
 * is — up to 4 people, not just a couple (Nick's call, 2026-08-23). Still
 * deliberately light: no budget/beds/baths wizard, just names, stations,
 * and a quick wheel.
 *
 * The form is ONE view (2026-09-21). Choosing a station is an
 * autocomplete that opens under the row it belongs to; only the
 * office-walk wheel is still its own panel, because it is a wheel — a
 * vertically scrolling list that cannot live inside a vertically
 * scrolling form. Picking a station advances straight into that wheel
 * rather than returning to the list, so offWalk is never left unset for
 * someone who picked a real station (unlike workId/workLabel, which
 * genuinely start unset). Someone added
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
   * The household question is now ONE row on the same screen as "who's
   * moving in?", not a screen of its own in front of it (Nick,
   * 2026-09-22: "remove the screen between pressing get started and
   * landing on the who's moving in page").
   *
   * null = not answered yet. Answering "Yes" pops the join card open
   * immediately, in place, over this same sheet; answering "No" just
   * records the answer and leaves the form as the only thing on screen.
   * Nothing here blocks moving on to naming people — an unanswered
   * question is not a wrong answer, it just means nobody has told us yet.
   */
  const [alreadyHasAccount, setAlreadyHasAccount] = useState<boolean | null>(null);
  /** Whether the join card is showing. Separate from the answer above so
   *  cancelling it can close the card without silently deciding "No" for
   *  someone who just wanted a second look at the instructions. */
  const [linkOpen, setLinkOpen] = useState(false);
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

  /**
   * Up to five matches, the ones starting with what was typed first.
   *
   * Capped because this renders INLINE inside the form's scroll view now
   * (see the picker below), and an unbounded list there would push the
   * rest of the form off the bottom of the sheet. Five is enough to
   * separate "Waterloo" from "Waterloo East" without becoming a page of
   * its own.
   *
   * Prefix matches first: typing "wat" should lead with Waterloo, not
   * with whatever alphabetically happens to contain those letters.
   */
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts: typeof workplaceOptions = [];
    const contains: typeof workplaceOptions = [];
    for (const o of workplaceOptions) {
      const label = o.label.toLowerCase();
      if (label.startsWith(q)) starts.push(o);
      else if (label.includes(q)) contains.push(o);
      if (starts.length >= MAX_SUGGESTIONS) break;
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [query]);

  const setProfile = useProfileStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);
  /**
   * Set when someone taps Link accounts while signed out, so the join can
   * carry on by itself once a session appears instead of making them type
   * the code and tap again.
   */
  const pendingJoin = useRef(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  /**
   * Joining pulls the household's profile straight back, so the second
   * person skips the form entirely — which is the whole point of asking.
   */
  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || joining) return;
    if (!user) {
      // The CHOICE of provider, not Google by default — Apple's guideline
      // 4.8 requires it wherever signing in is offered, and this flow used
      // to be the one place in the app with no choice at all. Rendered
      // inline rather than in another sheet: this component IS a sheet,
      // and stacking one modal inside another is a fight not worth having.
      pendingJoin.current = true;
      setNeedsSignIn(true);
      setJoinError(null);
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const result = await joinHousehold(trimmed);
      if (result.profile) {
        setProfile(migrateProfile(result.profile));
        onClose();
        return;
      }
      // Joined, but the household has nothing set up yet — fall through to
      // the form rather than leaving them on a dead end, and say why.
      setJoinedButEmpty(true);
      setLinkOpen(false);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "That code didn't work");
    } finally {
      setJoining(false);
    }
  }

  // Resumes the join the moment a session appears.
  useEffect(() => {
    if (user && pendingJoin.current) {
      pendingJoin.current = false;
      setNeedsSignIn(false);
      void handleJoin();
    }
    // handleJoin closes over `code` freshly each render; re-running only
    // when the sign-in resolves is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  /**
   * The LAST panel that still slides up, and the only one that has to.
   *
   * The station picker used to be one of these too — a third sheet over
   * this one, rendering all ~400 stations into a FlatList behind a slide
   * animation, so it arrived as a blank panel that filled in as it
   * travelled (Nick, 2026-09-21: "laggy and shows white space before it
   * loads. As it slides up, it reveals more station locations"). It is now
   * an autocomplete opening under the row it belongs to, and changes the
   * screen about as much as typing a name does.
   *
   * The walk wheel cannot follow it inline: MinuteWheel is a vertically
   * scrolling list, and nesting one inside the form's own vertically
   * scrolling view breaks both. It is also a single focused question
   * arriving after a decision, which is what a panel is actually for.
   */
  if (editingPerson && editStep === 'walk') {
    // The question IS the title now. "Walk to the office" plus two lines
    // explaining it was a heading that said nothing and a sentence doing all
    // the work (Nick, 2026-08-29). "This station" rather than its name: the
    // sheet opens straight after picking one, so there is no ambiguity.
    return (
      <BottomSheet
        visible={visible}
        onClose={finishEditing}
        title="How long is the walk from this station to your office?"
      >
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
            You're in - they haven't added anyone yet, so let's do it here.
          </Text>
        )}

        {/* The household question used to be a whole screen of its own,
            in front of this one — press Get started and the first thing
            you saw was a screen about somebody ELSE'S account, before you
            had told the app anything about your own (Nick, 2026-09-22:
            "remove the screen between pressing get started and landing on
            the who's moving in page"). It is a row on this screen now.
            Guarded on isDemo for the same reason the old step was: this
            sheet is only ever mounted for a first run, but if a join
            somehow already resolved while it was open, there is nothing
            left to ask. */}
        {isDemo && (
          <View style={styles.householdRow}>
            <Text style={styles.householdRowTitle}>
              Someone else in the house already have an account?
            </Text>
            <View style={styles.pillRow}>
              <Pressable
                onPress={() => { setAlreadyHasAccount(true); setLinkOpen(true); setJoinError(null); }}
                style={[styles.yesNoPill, alreadyHasAccount === true && styles.yesNoPillOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: alreadyHasAccount === true }}
              >
                <Text style={[styles.yesNoPillText, alreadyHasAccount === true && styles.yesNoPillTextOn]}>
                  Yes
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setAlreadyHasAccount(false); setLinkOpen(false); }}
                style={[styles.yesNoPill, alreadyHasAccount === false && styles.yesNoPillOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: alreadyHasAccount === false }}
              >
                <Text style={[styles.yesNoPillText, alreadyHasAccount === false && styles.yesNoPillTextOn]}>
                  No
                </Text>
              </Pressable>
            </View>
          </View>
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
                onPress={() => {
                  // A second tap closes it again — it opens in place, so
                  // the button it opened from is still right there.
                  if (editingId === p.id && editStep === 'station') { finishEditing(); return; }
                  setQuery('');
                  setEditStep('station');
                  setEditingId(p.id);
                }}
                style={[
                  styles.stationBtn,
                  editingId === p.id && editStep === 'station' && styles.stationBtnOpen,
                ]}
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
            {editingId === p.id && editStep === 'station' && (
              <View style={styles.picker}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Start typing your station…"
                  placeholderTextColor={colors.inkGhost}
                  style={styles.pickerInput}
                  autoCorrect={false}
                  autoCapitalize="words"
                  autoFocus
                />
                {/* Plain Views, not a FlatList: this sits inside the
                    form's own ScrollView, and nesting a virtualised list
                    in a scroll view of the same direction breaks both.
                    There are never more than five rows here anyway. */}
                {suggestions.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => chooseStation(p.id, item.id, item.label)}
                    style={styles.row}
                    accessibilityRole="button"
                  >
                    <Text style={styles.rowText}>{item.label}</Text>
                  </Pressable>
                ))}
                {query.trim().length > 0 && suggestions.length === 0 && (
                  <Text style={styles.empty}>No stations match "{query.trim()}"</Text>
                )}
              </View>
            )}

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
        {/* "we" only once there is more than one person. Someone moving
            alone being told about where "we" could live is the app talking
            about a household that does not exist (Nick, 2026-08-29).
            Capitals as a type treatment, not typed in — see `caps`. */}
        <Text style={[styles.doneBtnText, styles.caps]}>
          Show me where {people.length > 1 ? 'we' : 'I'} could live
        </Text>
      </Pressable>

      {/*
        The "pop up" from tapping Yes above. A direct sibling of the
        ScrollView and the CTA rather than a second BottomSheet — RN Modals
        do not reliably stack on iOS (see SignInButtons rendered inline in
        this same file for the earlier bug that taught us that), and this
        needed to feel instant, not wait on a second native presentation.
        `position: absolute` here works the same way the sheet's own close
        button does: BottomSheet's `sheet` View is this component's nearest
        positioned ancestor, so the overlay fills IT rather than the whole
        screen, which is what keeps it looking like a card inside the sheet
        rather than a second sheet on top of it.
      */}
      {linkOpen && (
        <View style={styles.linkOverlay}>
          <Pressable
            style={styles.linkBackdrop}
            onPress={() => { setLinkOpen(false); setAlreadyHasAccount(null); }}
            accessibilityLabel="Close"
          />
          <View style={styles.linkCard}>
            <Pressable
              onPress={() => { setLinkOpen(false); setAlreadyHasAccount(null); }}
              style={styles.linkClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.linkCloseMark}>✕</Text>
            </Pressable>

            <Text style={styles.linkTitle}>Join their household</Text>
            {/* The instruction Nick asked for by name: where the code
                actually lives on the other phone, spelled out rather than
                assumed. Matches the real label in Settings exactly
                ("Manage household" once a household exists) so nobody
                goes looking for a different word. */}
            <Text style={styles.linkHint}>
              Ask them to open Maloca, go to the Settings tab, and tap "Manage household" - their
              code is shown right there.
            </Text>

            <TextInput
              value={code}
              onChangeText={(t) => { setCode(t.toUpperCase()); setJoinError(null); }}
              style={styles.input}
              placeholder="Enter their code"
              placeholderTextColor={colors.inkGhost}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={handleJoin}
            />
            {joinError && <Text style={styles.joinError}>{joinError}</Text>}

            {needsSignIn && (
              <View style={styles.signInBlock}>
                <Text style={styles.joinHint}>
                  A household is tied to an account - sign in and we'll link you straight up.
                </Text>
                <SignInButtons />
              </View>
            )}

            <Pressable
              onPress={handleJoin}
              disabled={!code.trim() || joining}
              style={[styles.doneBtn, (!code.trim() || joining) && styles.doneBtnDisabled]}
              accessibilityRole="button"
            >
              {joining
                ? <ActivityIndicator size="small" color={colors.cream} />
                : <Text style={[styles.doneBtnText, styles.caps]}>Link accounts</Text>}
            </Pressable>
          </View>
        </View>
      )}
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

  /** The household question, now a row on the main screen rather than a
   *  screen of its own. */
  householdRow: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  householdRowTitle: { ...type.title, fontSize: 16, color: colors.ink },
  pillRow: { flexDirection: 'row', gap: spacing.sm },
  yesNoPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.white,
  },
  yesNoPillOn: { backgroundColor: colors.tealSoft, borderColor: colors.teal },
  yesNoPillText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  yesNoPillTextOn: { color: colors.teal },

  joinedNote: {
    fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.teal,
    marginBottom: spacing.sm,
  },
  joinError: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.red, marginTop: 2 },
  signInBlock: { gap: spacing.sm, marginTop: spacing.sm },
  joinHint: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMid, lineHeight: 18 },

  /**
   * The "pop up" itself. Absolutely positioned to fill the sheet it sits
   * inside (see the render-side comment for why this and not a second
   * BottomSheet), with its own backdrop and card so it reads as something
   * that arrived on top of the form, not as the form changing under you.
   */
  linkOverlay: { ...(StyleSheet.absoluteFill as object), justifyContent: 'center', padding: spacing.lg },
  linkBackdrop: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(34,40,46,0.45)' },
  linkCard: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: colors.ink,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  linkClose: {
    position: 'absolute', top: spacing.sm, right: spacing.sm,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  linkCloseMark: { fontSize: 17, lineHeight: 20, color: colors.inkLt },
  linkTitle: { ...type.title, fontSize: 18, color: colors.ink, paddingRight: 32 },
  linkHint: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, color: colors.inkMid },
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
  /** The autocomplete, opening under the row it belongs to. */
  picker: {
    marginTop: spacing.xs,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.tealLine,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  pickerInput: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  rowText: { ...type.body, fontSize: 15, color: colors.ink },
  empty: { ...type.body, fontSize: 13.5, color: colors.inkLt, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
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
  /** Open, it reads as the thing the list below belongs to. */
  stationBtnOpen: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
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
