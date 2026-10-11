import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../theme';
import { SignInButtons } from './SignInButtons';

/**
 * What a tab is for, shown in place of the tab while signed out.
 *
 * The tab bar used to be hidden entirely until sign-in, so someone who
 * tapped "Get started" saw a map and nothing else, with Ask, Viewings and
 * Settings out of sight. Apple's review read that as features hidden from
 * reviewers (guideline 5.6, 8 October 2026). Every tab is now visible from
 * the start, and a tab that needs an account says exactly what it does and
 * how to get in.
 */
const ICONS = {
  agent: require('../assets/tab-icons/agent.png'),
  viewings: require('../assets/tab-icons/viewings.png'),
} as const;

interface Props {
  icon: keyof typeof ICONS;
  title: string;
  lead: string;
  points: string[];
  note: string;
}

export function SignInGate({ icon, title, lead, points, note }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <Image source={ICONS[icon]} style={styles.icon} resizeMode="contain" />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.lead}>{lead}</Text>
      </View>

      <View style={styles.points}>
        {points.map((p) => (
          <View key={p} style={styles.point}>
            <View style={styles.dot} />
            <Text style={styles.pointText}>{p}</Text>
          </View>
        ))}
      </View>

      <View style={styles.signIn}>
        <Text style={styles.note}>{note}</Text>
        <SignInButtons />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl },
  head: { gap: spacing.sm },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  icon: { width: 30, height: 30 },
  title: { ...type.display, fontSize: 28, lineHeight: 33, color: colors.ink },
  lead: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.inkMid },
  points: { gap: spacing.md },
  point: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal, marginTop: 7 },
  pointText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.ink },
  signIn: { gap: spacing.md },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkLt },
});
