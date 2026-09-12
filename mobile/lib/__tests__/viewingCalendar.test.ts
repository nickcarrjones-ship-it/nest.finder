import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_DAYS,
  buildCalendar,
  dayKey,
  formatDayHeading,
  startOfDay,
} from '../viewingCalendar';
import type { Viewing } from '../viewings';

/** A booked viewing at a given instant. Only the fields the strip reads
 *  matter, but the whole shape is built so the types stay honest. */
function viewing(id: string, viewingAt: number | null): Viewing {
  return {
    id,
    address: `${id} Some Street`,
    postcode: null,
    lat: null,
    lng: null,
    pinAccurate: false,
    priceText: null,
    priceValue: null,
    bedrooms: null,
    bathrooms: null,
    propertyType: null,
    channel: null,
    listingUrl: null,
    source: 'manual',
    viewingAt,
    notes: null,
    createdAt: 1_000,
    createdBy: 'nick',
  };
}

/** A local-time instant, so the tests read as the phone reads them. */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

const NOW = at(2026, 9, 12, 9, 0); // Sat 12 Sep 2026, 9am

describe('the fortnight ahead', () => {
  it('starts today and runs fourteen days', () => {
    const days = buildCalendar([], NOW);
    assert.equal(days.length, CALENDAR_DAYS);
    assert.equal(days[0].isToday, true);
    assert.equal(days[0].dayOfMonth, 12);
    assert.equal(days[13].dayOfMonth, 25);
    assert.equal(days.filter((d) => d.isToday).length, 1);
  });

  it('steps calendar days, not 24-hour blocks', () => {
    // Adding 86,400,000ms across a clock change lands at 01:00 and every
    // day after it is off by one. British clocks go back on 25 Oct 2026.
    const days = buildCalendar([], at(2026, 10, 20, 12));
    assert.deepEqual(days.map((d) => d.dayOfMonth), [
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1, 2,
    ]);
    for (const day of days) {
      assert.equal(new Date(day.at).getHours(), 0, `${day.key} did not start at midnight`);
    }
  });

  it('marks where the month turns over', () => {
    const days = buildCalendar([], at(2026, 9, 25, 12));
    const first = days.find((d) => d.startsMonth);
    assert.ok(first, 'expected the 1st of October to be marked');
    assert.equal(first.dayOfMonth, 1);
    // The day the strip starts on is never marked, even if it is the 1st.
    assert.equal(buildCalendar([], at(2026, 9, 1, 12))[0].startsMonth, false);
  });

  it('gives each day a weekday letter', () => {
    // 12 Sep 2026 is a Saturday.
    assert.deepEqual(buildCalendar([], NOW).slice(0, 3).map((d) => d.weekday), ['S', 'S', 'M']);
  });
});

describe('which viewings reach the strip', () => {
  it('puts a booked viewing on its own day', () => {
    const days = buildCalendar([viewing('a', at(2026, 9, 14, 10, 30))], NOW);
    assert.deepEqual(days[2].viewings.map((v) => v.id), ['a']);
    assert.equal(days[1].viewings.length, 0);
  });

  it('orders a busy day by time', () => {
    const days = buildCalendar(
      [viewing('late', at(2026, 9, 14, 17)), viewing('early', at(2026, 9, 14, 9))],
      NOW,
    );
    assert.deepEqual(days[2].viewings.map((v) => v.id), ['early', 'late']);
  });

  it('leaves out one with no date — that is not an appointment', () => {
    const days = buildCalendar([viewing('idea', null)], NOW);
    assert.equal(days.reduce((n, d) => n + d.viewings.length, 0), 0);
  });

  it('leaves out one already seen, even if it was earlier today', () => {
    const days = buildCalendar([viewing('done', at(2026, 9, 12, 8))], NOW);
    assert.equal(days[0].viewings.length, 0);
  });

  it('keeps one later today', () => {
    const days = buildCalendar([viewing('soon', at(2026, 9, 12, 18))], NOW);
    assert.deepEqual(days[0].viewings.map((v) => v.id), ['soon']);
  });

  it('leaves out one beyond the fortnight', () => {
    const days = buildCalendar([viewing('far', at(2026, 10, 20, 12))], NOW);
    assert.equal(days.reduce((n, d) => n + d.viewings.length, 0), 0);
  });
});

describe('day keys', () => {
  it('buckets by the local day, not the UTC one', () => {
    // Half past midnight is today, wherever the phone is. Built from UTC
    // parts this lands on yesterday for anyone west of Greenwich — and
    // London is an hour east of UTC for half the year, so this is a
    // British bug too, not only a travelling one.
    assert.equal(dayKey(at(2026, 9, 14, 0, 30)), '2026-09-14');
    assert.equal(dayKey(at(2026, 9, 14, 23, 30)), '2026-09-14');
  });

  it('pads the month and day, so keys sort as text', () => {
    assert.equal(dayKey(at(2026, 1, 5, 12)), '2026-01-05');
  });

  it('winds back to midnight', () => {
    const midnight = startOfDay(at(2026, 9, 14, 17, 45));
    const date = new Date(midnight);
    assert.equal(date.getHours(), 0);
    assert.equal(date.getMinutes(), 0);
    assert.equal(date.getDate(), 14);
  });
});

describe('naming a day', () => {
  it('says Today and Tomorrow rather than the date', () => {
    assert.equal(formatDayHeading(at(2026, 9, 12, 18), NOW), 'Today');
    assert.equal(formatDayHeading(at(2026, 9, 13, 10), NOW), 'Tomorrow');
  });

  it('names anything further out', () => {
    assert.equal(formatDayHeading(at(2026, 9, 17, 10), NOW), 'Thu 17 Sep');
  });

  it('says Tomorrow across the end of a month', () => {
    assert.equal(formatDayHeading(at(2026, 10, 1, 10), at(2026, 9, 30, 12)), 'Tomorrow');
  });
});
