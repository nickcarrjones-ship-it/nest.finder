import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { useAuthStore } from '../store/authStore';
import { getAppleAuth, isAppleSignInAvailable } from '../lib/appleSignIn';

/**
 * The two ways into an account, in one place.
 *
 * Apple's guideline 4.8 requires that where a third-party sign-in is
 * offered, an equivalent option exists that lets someone withhold their
 * real email — and "equivalent" covers prominence, not just presence, so
 * the two sit together at the same size rather than one being tucked
 * underneath the other.
 *
 * Apple's own button component is used rather than a hand-built one. Their
 * guidelines are specific about its appearance and a lookalike is a
 * routine rejection; it also localises itself, which a hand-built one
 * would not.
 *
 * There are several places to sign in (welcome, settings, the household
 * screen), and a shared component is what stops one of them quietly
 * offering only Google after some future edit — which is exactly the
 * shape of the thing App Review catches.
 */
interface Props {
  /** What the Google button says. The Apple button's wording is Apple's. */
  googleLabel?: string;
  /**
   * Full-height, filled-teal treatment for a screen whose whole job is
   * signing in — the unlock screen, where this is the single call to
   * action under a teal hero and a white outlined button reads as an
   * afterthought.
   *
   * Only the Google button changes. Apple's is drawn by Apple's own
   * component and its appearance is theirs to dictate; what matches is
   * the HEIGHT, so neither reads as the lesser option, which is what
   * guideline 4.8 means by an equivalent choice.
   */
  prominent?: boolean;
}

export function SignInButtons({ googleLabel = 'Continue with Google', prominent }: Props) {
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInWithApple = useAuthStore((s) => s.signInWithApple);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  /**
   * Email and password, folded away under a small link (Nick, 2026-10-05).
   * It exists for the App Review account, which cannot use Apple or Google,
   * so it is deliberately quiet: everyone else should never notice it.
   *
   * On every sign-in screen, the full-screen unlock page included (Nick,
   * 2026-10-07): a reviewer who taps "Get started" reaches that page, and
   * without it had no way to use the email login. The unlock page makes
   * room for the keyboard itself (components/UnlockSheet.tsx).
   */
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const canEmail = email.trim().length > 3 && password.length > 0 && status !== 'signing-in';

  // Asked rather than inferred from Platform.OS: an iPhone old enough to
  // lack Sign in with Apple — or a binary built before the native module
  // was added — must not be shown a button that cannot work. Apple's own
  // button component is reached through the same lazy load for the same
  // reason: importing it directly here would crash the app at launch on
  // any build that predates it (see lib/appleSignIn.ts).
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    if (Platform.OS !== 'ios') return;
    void isAppleSignInAvailable().then((ok) => { if (live) setAppleAvailable(ok); });
    return () => { live = false; };
  }, []);

  const busy = status === 'signing-in';
  const appleAuth = appleAvailable ? getAppleAuth() : null;

  return (
    <View style={styles.wrap}>
      {appleAuth && (
        <appleAuth.AppleAuthenticationButton
          buttonType={appleAuth.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={appleAuth.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={prominent ? radius.lg : radius.md}
          style={[styles.appleBtn, prominent && styles.appleBtnTall]}
          onPress={() => void signInWithApple()}
        />
      )}

      <Pressable
        onPress={() => void signInWithGoogle()}
        disabled={busy}
        style={[styles.googleBtn, prominent && styles.googleBtnProminent, busy && styles.busy]}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={prominent ? colors.white : colors.ink} />
        ) : (
          <Text style={[styles.googleBtnText, prominent && styles.googleBtnTextProminent]}>
            {googleLabel}
          </Text>
        )}
      </Pressable>

      {!emailOpen && (
        <Pressable onPress={() => setEmailOpen(true)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.emailLink}>Sign in with email</Text>
        </Pressable>
      )}

      {emailOpen && (
        <View style={styles.emailForm}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.inkGhost}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            autoFocus
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.inkGhost}
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => { if (canEmail) void signInWithEmail(email, password); }}
          />
          <Pressable
            onPress={() => { if (canEmail) void signInWithEmail(email, password); }}
            disabled={!canEmail}
            style={[styles.emailBtn, !canEmail && styles.busy]}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.emailBtnText}>Sign in</Text>
            )}
          </Pressable>
        </View>
      )}

      {status === 'error' && error && (
        <Text style={styles.error}>Couldn't sign in: {error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, width: '100%' },
  // Matched heights, so neither reads as the lesser option.
  appleBtn: { height: 48, width: '100%' },
  appleBtnTall: { height: 54 },
  googleBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
  },
  googleBtnProminent: {
    height: 54,
    backgroundColor: colors.teal,
    borderColor: colors.teal,
    borderRadius: radius.lg,
  },
  busy: { opacity: 0.6 },
  googleBtnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  googleBtnTextProminent: {
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
    color: colors.white,
  },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.red, lineHeight: 18 },
  emailLink: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.inkLt,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  emailForm: { gap: spacing.sm, marginTop: spacing.xs },
  input: {
    height: 48,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  emailBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
    borderRadius: radius.md,
  },
  emailBtnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
});
