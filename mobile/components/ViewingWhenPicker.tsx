import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ValueWheel } from './ValueWheel';
import { colors, fonts, radius, spacing } from '../theme';

/**
 * When the viewing is.
 *
 * Three ValueWheels rather than a native date picker, and that is a
 * deliberate saving: @react-native-community/datetimepicker is a native
 * module, so adding it would mean rebuilding the dev client and, on both
 * stores, shipping a new binary before anyone could use this. The wheel
 * this app already has does the job, looks like the rest of the app, and
 * costs nothing to add.
 *
 * The range is what a viewing actually is — the next eight weeks, between
 * 8am and 8pm, on the quarter hour. Agents do not book viewings at 3:07am
 * in fourteen months, and every value a wheel does not offer is a value
 * nobody has to scroll past.
 */

interface Props {
  /** Null means "no date yet", which is a real answer, not an empty one. */
  value: number | null;
  onChange: (value: number | null) => void;
}

const DAYS_AHEAD = 56;
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const MINUTES = [0, 15, 30, 45];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Midnight today, in the phone's own timezone — the anchor every day
 *  offset is measured from, so "day 0" is always today and never yesterday
 *  in a different timezone. */
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(dayStart: number): string {
  const date = new Date(dayStart);
  const today = startOfToday();
  const diff = Math.round((dayStart - today) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${suffix}`;
}

export function ViewingWhenPicker({ value, onChange }: Props) {
  const today = useMemo(startOfToday, []);
  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => today + i * 24 * 60 * 60 * 1000),
    [today],
  );

  // What the wheels show while nothing is booked: a sensible default that
  // is only committed if they actually turn the picker on.
  const current = value === null ? null : new Date(value);
  const dayValue = current ? new Date(current).setHours(0, 0, 0, 0) : days[0];
  const hourValue = current ? current.getHours() : 10;
  const minuteValue = current ? current.getMinutes() : 0;

  function commit(day: number, hour: number, minute: number) {
    const next = new Date(day);
    next.setHours(hour, minute, 0, 0);
    onChange(next.getTime());
  }

  if (value === null) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>WHEN</Text>
        <View style={styles.notBookedRow}>
          <Text style={styles.notBooked}>No date yet - one to see</Text>
          <Pressable
            style={styles.setBtn}
            onPress={() => commit(days[0], 10, 0)}
            accessibilityRole="button"
          >
            <Text style={styles.setBtnText}>Set a date</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>WHEN</Text>
        <Pressable onPress={() => onChange(null)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.clear}>Clear</Text>
        </Pressable>
      </View>
      <View style={styles.wheels}>
        <ValueWheel
          values={days}
          value={dayValue}
          onChange={(d) => commit(d, hourValue, minuteValue)}
          format={dayLabel}
          width={140}
        />
        <ValueWheel
          values={HOURS}
          value={hourValue}
          onChange={(h) => commit(dayValue, h, minuteValue)}
          format={hourLabel}
          width={70}
        />
        <ValueWheel
          values={MINUTES}
          value={minuteValue}
          onChange={(m) => commit(dayValue, hourValue, m)}
          format={(m) => `:${String(m).padStart(2, '0')}`}
          width={62}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1.3, color: colors.inkGhost },
  clear: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkLt },
  wheels: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  notBookedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  notBooked: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMid, flexShrink: 1 },
  setBtn: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  setBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
});
