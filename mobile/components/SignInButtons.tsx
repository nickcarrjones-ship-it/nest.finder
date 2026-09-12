import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, fonts, radius, spacing } from '../theme';
import { useAuthStore } from '../store/authStore';
import { isAppleSignInAvailable } from '../lib/appleSignIn';

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
}

export function SignInButtons({ googleLabel = 'Continue with Google' }: Props) {
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signInWithApple = useAuthStore((s) => s.signInWithApple);

  // Asked rather than inferred from Platform.OS: an iPhone old enough to
  // lack Sign in with Apple must not be shown a button that cannot work.
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    if (Platform.OS !== 'ios') return;
    void isAppleSignInAvailable().then((ok) => { if (live) setAppleAvailable(ok); });
    return () => { live = false; };
  }, []);

  const busy = status === 'signing-in';

  return (
    <View style={styles.wrap}>
      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radius.md}
          style={styles.appleBtn}
          onPress={() => void signInWithApple()}
        />
      )}

      <Pressable
        onPress={() => void signInWithGoogle()}
        disabled={busy}
        style={[styles.googleBtn, busy && styles.busy]}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.ink} />
        ) : (
          <Text style={styles.googleBtnText}>{googleLabel}</Text>
        )}
      </Pressable>

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
  googleBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
  },
  busy: { opacity: 0.6 },
  googleBtnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.red, lineHeight: 18 },
});
