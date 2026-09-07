import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme';
import { toneFor } from '../lib/ratingTone';
import schoolData from '../assets/data/area-schools.json';

type Era = 'legacy' | 'ungraded' | 'reportcard';

interface Rating {
  era: Era;
  headline: string;
  /** reportcard only — every category Ofsted actually graded, never just
   *  the headline. See the header comment in scripts/build-schools.mjs. */
  categories?: Record<string, string>;
}

interface School {
  name: string;
  phase: string;
  distanceKm: number;
  /** Null for independent schools. ISI, which inspects most of them, does
   *  not issue grades at all — it reports whether each standard is met —
   *  so there is nothing here comparable to an Ofsted judgement, and an
   *  invented one would be exactly the unverifiable claim this data was
   *  built to avoid. */
  rating: Rating | null;
  independent?: boolean;
}

const AREAS = (schoolData as unknown as { areas: Record<string, School[]> }).areas;

interface Props {
  /** Same key space as area-parks.json and the rest of the similarity
   *  data — built from stations.json, matched by RankedArea.neighbourhood. */
  area: string;
}

/**
 * The nearest real schools to an area, each with its actual Ofsted
 * judgement — Nick's requirement (2026-08-31): "a named school with a real
 * judgement, not a derived schools score. A number nobody can check is
 * exactly the kind of claim this project exists to avoid."
 *
 * Probed 2026-09-02 (docs/data-sources.md) and built 2026-09-02
 * (scripts/build-schools.mjs). The thing the probe surfaced: Ofsted
 * abolished single-word grades in September 2025, so "the rating" is now
 * three incompatible things depending on when a school was last inspected.
 * This component is where that gets resolved on screen — see SchoolRow.
 *
 * Renders nothing when the area has no rated mainstream school within
 * reach, which is the honest state for 22 of 585 areas: no badge, no
 * "no data" message, just absence, the same rule WhyThisArea follows for
 * evidence it does not have.
 */
export function SchoolsNearby({ area }: Props) {
  const schools = AREAS[area];
  if (!schools || schools.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>SCHOOLS NEARBY</Text>
      {schools.map((school) => (
        <SchoolRow key={school.name} school={school} />
      ))}
    </View>
  );
}

function SchoolRow({ school }: { school: School }) {
  const [expanded, setExpanded] = useState(false);
  const { rating } = school;
  /**
   * An independent school has no rating, and gets none invented for it.
   * ISI — which inspects most of them — reports whether each standard is
   * met rather than issuing a grade, so there is no Outstanding/Good
   * equivalent to show. It says what it is and how far away, and lets the
   * reader take it from there.
   */
  if (!rating) {
    return (
      <View style={styles.row}>
        <View style={styles.rowHead}>
          <View style={styles.nameBlock}>
            <Text style={styles.name} numberOfLines={1}>{school.name}</Text>
            <Text style={styles.meta}>
              {school.phase} · {school.distanceKm}km · independent
            </Text>
          </View>
        </View>
      </View>
    );
  }
  const tone = toneFor(rating.headline);

  // Report-card schools are the one case with something worth expanding
  // into — legacy and ungraded schools already show their whole judgement
  // in the headline, so the row is not pressable for them at all.
  const expandable = rating.era === 'reportcard' && !!rating.categories;

  return (
    <Pressable
      style={styles.row}
      onPress={() => expandable && setExpanded((v) => !v)}
      disabled={!expandable}
    >
      <View style={styles.rowHead}>
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>{school.name}</Text>
          <Text style={styles.meta}>{school.phase} · {school.distanceKm}km</Text>
        </View>
        <View style={[styles.badge, BADGE[tone]]}>
          <Text style={[styles.badgeText, BADGE_TEXT[tone]]} numberOfLines={1}>
            {rating.headline}
          </Text>
        </View>
      </View>

      {/* The report card in full. Never optional to reach — collapsing a
          nine-category judgement down to "Achievement: Strong standard"
          and stopping there would be exactly the invented rollup this
          feature exists to avoid; the headline is a way IN to the real
          judgement, not a replacement for it. */}
      {expandable && expanded && (
        <View style={styles.categories}>
          {Object.entries(rating.categories!).map(([label, value]) => (
            <View key={label} style={styles.categoryRow}>
              <Text style={styles.categoryLabel}>{label}</Text>
              <Text style={[styles.categoryValue, { color: BADGE_TEXT[toneFor(value)].color }]}>
                {value}
              </Text>
            </View>
          ))}
        </View>
      )}
      {expandable && (
        <Text style={styles.expandHint}>
          {expanded ? 'Hide the full report card' : 'See all 9 categories'}
        </Text>
      )}
    </Pressable>
  );
}

// green/amber/red — the same tokens WhyThisArea's match badge uses, though
// not the same vocabulary: match strength has no red (nothing on a
// suggestion list is a warning), where an Inadequate school genuinely is
// one. Sharing the palette keeps "how good is this" reading consistently
// without pretending the two scales mean the same thing.
const BADGE = StyleSheet.create({
  good: { backgroundColor: colors.greenBg, borderColor: colors.greenLine },
  mixed: { backgroundColor: colors.amberBg, borderColor: colors.creamDk },
  concern: { backgroundColor: colors.redBg, borderColor: colors.redLine },
});
const BADGE_TEXT = StyleSheet.create({
  good: { color: colors.green },
  mixed: { color: colors.amber },
  concern: { color: colors.red },
});

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md, gap: spacing.sm },
  eyebrow: { ...type.label, color: colors.inkGhost },
  row: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: colors.white,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameBlock: { flex: 1, gap: 1 },
  name: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 11, color: colors.inkLt },
  badge: {
    maxWidth: 130,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 10.5 },
  categories: { marginTop: spacing.sm, gap: 4 },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  categoryLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMid, flex: 1 },
  categoryValue: { fontFamily: fonts.semibold, fontSize: 12 },
  expandHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.teal,
    marginTop: spacing.xs,
    textDecorationLine: 'underline',
  },
});
