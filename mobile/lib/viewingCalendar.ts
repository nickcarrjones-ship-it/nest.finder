/**
 * The two weeks ahead, for the strip at the top of the Viewings tab.
 *
 * PURE, and everything here works in the PHONE'S OWN timezone rather than
 * UTC — the opposite of the calendar feed (functions/lib/calendarFeed.js),
 * and for the opposite reason. The feed is read by other people's software
 * in unknown places, so it states an absolute instant. This is read by
 * someone glancing at their own week, and "Thursday" has to mean the
 * Thursday they are living in.
 */

import { viewingStatus, type Viewing } from './viewings';

export const CALENDAR_DAYS = 14;

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Midnight at the start of the day `ms` falls in, locally. */
export function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * A stable key for a calendar day.
 *
 * Built from the local date parts rather than toISOString, which would
 * bucket a 00:30 viewing into the previous day for anyone west of
 * Greenwich — and London spends half the year an hour off UTC, so this is
 * wrong in Britain too, not only abroad.
 */
export function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export interface CalendarDay {
  key: string;
  /** Midnight, local, for this day. */
  at: number;
  /** "M", "T", "W" — one letter, because fourteen of these share a screen. */
  weekday: string;
  dayOfMonth: number;
  isToday: boolean;
  /** First day of a month other than the one the strip starts in, so the
   *  strip can mark where the month turns over rather than leaving someone
   *  to wonder whether "1" is next week or next year. */
  startsMonth: boolean;
  viewings: Viewing[];
}

/**
 * The next fortnight, starting today, with each day's booked viewings.
 *
 * Only BOOKED viewings appear. A viewing with no date is not an
 * appointment (see ViewingStatus) and one already seen is history — a
 * two-week look-ahead that quietly included both would be a different
 * thing wearing a calendar's clothes.
 */
export function buildCalendar(viewings: Viewing[], now = Date.now()): CalendarDay[] {
  const today = startOfDay(now);
  const startMonth = new Date(today).getMonth();

  const byDay = new Map<string, Viewing[]>();
  for (const viewing of viewings) {
    if (viewing.viewingAt === null) continue;
    if (viewingStatus(viewing, now) !== 'booked') continue;
    const key = dayKey(viewing.viewingAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(viewing);
    else byDay.set(key, [viewing]);
  }

  const days: CalendarDay[] = [];
  for (let i = 0; i < CALENDAR_DAYS; i += 1) {
    // Built by adding DAYS to a date, not milliseconds to a number: adding
    // 24 hours across the end of March lands at 01:00 and every day after
    // it shifts by one. setDate steps calendar days and handles the clocks.
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const at = date.getTime();
    const key = dayKey(at);
    const dayViewings = (byDay.get(key) ?? []).sort(
      (a, b) => (a.viewingAt ?? 0) - (b.viewingAt ?? 0),
    );
    days.push({
      key,
      at,
      weekday: WEEKDAYS[date.getDay()],
      dayOfMonth: date.getDate(),
      isToday: i === 0,
      startsMonth: date.getDate() === 1 && date.getMonth() !== startMonth,
      viewings: dayViewings,
    });
  }
  return days;
}

/** "Thu 18 Sep" — for the heading over a selected day. */
const LONG_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDayHeading(at: number, now = Date.now()): string {
  if (dayKey(at) === dayKey(now)) return 'Today';
  const tomorrow = new Date(startOfDay(now));
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dayKey(at) === dayKey(tomorrow.getTime())) return 'Tomorrow';
  const date = new Date(at);
  return `${LONG_WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
