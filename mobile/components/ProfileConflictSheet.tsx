import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useProfileConflictStore } from '../store/profileConflictStore';
import { useProfileStore } from '../store/profileStore';
import { useSetupStore } from '../store/setupStore';
import { useShortlistStore } from '../store/shortlistStore';
import { useAgentChatStore } from '../store/agentChatStore';
import { syncProfileToFirebase } from '../lib/profileSync';
import { hasLifestyleSignal } from '../lib/lifestyleSignal';
import { describeMembers, describeWorkplaces } from '../lib/profileChoice';
import type { Profile } from '../lib/types';

/**
 * "We already have a profile saved — which one did you mean?"
 *
 * Shown only when signing in finds a saved profile that disagrees with real
 * data someone has just entered. Every other sign-in resolves silently.
 *
 * Not dismissible, and no third way out. Until this is answered the app does
 * not know which household it is working for, and every area it could show
 * would be computed for a guess — which is precisely the failure that made
 * this necessary.
 */
export function ProfileConflictSheet() {
  const insets = useSafeAreaInsets();
  const saved = useProfileConflictStore((s) => s.saved);
  const local = useProfileConflictStore((s) => s.local);
  const uid = useProfileConflictStore((s) => s.uid);
  const householdId = useProfileConflictStore((s) => s.householdId);
  const clear = useProfileConflictStore((s) => s.clear);

  const setProfile = useProfileStore((s) => s.setProfile);
  const decideSetup = useSetupStore((s) => s.decide);
  const setShortlist = useShortlistStore((s) => s.setResult);
  const restartChat = useAgentChatStore((s) => s.restart);

  if (!saved || !local || !uid) return null;

  function choose(profile: Profile, overwriteSaved: boolean) {
    setProfile(profile);

    // Whatever was ranked belonged to the household we are NOT using. Left
    // in place it would sit on the map looking like a result for the one
    // they just chose.
    setShortlist([], null);

    if (overwriteSaved) {
      // Starting fresh means the old saved profile stops being the answer
      // for this account, not just for this session — otherwise the same
      // question returns on the next sign-in, forever.
      restartChat();
      syncProfileToFirebase(uid!, profile, householdId ?? null);
    }

    // Deferred from sign-in, because it depends on which profile won.
    decideSetup(!profile.setupDoneAt && !hasLifestyleSignal(profile.lifestyle));
    clear();
  }

  return (
    <Modal visible transparent={false} animationType="slide">
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.title}>You&rsquo;ve got a profile saved</Text>
        <Text style={styles.blurb}>
          This account already has a household saved, and it doesn&rsquo;t match what you just
          entered. Which one would you like to use?
        </Text>

        <ScrollView contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
          <Option
            label="What you just entered"
            who={describeMembers(local)}
            where={describeWorkplaces(local)}
            emphasis
            action="Use this"
            onPress={() => choose(local, true)}
          />
          <Option
            label="Your saved profile"
            who={describeMembers(saved)}
            where={describeWorkplaces(saved)}
            action="Use this instead"
            onPress={() => choose(saved, false)}
          />
        </ScrollView>

        <Text style={[styles.footnote, { marginBottom: insets.bottom + spacing.md }]}>
          Choosing what you just entered replaces the saved one for good.
        </Text>
      </View>
    </Modal>
  );
}

function Option({
  label,
  who,
  where,
  action,
  emphasis,
  onPress,
}: {
  label: string;
  who: string;
  where: string;
  action: string;
  emphasis?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={[styles.card, emphasis && styles.cardEmphasis]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.who}>{who}</Text>
      <Text style={styles.where}>{where}</Text>
      <Pressable
        onPress={onPress}
        style={[styles.button, emphasis && styles.buttonEmphasis]}
        accessibilityRole="button"
      >
        <Text style={[styles.buttonText, emphasis && styles.buttonTextEmphasis]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: spacing.lg },
  title: { ...type.display, color: colors.ink, marginBottom: spacing.sm },
  blurb: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.inkMid,
    marginBottom: spacing.xl,
  },
  options: { gap: spacing.md, paddingBottom: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: spacing.lg,
    gap: 2,
  },
  cardEmphasis: { borderColor: colors.teal, backgroundColor: colors.paper },
  cardLabel: { ...type.label, color: colors.inkGhost, marginBottom: spacing.xs },
  who: { fontFamily: fonts.semibold, fontSize: 17, color: colors.ink },
  where: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkLt },
  button: {
    marginTop: spacing.md,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonEmphasis: { backgroundColor: colors.teal, borderColor: colors.teal },
  buttonText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkMid },
  buttonTextEmphasis: { color: colors.white },
  footnote: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.inkGhost,
    textAlign: 'center',
  },
});
