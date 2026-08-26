import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './ui/BottomSheet';
import { MinuteWheel } from './MinuteWheel';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileStore } from '../store/profileStore';
import workplaceOptions from '../assets/data/workplace-options.json';
import { MalocaLogo } from './MalocaLogo';
import { WelcomeHero } from './WelcomeHero';
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
  const [people, setPeople] = useState<Draft[]>(() => [newDraft('You')]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStep, setEditStep] = useState<'station' | 'walk'>('station');
  const [query, setQuery] = useState('');
  const setMembers = useProfileStore((s) => s.setMembers);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workplaceOptions;
    return workplaceOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [query]);

  function addPerson() {
    if (people.length >= MAX_PEOPLE) return;
    setPeople((prev) => [...prev, newDraft(`Person ${prev.length + 1}`)]);
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

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* The first thing anyone ever sees of Maloca — it explains what the
          app is for BEFORE asking for anything, rather than opening cold on
          a form (Nick's call, 2026-08-23). Scrolls, with Done pinned below,
          so the welcome never pushes the button out of reach. */}
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <MalocaLogo scale={1} />
        <WelcomeHero />

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Who's moving in?</Text>
        <Text style={styles.hint}>
          Add everyone in the household and their nearest work station — we'll show
          everywhere you could all live within your commutes.
        </Text>

        {people.map((p) => (
          <View key={p.id} style={styles.personBlock}>
            <View style={styles.personRow}>
              <TextInput
                value={p.name}
                onChangeText={(text) => renamePerson(p.id, text)}
                style={styles.nameInput}
                placeholder="Name"
                placeholderTextColor={colors.inkGhost}
              />
              <Pressable
                onPress={() => { setQuery(''); setEditStep('station'); setEditingId(p.id); }}
                style={styles.stationBtn}
                accessibilityRole="button"
              >
                <Text style={[styles.stationBtnText, !p.workLabel && styles.stationBtnPlaceholder]} numberOfLines={1}>
                  {p.workLabel ?? 'Choose station'}
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
