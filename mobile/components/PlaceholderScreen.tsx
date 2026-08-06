import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, type } from '../theme';

/**
 * Temporary stand-in used while screens are being rebuilt natively.
 * Delete once the last real screen replaces it.
 */
export function PlaceholderScreen({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.wordmarkRow}>
        <Text style={styles.wordmark}>MALOCA</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  wordmarkRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  wordmark: {
    ...type.label,
    color: colors.ink,
    fontSize: 14,
    letterSpacing: 4,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: { ...type.title, color: colors.ink },
  subtitle: {
    ...type.body,
    color: colors.inkLt,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
});
