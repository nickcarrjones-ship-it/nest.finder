import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import type { CalendarDay } from '../lib/viewingCalendar';

/**
 * The next fortnight, across the top of the Viewings tab.
 *
 * Fourteen days is the honest span for this: a house hunt is arranged
 * about a week ahead, and a month grid on a phone gives each day a box too
 * small to put anything in. A strip gives every day enough room to say how
 * many viewings are in it, which is the only question being asked of it.
 *
 * Tapping a day with viewings filters the list below to that day; tapping
 * it again clears. Days with nothing in them are inert rather than
 * disabled-looking — an empty Tuesday is not a broken control.
 */
interface Props {
  days: CalendarDay[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}

export function ViewingCalendarStrip({ days, selectedKey, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {days.map((day) => {
        const count = day.viewings.length;
        const selected = day.key === selectedKey;
        return (
          <Pressable
            key={day.key}
            onPress={() => onSelect(selected || count === 0 ? null : day.key)}
            style={[
              styles.day,
              day.isToday && styles.today,
              count > 0 && styles.hasViewings,
              selected && styles.selected,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={
              count === 0
                ? `${day.weekday} ${day.dayOfMonth}, nothing booked`
                : `${day.weekday} ${day.dayOfMonth}, ${count} viewing${count === 1 ? '' : 's'}`
            }
          >
            <Text style={[styles.weekday, selected && styles.selectedText]}>{day.weekday}</Text>
            <Text style={[styles.date, selected && styles.selectedText]}>{day.dayOfMonth}</Text>
            {/* A dot per viewing up to three, then a number — three dots
                still read as "a few" at a glance, four do not. */}
            {count === 0 ? (
              <View style={styles.dotSpacer} />
            ) : count <= 3 ? (
              <View style={styles.dots}>
                {Array.from({ length: count }, (_, i) => (
                  <View key={i} style={[styles.dot, selected && styles.selectedDot]} />
                ))}
              </View>
            ) : (
              <Text style={[styles.many, selected && styles.selectedText]}>{count}</Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 6 },
  day: {
    width: 40,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 2,
  },
  today: { borderColor: colors.rule, backgroundColor: colors.white },
  hasViewings: { backgroundColor: colors.terracottaSoft, borderColor: colors.terracottaLine },
  selected: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },

  weekday: { fontFamily: fonts.monoMedium, fontSize: 9.5, color: colors.inkGhost },
  date: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  selectedText: { color: colors.white },

  dots: { flexDirection: 'row', gap: 2, height: 6, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.terracotta },
  selectedDot: { backgroundColor: colors.white },
  dotSpacer: { height: 6 },
  many: { fontFamily: fonts.monoMedium, fontSize: 9, color: colors.terracotta, height: 6, lineHeight: 8 },
});
