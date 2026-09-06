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

/** Where the wheels open for someone who has never filled this in. Chosen
 *  to be obviously adjustable rather than quietly authoritative — a wide
 *  range reads as "change me", a narrow one reads as an answer. */
function defaultsFor(channel: ListingChannel): PropertyCriteria {
  const prices = pricesFor(channel);
  return {
    channel,
    minPrice: prices[0],
    maxPrice: channel === 'rent' ? 2_500 : 750_000,
    minBeds: 1,
    maxBeds: 3,
    minBaths: 1,
    maxBaths: 2,
    tenures: [],
    features: [],
    setAt: 0,
  };
}

export function PropertyCriteriaSheet({ visible, onClose, initial, onSave }: Props) {
  const [draft, setDraft] = useState<PropertyCriteria>(initial ?? defaultsFor('buy'));

  const prices = useMemo(() => pricesFor(draft.channel), [draft.channel]);

  /** Switching buy/rent switches the whole price scale — £750,000 is not a
   *  rent and £2,500 is not a purchase — so the prices reset to that
   *  channel's defaults rather than being clamped into a range where they
   *  would mean something absurd. */
  function setChannel(channel: ListingChannel) {
    if (channel === draft.channel) return;
    const next = defaultsFor(channel);
    setDraft({ ...draft, channel, minPrice: next.minPrice, maxPrice: next.maxPrice });
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
  function setBeds(which: 'min' | 'max', v: number) {
    setDraft((d) => which === 'min'
      ? { ...d, minBeds: v, maxBeds: Math.max(v, d.maxBeds) }
      : { ...d, maxBeds: v, minBeds: Math.min(v, d.minBeds) });
  }
  function setBaths(which: 'min' | 'max', v: number) {
    setDraft((d) => which === 'min'
      ? { ...d, minBaths: v, maxBaths: Math.max(v, d.maxBaths) }
      : { ...d, maxBaths: v, minBaths: Math.min(v, d.minBaths) });
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

  return (
    <BottomSheet visible={visible} onClose={onClose} title="What are you looking for?">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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

        <Field label={`Price — ${priceUnit}`}>
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

        <Field label="Bedrooms">
          <RangeRow
            options={BED_OPTIONS}
            min={draft.minBeds}
            max={draft.maxBeds}
            onMin={(v) => setBeds('min', v)}
            onMax={(v) => setBeds('max', v)}
            format={(n) => (n === 0 ? 'Studio' : String(n))}
          />
        </Field>

        <Field label="Bathrooms">
          <RangeRow
            options={BATH_OPTIONS}
            min={draft.minBaths}
            max={draft.maxBaths}
            onMin={(v) => setBaths('min', v)}
            onMax={(v) => setBaths('max', v)}
            format={String}
          />
        </Field>

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

        <Pressable
          onPress={() => onSave({ ...draft, setAt: Date.now() })}
          style={styles.saveBtn}
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>Search Rightmove</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
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
  min: number;
  max: number;
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
  scroll: { maxHeight: 560 },
  content: { paddingBottom: spacing.lg, gap: spacing.lg },
  intro: { ...type.body, fontSize: 13.5, lineHeight: 19, color: colors.inkMid },

  field: { gap: spacing.xs },
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
    marginTop: spacing.xs,
  },
  saveBtnText: { ...type.bodyStrong, fontSize: 15, color: colors.white },
});
