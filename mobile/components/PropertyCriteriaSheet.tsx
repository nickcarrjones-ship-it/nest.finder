import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './ui/BottomSheet';
import { ValueWheel } from './ValueWheel';
import { colors, fonts, radius, spacing, type } from '../theme';
import { formatPrice, pricesFor } from '../lib/rightmove';
import type {
  ListingChannel,
  PropertyCriteria,
  PropertyFeature,
  Tenure,
} from '../lib/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** What the household already said, if anyone has. */
  initial?: PropertyCriteria;
  onSave: (criteria: PropertyCriteria) => void;
}

/**
 * What kind of place they're after — asked once per household, at the
 * moment it first matters.
 *
 * WHY IT LIVES HERE AND NOT IN SETUP (Nick, 2026-09-06): none of this
 * changes anything the app shows. It doesn't affect which areas are
 * reachable, what the Agent suggests, or how anywhere scores — it is
 * purely the payload for an outbound Rightmove search. Asking for seven
 * fields during setup would be asking for data the app cannot yet use,
 * before anyone has seen it work, in exchange for no visible change; the
 * workplace sheet's own comment ("deliberately light: no budget/beds/baths
 * wizard") is a promise worth keeping. Asked at the point of use instead,
 * it arrives as the question the person is already asking themselves.
 *
 * The one rule that makes that placement safe: the first tap on an area
 * ALWAYS opens this, and a search is never fired from defaults. Defaults
 * exist to make the wheels land somewhere sensible, never to answer on
 * someone's behalf.
 */

const BED_OPTIONS = [0, 1, 2, 3, 4, 5];
const BATH_OPTIONS = [1, 2, 3, 4];

const TENURES: { id: Tenure; label: string }[] = [
  { id: 'freehold', label: 'Freehold' },
  { id: 'leasehold', label: 'Leasehold' },
  { id: 'shareOfFreehold', label: 'Share of freehold' },
];

const FEATURES: { id: PropertyFeature; label: string }[] = [
  { id: 'garden', label: 'Garden' },
  { id: 'parking', label: 'Parking' },
];

/**
 * The draft this sheet edits, which is NOT quite what gets saved: beds and
 * baths start as null, meaning "nobody has said yet".
 *
 * A saved PropertyCriteria always has real numbers, because saving is
 * blocked until they do — so the stored type is unchanged and nothing
 * downstream (the Rightmove URL, the migration, Firebase) has to learn
 * about a third state that only exists while a form is open.
 */
type Draft = Omit<PropertyCriteria, 'minBeds' | 'maxBeds' | 'minBaths' | 'maxBaths'> & {
  minBeds: number | null;
  maxBeds: number | null;
  minBaths: number | null;
  maxBaths: number | null;
};

/**
 * Where the sheet opens for someone who has never filled this in.
 *
 * Price and channel get sensible starting points because a wheel has to
 * sit somewhere and buy/rent decides the scale. Everything BELOW price
 * starts genuinely blank (Nick, 2026-09-21): a pre-ticked "1 to 3
 * bedrooms" is the app answering on someone's behalf and then firing a
 * real search off the back of it, which is the one thing the note at the
 * top of this file promised never to do.
 */
function defaultsFor(channel: ListingChannel): Draft {
  const prices = pricesFor(channel);
  return {
    channel,
    minPrice: prices[0],
    maxPrice: channel === 'rent' ? 2_500 : 750_000,
    minBeds: null,
    maxBeds: null,
    minBaths: null,
    maxBaths: null,
    tenures: [],
    features: [],
    setAt: 0,
  };
}

/** Everything below price that has to be answered before a search can run.
 *  Tenure and must-haves are deliberately NOT in here — Rightmove reads an
 *  absent filter as "no preference", which is a real and common answer. */
function missingAnswers(d: Draft): string[] {
  const missing: string[] = [];
  if (d.minBeds === null || d.maxBeds === null) missing.push('bedrooms');
  if (d.minBaths === null || d.maxBaths === null) missing.push('bathrooms');
  return missing;
}

export function PropertyCriteriaSheet({ visible, onClose, initial, onSave }: Props) {
  // Arrays defaulted defensively as well as in sanitisePropertyCriteria.
  // Firebase does not store empty arrays, so criteria that round-tripped
  // through it come back with tenures/features missing entirely — and this
  // sheet is mounted (hidden) inside every area card, so a missing array is
  // a render crash on opening a card, not a quiet failure in a form nobody
  // had opened yet. Cheap to guard in both places; expensive to get wrong.
  const [draft, setDraft] = useState<Draft>(() => {
    const base: Draft = initial ?? defaultsFor('buy');
    return { ...base, tenures: base.tenures ?? [], features: base.features ?? [] };
  });

  const prices = useMemo(() => pricesFor(draft.channel), [draft.channel]);

  /** Switching buy/rent switches the whole price scale — £750,000 is not a
   *  rent and £2,500 is not a purchase — so the prices reset to that
   *  channel's defaults rather than being clamped into a range where they
   *  would mean something absurd. */
  function setChannel(channel: ListingChannel) {
    if (channel === draft.channel) return;
    const next = defaultsFor(channel);
    setDraft({
      ...draft,
      channel,
      minPrice: next.minPrice,
      maxPrice: next.maxPrice,
      // Tenure is a thing you own, so switching to renting clears it as
      // well as hiding it (Nick, 2026-09-21). Hiding alone would leave a
      // "freehold" ticked from an earlier pass at buying, invisible on
      // screen and still going out in the search.
      tenures: channel === 'rent' ? [] : draft.tenures,
    });
  }

  /** Min and max cannot cross. Whichever one the person just moved is the
   *  one they meant, so the other gives way — nudging the moved value back
   *  would feel like the control fighting them. */
  function setMinPrice(v: number) {
    setDraft((d) => ({ ...d, minPrice: v, maxPrice: Math.max(v, d.maxPrice) }));
  }
  function setMaxPrice(v: number) {
    setDraft((d) => ({ ...d, maxPrice: v, minPrice: Math.min(v, d.minPrice) }));
  }
  /**
   * The unanswered end mirrors the one they just tapped, rather than
   * staying blank. Tapping "From 2" means two bedrooms until they say
   * otherwise, so the form is answerable in two taps instead of four — and
   * this is the app following a real answer, not inventing one before
   * anybody has spoken.
   */
  function setBeds(which: 'min' | 'max', v: number) {
    setDraft((d) => which === 'min'
      ? { ...d, minBeds: v, maxBeds: d.maxBeds === null ? v : Math.max(v, d.maxBeds) }
      : { ...d, maxBeds: v, minBeds: d.minBeds === null ? v : Math.min(v, d.minBeds) });
  }
  function setBaths(which: 'min' | 'max', v: number) {
    setDraft((d) => which === 'min'
      ? { ...d, minBaths: v, maxBaths: d.maxBaths === null ? v : Math.max(v, d.maxBaths) }
      : { ...d, maxBaths: v, minBaths: d.minBaths === null ? v : Math.min(v, d.minBaths) });
  }

  function toggleTenure(id: Tenure) {
    setDraft((d) => ({
      ...d,
      tenures: d.tenures.includes(id) ? d.tenures.filter((t) => t !== id) : [...d.tenures, id],
    }));
  }
  function toggleFeature(id: PropertyFeature) {
    setDraft((d) => ({
      ...d,
      features: d.features.includes(id) ? d.features.filter((f) => f !== id) : [...d.features, id],
    }));
  }

  const priceUnit = draft.channel === 'rent' ? 'per month' : 'total';

  const missing = missingAnswers(draft);
  const canSearch = missing.length === 0;

  return (
    /**
     * Taller than the shared 85% default (Nick, 2026-09-21): this is the
     * longest form in the app and it was showing about half of itself, so
     * bathrooms and tenure lived entirely below the fold with nothing
     * saying they were there.
     */
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="What are you looking for?"
      style={styles.sheet}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        /* Turned back ON. It is the standard "there is more below" signal
           and this form is long enough to need one. */
        showsVerticalScrollIndicator
      >
        <Text style={styles.intro}>
          This sets up your Rightmove searches. Everyone in your household shares it,
          so you only fill it in once.
        </Text>

        <Field label="Renting or buying?">
          <View style={styles.pillRow}>
            <Pill label="Renting" selected={draft.channel === 'rent'} onPress={() => setChannel('rent')} />
            <Pill label="Buying" selected={draft.channel === 'buy'} onPress={() => setChannel('buy')} />
          </View>
        </Field>

        <Field label={`Price - ${priceUnit}`}>
          <View style={styles.wheelRow}>
            <View style={styles.wheelCol}>
              <Text style={styles.wheelCap}>No less than</Text>
              <ValueWheel
                values={prices}
                value={draft.minPrice}
                onChange={setMinPrice}
                format={formatPrice}
                label="Minimum price"
              />
            </View>
            <View style={styles.wheelCol}>
              <Text style={styles.wheelCap}>No more than</Text>
              <ValueWheel
                values={prices}
                value={draft.maxPrice}
                onChange={setMaxPrice}
                format={formatPrice}
                label="Maximum price"
              />
            </View>
          </View>
        </Field>

        <Field label="Bedrooms" required={draft.minBeds === null}>
          <RangeRow
            options={BED_OPTIONS}
            min={draft.minBeds}
            max={draft.maxBeds}
            onMin={(v) => setBeds('min', v)}
            onMax={(v) => setBeds('max', v)}
            format={(n) => (n === 0 ? 'Studio' : String(n))}
          />
        </Field>

        <Field label="Bathrooms" required={draft.minBaths === null}>
          <RangeRow
            options={BATH_OPTIONS}
            min={draft.minBaths}
            max={draft.maxBaths}
            onMin={(v) => setBaths('min', v)}
            onMax={(v) => setBaths('max', v)}
            format={String}
          />
        </Field>

        {/* Buying only. Freehold, leasehold and share of freehold describe
            how you OWN a property — none of them mean anything to a
            renter, and Rightmove's rental search has no tenure filter to
            send them to (Nick, 2026-09-21). */}
        {draft.channel === 'buy' && (
          <Field label="Tenure" hint="Leave blank if you don't mind">
            <View style={styles.pillRow}>
              {TENURES.map((t) => (
                <Pill
                  key={t.id}
                  label={t.label}
                  selected={draft.tenures.includes(t.id)}
                  onPress={() => toggleTenure(t.id)}
                />
              ))}
            </View>
          </Field>
        )}

        <Field label="Must have" hint="Leave blank if you don't mind">
          <View style={styles.pillRow}>
            {FEATURES.map((f) => (
              <Pill
                key={f.id}
                label={f.label}
                selected={draft.features.includes(f.id)}
                onPress={() => toggleFeature(f.id)}
              />
            ))}
          </View>
        </Field>

      </ScrollView>

      {/* Pinned BELOW the scroll view, not inside it (Nick, 2026-09-21).
          Two jobs: the search button is always reachable without scrolling
          to the bottom, and while something is still unanswered it names
          what — which is also the clearest possible "there is more of this
          form below you". */}
      <Pressable
        onPress={() => {
          if (!canSearch) return;
          // Narrowed by canSearch: every one of these is a real number by
          // the time this runs, so what leaves here is an ordinary
          // PropertyCriteria and nothing downstream sees a null.
          onSave({
            ...draft,
            minBeds: draft.minBeds!,
            maxBeds: draft.maxBeds!,
            minBaths: draft.minBaths!,
            maxBaths: draft.maxBaths!,
            setAt: Date.now(),
          });
        }}
        disabled={!canSearch}
        style={[styles.saveBtn, !canSearch && styles.saveBtnOff]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSearch }}
      >
        <Text style={[styles.saveBtnText, !canSearch && styles.saveBtnTextOff]}>
          {canSearch ? 'Search Rightmove' : `Scroll down and choose ${listOf(missing)}`}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

/** "bedrooms" / "bedrooms and bathrooms" — never a comma-spliced list, as
 *  there are only ever two of them. */
function listOf(parts: string[]): string {
  return parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts[0];
}

function Field({
  label, hint, required, children,
}: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {/* Only while it is still unanswered, so it reads as a to-do rather
            than as permanent decoration on a finished form. */}
        {required && <Text style={styles.fieldNeeded}>NEEDED</Text>}
      </View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      {children}
    </View>
  );
}

/** Two rows of numbers — "from" and "up to" — rather than two more wheels.
 *  Bedrooms and bathrooms have six options and four; a wheel is the right
 *  control for sixty-seven prices and the wrong one for four bathrooms. */
function RangeRow({
  options, min, max, onMin, onMax, format,
}: {
  options: number[];
  /** null while nobody has chosen — no pill is lit rather than one being
   *  lit on someone's behalf. */
  min: number | null;
  max: number | null;
  onMin: (v: number) => void;
  onMax: (v: number) => void;
  format: (n: number) => string;
}) {
  return (
    <View style={styles.rangeStack}>
      <View style={styles.rangeLine}>
        <Text style={styles.rangeCap}>From</Text>
        <View style={styles.pillRow}>
          {options.map((n) => (
            <Pill key={n} label={format(n)} selected={min === n} onPress={() => onMin(n)} compact />
          ))}
        </View>
      </View>
      <View style={styles.rangeLine}>
        <Text style={styles.rangeCap}>Up to</Text>
        <View style={styles.pillRow}>
          {options.map((n) => (
            <Pill key={n} label={format(n)} selected={max === n} onPress={() => onMax(n)} compact />
          ))}
        </View>
      </View>
    </View>
  );
}

function Pill({
  label, selected, onPress, compact,
}: { label: string; selected: boolean; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, compact && styles.pillCompact, selected && styles.pillOn]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.pillText, selected && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Overrides BottomSheet's shared 85% — see the note at the render. */
  sheet: { maxHeight: '94%' },
  /**
   * flexShrink rather than a fixed 560: the sheet's own maxHeight is what
   * should decide how tall this gets, and a hard cap meant a big phone
   * showed exactly as little of the form as a small one.
   */
  scroll: { flexShrink: 1 },
  content: { paddingBottom: spacing.lg, gap: spacing.lg },
  intro: { ...type.body, fontSize: 13.5, lineHeight: 19, color: colors.inkMid },

  field: { gap: spacing.xs },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fieldNeeded: {
    ...type.label, fontSize: 9.5, color: colors.teal,
    backgroundColor: colors.tealSoft,
    borderRadius: radius.xs, paddingHorizontal: 5, paddingVertical: 2,
    overflow: 'hidden',
  },
  // Full ink, not a pale grey — these are the questions, and the answers
  // beneath them are what should feel secondary.
  fieldLabel: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink },
  fieldHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMid },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.white,
  },
  pillCompact: { minHeight: 40, paddingHorizontal: spacing.sm, minWidth: 46, alignItems: 'center' },
  pillOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  pillText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  pillTextOn: { color: colors.white },

  wheelRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  wheelCol: { flex: 1, alignItems: 'center', gap: 2 },
  wheelCap: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkMid },

  rangeStack: { gap: spacing.sm },
  rangeLine: { gap: 4 },
  rangeCap: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkMid },

  saveBtn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    // Sits outside the scroll view now, so it needs its own separation
    // from the content sliding underneath it.
    marginTop: spacing.md,
  },
  saveBtnText: { ...type.bodyStrong, fontSize: 15, color: colors.white },
  /** Not just dimmed — an outline, so it reads as a prompt to finish the
   *  form rather than as a button that has broken. */
  saveBtnOff: { backgroundColor: colors.creamMid, borderWidth: 1, borderColor: colors.rule },
  saveBtnTextOff: { color: colors.inkLt },
});
