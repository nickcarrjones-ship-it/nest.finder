import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onValue, ref } from 'firebase/database';
import { db } from '../lib/firebase';
import { colors, radius, spacing, type } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { useHouseholdStore } from '../store/householdStore';
import { createHousehold, createHouseholdInvite } from '../lib/household';
import { QRCodeView } from '../components/QRCodeView';

const MAX_HOUSEHOLD_SIZE = 4;

/**
 * "Sync with housemates" — reachable from the Settings tab once signed
 * in, and from the landing page's stub before that (which sends people
 * here to sign in first). Not a Stack.Protected screen: it's navigated to
 * from within (tabs) once already `ready`, so it doesn't need its own
 * gate — the sign-in prompt below covers the one real precondition.
 */
export default function HouseholdScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const profile = useProfileStore((s) => s.profile);
  const householdId = useHouseholdStore((s) => s.householdId);
  const setHouseholdId = useHouseholdStore((s) => s.setHouseholdId);

  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  // Live, not a one-shot read — the whole point is seeing someone else
  // actually join while this screen is open.
  useEffect(() => {
    if (!householdId) { setMemberCount(null); return; }
    return onValue(ref(db, `households/${householdId}/members`), (snap) => {
      const val = snap.val();
      setMemberCount(val ? Object.keys(val).length : 0);
    });
  }, [householdId]);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const { householdId: newId } = await createHousehold(profile);
      setHouseholdId(newId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite() {
    if (!householdId) return;
    setBusy(true);
    setError(null);
    try {
      setInviteCode(await createHouseholdInvite(householdId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!inviteCode) return;
    try {
      await Share.share({
        message: `Join our Maloca household — open the app and enter this code: ${inviteCode}`,
      });
    } catch {
      // Share sheet dismissed without picking anything — not an error.
    }
  }

  const full = memberCount !== null && memberCount >= MAX_HOUSEHOLD_SIZE;

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
    >
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title}>Sync with housemates</Text>

      {!user ? (
        <>
          <Text style={styles.hint}>A household is tied to your account — sign in first.</Text>
          <Pressable
            onPress={() => signInWithGoogle()}
            disabled={authStatus === 'signing-in'}
            style={styles.primaryBtn}
            accessibilityRole="button"
          >
            {authStatus === 'signing-in' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Sign in with Google</Text>
            )}
          </Pressable>
        </>
      ) : !householdId ? (
        <>
          <Text style={styles.hint}>
            Share your commute area and picks with up to 3 other people — everyone sees the
            same map, from their own phone.
          </Text>
          <Pressable onPress={handleStart} disabled={busy} style={styles.primaryBtn} accessibilityRole="button">
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Start a household</Text>
            )}
          </Pressable>
          <Pressable onPress={() => router.push('/join')} style={styles.secondaryBtn} accessibilityRole="button">
            <Text style={styles.secondaryBtnText}>Have a code? Join one instead</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>
              {memberCount === null ? 'Loading…' : `${memberCount} of ${MAX_HOUSEHOLD_SIZE} people sharing this household`}
            </Text>
          </View>

          {inviteCode ? (
            <View style={styles.inviteBlock}>
              <Text style={styles.codeLabel}>Share this code</Text>
              <Text style={styles.code}>{inviteCode}</Text>
              <View style={styles.qrWrap}>
                <QRCodeView value={`maloca://join?code=${inviteCode}`} />
              </View>
              <Text style={styles.hint}>
                They can type the code above into their own Maloca app, or scan the QR code
                with their phone's camera to open straight into it.
              </Text>
              <Pressable onPress={handleShare} style={styles.primaryBtn} accessibilityRole="button">
                <Text style={styles.primaryBtnText}>Share via WhatsApp, message, etc.</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handleInvite}
              disabled={busy || full}
              style={[styles.primaryBtn, full && styles.primaryBtnDisabled]}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>{full ? 'Household full' : 'Invite a housemate'}</Text>
              )}
            </Pressable>
          )}
        </>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: spacing.lg },
  back: { ...type.body, fontSize: 15, color: colors.terracotta, marginBottom: spacing.md },
  title: { ...type.title, color: colors.ink, marginBottom: spacing.md },
  hint: { ...type.body, fontSize: 13.5, lineHeight: 19, color: colors.inkLt, marginBottom: spacing.lg },
  primaryBtn: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { ...type.bodyStrong, fontSize: 15, color: colors.white },
  secondaryBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  secondaryBtnText: { ...type.bodyStrong, fontSize: 14, color: colors.terracotta },
  statusCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statusText: { ...type.bodyStrong, fontSize: 14, color: colors.ink, textAlign: 'center' },
  inviteBlock: { alignItems: 'center' },
  codeLabel: { ...type.label, color: colors.inkGhost, marginBottom: spacing.xs },
  code: {
    ...type.display, fontSize: 28, letterSpacing: 4, color: colors.ink, marginBottom: spacing.lg,
  },
  qrWrap: { marginBottom: spacing.lg },
  errorText: { fontSize: 12.5, color: colors.red, textAlign: 'center', marginTop: spacing.sm },
});
