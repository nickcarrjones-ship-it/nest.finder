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
import { deleteAccount, ReauthRequiredError } from '../../lib/deleteAccount';
import { SignInButtons } from '../../components/SignInButtons';
import { SignInSheet } from '../../components/SignInSheet';

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

  // Temporary, for building the Agent flow: puts the app back to "signed in
  // but hasn't talked to the Agent yet", which is the only state the intro
  // card appears in. Remove once the flow stops needing to be re-run
  // (Nick, 2026-08-26).
  function startAgentOver() {
    clearPreferences();
    restartChat();
    // No dedicated clear on this store; an empty result IS the cleared
    // state, and it drops the cached ranking so picks recompute from
    // scratch rather than replaying the old preferences.
    setShortlist([], null);
  }
  const householdId = useHouseholdStore((s) => s.householdId);
  const [deleting, setDeleting] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);

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
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        // Deleting is irreversible, so the server wants a fresh sign-in
        // rather than a month-old session resumed on a phone somebody
        // left on a table. The retry is them pressing the button again,
        // deliberately — not something this function loops on.
        setDeleting(false);
        // Whichever provider they used — an Apple account can never
        // satisfy a Google-only prompt, and this is the one screen where
        // failing to re-authenticate means being unable to leave.
        setReauthOpen(true);
        return;
      }
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
            Forgets everything you told the Maloca Agent so the conversation starts fresh. This
            clears it on the server too, not just on this phone.
          </Text>
          <Pressable onPress={startAgentOver} style={styles.resetBtn} accessibilityRole="button">
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
      <SignInSheet
        visible={reauthOpen}
        onClose={() => setReauthOpen(false)}
        reason="Deleting an account can't be undone, so please sign in again to confirm it's you. Then press delete once more."
      />
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
