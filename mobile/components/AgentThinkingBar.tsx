import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

/**
 * What sits where the picks are while a new ranking is being worked out.
 *
 * It replaces them rather than sitting above them, and that is the point.
 * Finishing the conversation used to leave the PREVIOUS run's ten areas on
 * screen — unchanged, unlabelled, and indistinguishable from an answer —
 * for as long as the debounce and the API call took. The app looked like it
 * had ignored everything just said (Nick, 2026-09-01).
 *
 * Showing nothing would be honest but alarming; showing the old list is
 * neither. This is the third option: say what is happening, in the place
 * the answer will appear.
 */
export function AgentThinkingBar() {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="small" color={colors.teal} />
      <View style={styles.text}>
        <Text style={styles.lead}>Maloca Agent is cookin'</Text>
        <Text style={styles.sub}>Your areas will appear here in a moment.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  text: { flex: 1, gap: 1 },
  lead: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.inkLt },
});
