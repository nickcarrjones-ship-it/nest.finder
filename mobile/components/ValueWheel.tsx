import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors, radius, type } from '../theme';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PAD = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2;

interface Props {
  /** The options, in the order they should appear. Ascending, by convention
   *  of everything that uses this. */
  values: number[];
  value: number;
  onChange: (value: number) => void;
  /** How each option reads on the wheel — prices want "£1.25m", minutes
   *  want "12". */
  format?: (value: number) => string;
  width?: number;
  /** Read out to screen readers; the caller's own visible label sits above. */
  label?: string;
}

/**
 * A scroll-driven wheel over an arbitrary list of values.
 *
 * Same mechanics and the same look as MinuteWheel — snap-to-item, a centred
 * highlight band, items fading and shrinking by distance from centre — but
 * over a list the caller supplies rather than a contiguous min..max range.
 * Property prices are not evenly spaced (£25k apart at £300k, £250k apart
 * at £3m — see BUY_PRICES in lib/rightmove.ts), so a range of numbers
 * cannot express them.
 *
 * KNOWN DUPLICATION, deliberate and temporary: this repeats MinuteWheel's
 * scroll maths almost exactly, and MinuteWheel should end up as a thin
 * wrapper around this one. That refactor is being kept out of this feature
 * on purpose — MinuteWheel sits in the commute entry flow, and rewriting a
 * working part of the commute path while building something unrelated is
 * how you break the one thing in this app that must not break. Merge them
 * in their own commit, with the commute flow retested.
 */
export function ValueWheel({ values, value, onChange, format, width = 120, label }: Props) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const listRef = useRef<Animated.FlatList<number>>(null);
  // Suppresses onMomentumScrollEnd firing from the initial programmatic
  // scroll below, which would otherwise report the opening value straight
  // back as though someone had chosen it.
  const [settled, setSettled] = useState(false);

  // Nearest option rather than indexOf: a saved price can fall between two
  // steps if the scale is ever retuned, and landing on the closest one beats
  // silently snapping to the cheapest.
  const startIndex = useMemo(() => {
    if (values.length === 0) return 0;
    let best = 0;
    for (let i = 1; i < values.length; i += 1) {
      if (Math.abs(values[i] - value) < Math.abs(values[best] - value)) best = i;
    }
    return best;
  }, [values, value]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: startIndex * ITEM_HEIGHT, animated: false });
    const t = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(t);
    // Positions once, at mount, from whatever the caller opened with — not
    // on every change, or a programmatic update would fight the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!settled) return;
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    if (values[clamped] !== value) onChange(values[clamped]);
  }

  return (
    <View style={[styles.wrap, { width }]} accessibilityLabel={label}>
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
          const opacity = scrollY.interpolate({
            inputRange, outputRange: [0.28, 1, 0.28], extrapolate: 'clamp',
          });
          const scale = scrollY.interpolate({
            inputRange, outputRange: [0.78, 1, 0.78], extrapolate: 'clamp',
          });
          return (
            <Animated.View style={[styles.item, { opacity, transform: [{ scale }] }]}>
              <Text style={styles.itemText} numberOfLines={1}>
                {format ? format(item) : item}
              </Text>
            </Animated.View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: WHEEL_HEIGHT },
  centreBand: {
    position: 'absolute',
    left: 0, right: 0, top: PAD, height: ITEM_HEIGHT,
    backgroundColor: colors.tealSoft,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.tealLine,
    borderRadius: radius.sm,
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { ...type.title, fontSize: 17, color: colors.ink },
});
