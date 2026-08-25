import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors, radius, spacing, type } from '../theme';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PAD = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** What the wheel is picking — read out to screen readers, not shown
   *  visually (the caller's own label sits above the wheel). */
  label?: string;
}

/**
 * A real scroll-driven wheel (Nick's call, 2026-08-24 — "a specific minute
 * by minute scrolling wheel", not the coarse chip options first proposed),
 * not @react-native-picker/picker: that's a native module not currently
 * installed, and adding one means another prebuild + EAS rebuild cycle
 * before it's even testable — the exact cost CommuteSlider's own PanResponder
 * choice was already made to avoid. FlatList's scroll math is exact and
 * deterministic (fixed item height + getItemLayout), unlike the freeform
 * curve geometry that went wrong twice in the welcome hero — this is much
 * lower-risk to get right without seeing it render.
 *
 * Snap-to-item + a centred highlight band, with items fading and shrinking
 * by distance from centre — the classic wheel-picker read, driven by the
 * same "one shared Animated.Value interpolated per rendered item" pattern
 * as WelcomeHero's own animations, just driven by scroll position instead
 * of time.
 */
export function MinuteWheel({ value, onChange, min = 1, max = 20, label }: Props) {
  const values = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);
  const scrollY = useRef(new Animated.Value(0)).current;
  const listRef = useRef<Animated.FlatList<number>>(null);
  // Suppresses onMomentumScrollEnd firing from the initial programmatic
  // scrollToOffset below, which would otherwise immediately re-report
  // whatever value was already passed in as though the user had picked it.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const idx = Math.max(0, values.indexOf(value));
    listRef.current?.scrollToOffset({ offset: idx * ITEM_HEIGHT, animated: false });
    const t = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(t);
    // Positions once, at mount, from whatever value the caller opened with —
    // not on every value change, or a programmatic update would fight scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!settled) return;
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    if (values[clamped] !== value) onChange(values[clamped]);
  }

  return (
    <View style={styles.wrap} accessibilityLabel={label}>
      <View pointerEvents="none" style={styles.centreBand} />
      <Animated.FlatList
        ref={listRef}
        data={values}
        keyExtractor={(v) => String(v)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PAD }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, i) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * i, index: i })}
        renderItem={({ item, index }) => {
          const offset = index * ITEM_HEIGHT;
          const inputRange = [offset - ITEM_HEIGHT * 2, offset, offset + ITEM_HEIGHT * 2];
          const opacity = scrollY.interpolate({ inputRange, outputRange: [0.28, 1, 0.28], extrapolate: 'clamp' });
          const scale = scrollY.interpolate({ inputRange, outputRange: [0.78, 1, 0.78], extrapolate: 'clamp' });
          return (
            <Animated.View style={[styles.item, { opacity, transform: [{ scale }] }]}>
              <Text style={styles.itemText}>{item}</Text>
            </Animated.View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: WHEEL_HEIGHT, width: 100 },
  centreBand: {
    position: 'absolute',
    left: 0, right: 0, top: PAD, height: ITEM_HEIGHT,
    backgroundColor: colors.terracottaSoft,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.terracottaLine,
    borderRadius: radius.sm,
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { ...type.title, fontSize: 18, color: colors.ink },
});
