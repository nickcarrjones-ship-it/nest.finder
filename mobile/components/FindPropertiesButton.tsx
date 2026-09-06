import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { PropertyCriteriaSheet } from './PropertyCriteriaSheet';
import { colors, fonts, radius, spacing, type } from '../theme';
import { canSearchRightmove, rightmoveUrl } from '../lib/rightmove';
import { useProfileStore } from '../store/profileStore';
import type { PropertyCriteria } from '../lib/types';

interface Props {
  area: string;
}

/**
 * The way out of the app and into actual listings.
 *
 * The label is the state: "Find Properties" while the household has never
 * said what it wants, "Rightmove Search" once anyone has (Nick,
 * 2026-09-06). Because the criteria sit on the shared household profile,
 * the second person to open the app finds it already saying "Rightmove
 * Search" — their housemate answered for both of them, which is the point
 * of a household account.
 *
 * The first tap ALWAYS opens the sheet and never fires a search. Defaults
 * are there to give the wheels somewhere sensible to start, not to answer
 * on someone's behalf — a search built from numbers nobody chose would
 * come back wrong and read as the app being broken.
 *
 * Hidden entirely for the handful of areas with no Rightmove location
 * identifier (see lib/rightmove.ts). A missing button is a disappointment;
 * one that searches the wrong county is a broken promise.
 */
export function FindPropertiesButton({ area }: Props) {
  const criteria = useProfileStore((s) => s.profile.propertyCriteria);
  const setPropertyCriteria = useProfileStore((s) => s.setPropertyCriteria);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!canSearchRightmove(area)) return null;

  const hasCriteria = criteria !== undefined;

  async function open(withCriteria: PropertyCriteria) {
    const url = rightmoveUrl(area, withCriteria);
    if (!url) return;
    setFailed(false);
    try {
      // Rightmove's search page is not one of the paths their iOS app
      // claims (verified 2026-09-06), so this opens the browser rather than
      // their app — which is fine: the search still arrives filtered, and
      // Rightmove's own mobile site offers the app handoff itself.
      await Linking.openURL(url);
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <Pressable
        onPress={() => (hasCriteria ? open(criteria) : setSheetOpen(true))}
        onLongPress={() => setSheetOpen(true)}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityHint={
          hasCriteria
            ? 'Opens Rightmove with your saved search. Press and hold to change what you are looking for.'
            : 'Asks what you are looking for, then opens Rightmove'
        }
      >
        <Text style={styles.btnText}>
          {hasCriteria ? 'Rightmove Search' : 'Find Properties'}
        </Text>
      </Pressable>

      {failed && <Text style={styles.error}>Couldn't open Rightmove.</Text>}

      <PropertyCriteriaSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={criteria}
        onSave={(next) => {
          setPropertyCriteria(next);
          setSheetOpen(false);
          open(next);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  btnText: { ...type.bodyStrong, fontSize: 14.5, color: colors.white },
  error: {
    fontFamily: fonts.regular, fontSize: 12.5, color: colors.red,
    textAlign: 'center', marginTop: spacing.xs,
  },
});
