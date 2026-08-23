import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '../../theme';
import { useProfileStore } from '../../store/profileStore';
import { WALK_OPTIONS_KM } from '../../lib/commuteSettings';
import { useAuthStore } from '../../store/authStore';
import { ActivityIndicator } from 'react-native';

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
  const walkHomeKm = useProfileStore((s) => s.profile.walkHomeKm);
  const updateCommuteSettings = useProfileStore((s) => s.updateCommuteSettings);
  const { user, status, error, signInWithGoogle, signOut } = useAuthStore();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
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
        <>
          <Pressable
            onPress={() => signInWithGoogle()}
            disabled={status === 'signing-in'}
            style={[styles.googleBtn, status === 'signing-in' && styles.googleBtnBusy]}
            accessibilityRole="button"
          >
            {status === 'signing-in' ? (
              <ActivityIndicator size="small" color={colors.ink} />
            ) : (
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            )}
          </Pressable>
          {status === 'error' && error && (
            <Text style={styles.accountError}>Couldn't sign in: {error}</Text>
          )}
        </>
      )}

      <Text style={[styles.label, styles.secondSection]}>Walk to home station</Text>
      <Text style={styles.hint}>
        Used by the classic station-circle layer (Stations toggle on the map). The
        walking-catchment region works this out per station automatically.
      </Text>
      <View style={styles.chipRow}>
        {WALK_OPTIONS_KM.map((opt) => (
          <Pressable
            key={opt.km}
            onPress={() => updateCommuteSettings({ walkHomeKm: opt.km })}
            style={[styles.chip, walkHomeKm === opt.km && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected: walkHomeKm === opt.km }}
          >
            <Text style={[styles.chipText, walkHomeKm === opt.km && styles.chipTextSelected]}>
              {opt.label.replace(/\s*\(.*\)/, '')}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: spacing.lg },
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
  accountEmail: { fontSize: 12, color: colors.inkLt },
  signOutBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  signOutText: { fontSize: 13, fontWeight: '600', color: colors.red },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.rule,
    borderRadius: radius.md, paddingVertical: spacing.md, marginBottom: spacing.sm,
  },
  googleBtnBusy: { opacity: 0.6 },
  googleBtnText: { ...type.bodyStrong, color: colors.ink },
  accountError: { fontSize: 12.5, color: colors.red, marginBottom: spacing.sm },
  hint: { fontSize: 12.5, color: colors.inkLt, lineHeight: 17, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.white,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { ...type.body, fontSize: 13, color: colors.inkMid },
  chipTextSelected: { color: colors.cream, fontWeight: '600' },
});
