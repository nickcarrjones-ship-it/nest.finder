import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../../theme';
import { useProfileStore } from '../../store/profileStore';
import { useAuthStore } from '../../store/authStore';
import { useHouseholdStore } from '../../store/householdStore';
import { useAgentChatStore } from '../../store/agentChatStore';
import { useShortlistStore } from '../../store/shortlistStore';
import { useSetupStore } from '../../store/setupStore';
import { deleteAccount } from '../../lib/deleteAccount';
import { SignInButtons } from '../../components/SignInButtons';
import { versionLine } from '../../lib/version';

/**
 * Settings tab — replaces the floating gear button that used to sit on the
 * map (2026-08-23). The main commute-limit control moved further still, to
 * the CommuteSlider on the map itself, since dragging it and watching the
 * region respond is the whole point of that control; a settings screen was
 * never the place to make it discoverable.
 *
 * What's left here is genuinely settings-shaped: "walk to home station"
 * still feeds the older fixed-walk station-circle layer (still available
 * via the map's layer toggles, off by default) — kept working rather than
 * torn out, since nothing asked for that layer to be removed, only for it
 * to stop being the default view.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const clearPreferences = useProfileStore((s) => s.clearPreferences);
  const restartChat = useAgentChatStore((s) => s.restart);
  const setShortlist = useShortlistStore((s) => s.setResult);

  /**
   * Run the whole thing again — the real setup flow, not a fresh chat.
   *
   * It used to clear the preferences and leave somebody in the tabs, so
   * the Agent tab asked the same questions as free-form typing with no
   * progress line, no step count and no tap screens. That is a different
   * and worse experience than the one setup gives, and "start over" should
   * mean start over (Nick, 2026-09-21).
   *
   * Re-arming the setup gate is what routes them back to app/setup.tsx —
   * see store/setupStore.ts. Doing it LAST matters: the gate change is
   * what moves the screen, so everything it is about to read should
   * already be clean.
   *
   * Note this is a deliberate transition, not the re-derivation that store
   * warns against. The gate must never recompute itself from the profile
   * mid-conversation; being switched on by somebody pressing a button is
   * exactly how finish() works in the other direction.
   */
  function startAgentOver() {
    clearPreferences();
    restartChat();
    // No dedicated clear on this store; an empty result IS the cleared
    // state, and it drops the cached ranking so picks recompute from
    // scratch rather than replaying the old preferences.
    setShortlist([], null);
    useSetupStore.getState().decide(true);
  }

  function confirmStartOver() {
    Alert.alert(
      'Run the questions again?',
      'Everything you told the Agent is forgotten, and we start from question one.',
      [
        { text: 'Keep what I said', style: 'cancel' },
        { text: 'Start again', style: 'destructive', onPress: startAgentOver },
      ],
    );
  }
  const householdId = useHouseholdStore((s) => s.householdId);
  const [deleting, setDeleting] = useState(false);


  /**
   * Two taps to delete, and the second one spells out what goes.
   *
   * The household sentence is the part nobody would guess: viewings and
   * ratings written inside a household stay with the people still in it,
   * because they are a shared record of places everyone went to see, not
   * a possession one person takes away. Better said here than discovered
   * afterwards by whoever is left.
   */
  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      householdId
        ? 'Your account, your profile and everything you saved on your own goes for good. Viewings and ratings inside your household stay with the people still in it. This cannot be undone.'
        : 'Your account, your profile, your viewings, your must-haves and your ratings go for good. This cannot be undone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: () => void runDelete() },
      ],
    );
  }

  async function runDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
      // Nothing to sign out OF any more — the record is gone — but this
      // clears every store on the device, which is the half that matters
      // now (see profileFirebaseSync's sign-out branch).
      await signOut();
      Alert.alert('Account deleted', 'Everything saved against your account has been removed.');
    } catch (err) {
      Alert.alert('Couldn’t delete', err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
    >
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.label}>Account</Text>
      {user ? (
        <View style={styles.accountRow}>
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>{user.displayName ?? user.email}</Text>
            {user.displayName && <Text style={styles.accountEmail}>{user.email}</Text>}
          </View>
          <Pressable onPress={() => signOut()} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      ) : (
        <SignInButtons />
      )}

      {user && (
        <Pressable
          onPress={() => router.push('/household')}
          style={[styles.householdRow, styles.secondSection]}
          accessibilityRole="button"
        >
          <Text style={styles.householdRowText}>
            {householdId ? 'Manage household' : 'Sync with existing account'}
          </Text>
          <Text style={styles.householdRowArrow}>›</Text>
        </Pressable>
      )}

      {user && (
        <>
          <Text style={[styles.label, styles.secondSection]}>Testing</Text>
          <Text style={styles.hint}>
            Forgets everything you told the Maloca Agent and takes you back through the
            questions from the start. This clears it on the server too, not just on this
            phone.
          </Text>
          {/* Confirmed, because it now walks you out of the app and into
              setup — a single stray tap used to cost the conversation, and
              costs the screen you were on as well. */}
          <Pressable onPress={confirmStartOver} style={styles.resetBtn} accessibilityRole="button">
            <Text style={styles.resetText}>Run the Agent conversation again</Text>
          </Pressable>
        </>
      )}

      <Text style={[styles.label, styles.secondSection]}>Your data</Text>
      <Pressable
        onPress={() => Linking.openURL('https://maloca.homes/privacy.html').catch(() => {})}
        style={styles.linkRow}
        accessibilityRole="link"
      >
        <Text style={styles.linkRowText}>Privacy policy</Text>
        <Text style={styles.householdRowArrow}>›</Text>
      </Pressable>
      <Pressable
        onPress={() => Linking.openURL('https://maloca.homes/terms.html').catch(() => {})}
        style={styles.linkRow}
        accessibilityRole="link"
      >
        <Text style={styles.linkRowText}>Terms of use</Text>
        <Text style={styles.householdRowArrow}>›</Text>
      </Pressable>

      {user && (
        <>
          <Text style={styles.hint}>
            Deleting removes your account and everything saved against it. There's no way back.
          </Text>
          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            style={[styles.deleteBtn, deleting && styles.deleteBtnBusy]}
            accessibilityRole="button"
          >
            {deleting ? (
              <ActivityIndicator size="small" color={colors.red} />
            ) : (
              <Text style={styles.deleteText}>Delete my account</Text>
            )}
          </Pressable>
        </>
      )}

      {/*
        Which code this phone is actually running.
        
        Over-the-air updates download on one launch and apply on the NEXT,
        so there is always a window where the app looks unchanged because
        it genuinely is. That window has cost several rounds of "the fix
        did not work" when the fix simply had not loaded yet (Nick,
        2026-09-22 and 2026-09-23), and there was no way to tell from
        inside the app. Now there is.
        
        It matters more once testers are involved: a bug report against an
        unknown build is a bug report you cannot act on.
      */}
      <Text style={[styles.label, styles.secondSection]}>Version</Text>
      <Text style={styles.versionLine}>{versionLine()}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  linkRowText: { ...type.bodyStrong, fontSize: 14, color: colors.ink },
  deleteBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.redLine,
    backgroundColor: colors.redBg,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 18,
    minHeight: 38,
    justifyContent: 'center',
  },
  deleteBtnBusy: { opacity: 0.6 },
  deleteText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.red },
  title: { ...type.title, color: colors.ink, marginBottom: spacing.xl },
  label: { ...type.label, color: colors.inkGhost, marginBottom: 4 },
  secondSection: { marginTop: spacing.xl },
  accountRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.rule, padding: spacing.md, marginBottom: spacing.sm,
  },
  accountInfo: { flex: 1, gap: 2 },
  accountName: { ...type.bodyStrong, color: colors.ink },
  accountEmail: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkLt },
  signOutBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  signOutText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.red },
  versionLine: { fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.inkLt, lineHeight: 17 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.rule,
    borderRadius: radius.md, paddingVertical: spacing.md, marginBottom: spacing.sm,
  },
  googleBtnBusy: { opacity: 0.6 },
  googleBtnText: { ...type.bodyStrong, color: colors.ink },
  accountError: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.red, marginBottom: spacing.sm },
  householdRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.rule, padding: spacing.md,
  },
  householdRowText: { ...type.bodyStrong, fontSize: 14, color: colors.ink },
  householdRowArrow: { fontSize: 18, color: colors.inkGhost },
  resetBtn: {
    borderWidth: 1, borderColor: colors.tealLine, backgroundColor: colors.tealSoft,
    borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center',
  },
  resetText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.teal },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkLt, lineHeight: 17, marginBottom: spacing.sm },
});
