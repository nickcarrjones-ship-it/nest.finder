import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';

interface Props {
  visible: boolean;
  onContinue: () => void;
}

/** How long before Continue can be tapped (Nick, 2026-10-05: "minimum 5 seconds"). */
const HOLD_SECONDS = 5;

/**
 * "Copy the link, paste it into Viewings", shown once, the first time
 * someone heads off to Rightmove (Nick, 2026-10-05).
 *
 * The Viewings tab can read a pasted Rightmove link into a full viewing,
 * address, price and a pin on the map, but nothing ever told anyone at the
 * moment it matters: the moment they leave for Rightmove and start finding
 * places. Held for five seconds so it is read rather than tapped through;
 * the button counts down so the wait is visibly on purpose, not the app
 * hanging.
 */
export function ListingTipModal({ visible, onContinue }: Props) {
  const [left, setLeft] = useState(HOLD_SECONDS);
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setLeft(HOLD_SECONDS);
    fill.setValue(0);
    const run = Animated.timing(fill, {
      toValue: 1,
      duration: HOLD_SECONDS * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    run.start();
    const tick = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      run.stop();
      clearInterval(tick);
    };
  }, [visible, fill]);

  const ready = left === 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's back button: nothing until the wait is over, then the
      // same as Continue.
      onRequestClose={() => { if (ready) onContinue(); }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>BEFORE YOU GO</Text>
          <Text style={styles.title}>Found one you like? Bring it back here</Text>

          <View style={styles.steps}>
            <Step n={1} text="On the listing, tap Share and copy the link." />
            <Step n={2} text="Come back to Maloca and open the Viewings tab." icon />
            <Step n={3} text="Paste it in. We'll fill in the address and price and pin it on your map." />
          </View>

          <Pressable
            onPress={() => { if (ready) onContinue(); }}
            disabled={!ready}
            style={[styles.btn, !ready && styles.btnWaiting]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
          >
            {!ready && (
              <Animated.View
                style={[
                  styles.btnFill,
                  { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                ]}
              />
            )}
            <Text style={[styles.btnText, !ready && styles.btnTextWaiting]}>
              {ready ? 'Continue to Rightmove' : `Continue in ${left}`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Step({ n, text, icon }: { n: number; text: string; icon?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={styles.num}>
        <Text style={styles.numText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
      {icon && (
        // The real tab icon, so it is recognised on the tab bar afterwards.
        <Image source={require('../assets/tab-icons/viewings.png')} style={styles.tabIcon} resizeMode="contain" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(34,40,46,0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: colors.ink,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  kicker: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1.4, color: colors.teal },
  title: { ...type.title, fontSize: 20, lineHeight: 25, color: colors.ink },
  steps: { gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: colors.tealLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { fontFamily: fonts.bold, fontSize: 13, color: colors.teal },
  stepText: { flex: 1, fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 20, color: colors.inkMid },
  tabIcon: { width: 22, height: 22 },
  btn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    overflow: 'hidden',
  },
  /** Waiting: pale, filling with teal as the seconds pass. */
  btnWaiting: { backgroundColor: colors.creamDk },
  btnFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.tealLine },
  btnText: { ...type.bodyStrong, fontSize: 15, color: colors.white },
  btnTextWaiting: { color: colors.inkMid },
});
