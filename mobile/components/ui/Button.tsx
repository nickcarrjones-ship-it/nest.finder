import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { colors, fonts, radius, spacing } from '../../theme';

type ButtonVariant = 'primary' | 'secondary';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  small?: boolean;
}

/**
 * Mirrors the web app's .btn-primary / .btn-secondary — uppercase,
 * letter-spaced label; ink background with a teal hover on primary,
 * transparent + hairline border on secondary. See css/styles.css:70-87.
 */
export function Button({ label, variant = 'primary', loading, small, disabled, ...pressableProps }: ButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        isPrimary ? styles.primary : styles.secondary,
        pressed && (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
        (disabled || loading) && styles.disabled,
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.cream : colors.inkLt} size="small" />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.primaryLabel : styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { paddingVertical: 13 },
  primary: { backgroundColor: colors.ink },
  primaryPressed: { backgroundColor: colors.teal },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.rule,
  },
  secondaryPressed: { backgroundColor: colors.creamMid },
  disabled: { opacity: 0.5 },
  label: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  primaryLabel: { color: colors.cream },
  secondaryLabel: { color: colors.inkLt },
});
