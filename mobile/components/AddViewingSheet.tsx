import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet, Button } from './ui';
import { ViewingWhenPicker } from './ViewingWhenPicker';
import { colors, fonts, radius, spacing, type } from '../theme';
import { lookupListing, ListingLookupError } from '../lib/listingLookup';
import {
  looksLikeRightmoveUrl,
  viewingFromListing,
  viewingFromManual,
  type ListingDetails,
  type Viewing,
} from '../lib/viewings';
import { useViewings } from '../hooks/useViewings';

/**
 * Paste a Rightmove link, get a viewing.
 *
 * The link is looked up the moment one is recognised, without a button —
 * pasting IS the instruction, and asking someone to paste and then press
 * "go" is asking them to say the same thing twice.
 *
 * Every failure lands in the same place: the manual form, pre-filled with
 * whatever was recovered. Rightmove will change their page format again
 * (they already have once), and on the day they do this screen has to
 * degrade into "type it in" rather than into a dead end. That is also why
 * the manual route is reachable on purpose, not only as a fallback —
 * someone with a listing from anywhere else can still record a viewing.
 */
interface Props {
  visible: boolean;
  onClose: () => void;
}

type Mode = 'paste' | 'looking' | 'found' | 'manual';

export function AddViewingSheet({ visible, onClose }: Props) {
  const { save, uid } = useViewings();

  const [mode, setMode] = useState<Mode>('paste');
  const [url, setUrl] = useState('');
  const [listing, setListing] = useState<ListingDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [priceText, setPriceText] = useState('');
  const [notes, setNotes] = useState('');
  const [viewingAt, setViewingAt] = useState<number | null>(null);

  // Which URL has already been sent, so a re-render or a stray keystroke
  // inside an already-valid link never fires a second lookup.
  const lookedUp = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMode('paste');
    setUrl('');
    setListing(null);
    setError(null);
    setAddress('');
    setPriceText('');
    setNotes('');
    setViewingAt(null);
    lookedUp.current = null;
  }, [visible]);

  useEffect(() => {
    const trimmed = url.trim();
    if (!looksLikeRightmoveUrl(trimmed) || lookedUp.current === trimmed) return;
    lookedUp.current = trimmed;

    let cancelled = false;
    setMode('looking');
    setError(null);

    lookupListing(trimmed)
      .then((found) => {
        if (cancelled) return;
        setListing(found);
        setAddress(found.address);
        setPriceText(found.priceText ?? '');
        setMode('found');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Whatever went wrong, they can still record the viewing. The
        // message says what happened; the form below is the way on.
        setError(
          err instanceof ListingLookupError
            ? err.message
            : "Couldn't read that listing. You can still add it by hand.",
        );
        setMode('manual');
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  function commit() {
    if (!uid) return;
    let viewing: Viewing;
    if (mode === 'found' && listing) {
      viewing = viewingFromListing(listing, { createdBy: uid, viewingAt, notes: notes.trim() || null });
      // They may have corrected the address the listing gave.
      if (address.trim() && address.trim() !== listing.address) viewing.address = address.trim();
    } else {
      viewing = viewingFromManual(
        { address, priceText, listingUrl: url },
        { createdBy: uid, viewingAt, notes: notes.trim() || null },
      );
    }
    save(viewing);
    onClose();
  }

  const canSave = mode === 'found' ? Boolean(address.trim()) : mode === 'manual' && Boolean(address.trim());

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add a viewing">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <View style={styles.field}>
          <Text style={styles.label}>RIGHTMOVE LINK</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="Paste the link from Rightmove"
            placeholderTextColor={colors.inkGhost}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={mode !== 'looking'}
          />
          {mode === 'paste' && (
            <Text style={styles.hint}>
              We'll read the address and price straight off the listing. Or{' '}
              <Text style={styles.hintLink} onPress={() => setMode('manual')}>
                add one by hand
              </Text>
              .
            </Text>
          )}
        </View>

        {mode === 'looking' && (
          <View style={styles.looking}>
            <ActivityIndicator size="small" color={colors.teal} />
            <Text style={styles.lookingText}>Reading the listing…</Text>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {mode === 'found' && listing && (
          <View style={styles.found}>
            <Text style={styles.foundAddress}>{address || listing.address}</Text>
            <View style={styles.foundRow}>
              {listing.priceText && <Text style={styles.price}>{listing.priceText}</Text>}
              {(listing.bedrooms !== null || listing.propertyType) && (
                <Text style={styles.meta}>
                  {[listing.bedrooms !== null ? `${listing.bedrooms} bed` : null, listing.propertyType]
                    .filter(Boolean)
                    .join(' ')}
                </Text>
              )}
            </View>
            {/* Says which kind of pin it is rather than implying every one
                is surveyed — Rightmove tells us, so we can be honest. */}
            <Text style={styles.pinNote}>
              {listing.pinAccurate
                ? 'Pin placed exactly where the listing says it is'
                : 'Pin is approximate - the listing only gives an area'}
            </Text>
          </View>
        )}

        {(mode === 'found' || mode === 'manual') && (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>ADDRESS</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Where is it?"
                placeholderTextColor={colors.inkGhost}
              />
            </View>

            {mode === 'manual' && (
              <View style={styles.field}>
                <Text style={styles.label}>PRICE</Text>
                <TextInput
                  style={styles.input}
                  value={priceText}
                  onChangeText={setPriceText}
                  placeholder="£"
                  placeholderTextColor={colors.inkGhost}
                />
                <Text style={styles.hint}>
                  Added by hand, so this one won't get a pin on the map - there's no
                  location to put it at.
                </Text>
              </View>
            )}

            <ViewingWhenPicker value={viewingAt} onChange={setViewingAt} />

            <View style={styles.field}>
              <Text style={styles.label}>NOTES</Text>
              <TextInput
                style={[styles.input, styles.notes]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything to remember - agent's name, the code for the gate…"
                placeholderTextColor={colors.inkGhost}
                multiline
              />
            </View>
          </>
        )}

        <View style={styles.actions}>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Button label="Save viewing" onPress={commit} disabled={!canSave} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.lg },
  field: { gap: spacing.xs },
  label: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1.3, color: colors.inkGhost },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkLt, lineHeight: 17 },
  hintLink: { fontFamily: fonts.semibold, color: colors.teal },

  looking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lookingText: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMid },

  error: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.red, lineHeight: 19 },

  found: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  foundAddress: { ...type.bodyStrong, fontSize: 15, color: colors.ink },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  price: { fontFamily: fonts.semibold, fontSize: 15, color: colors.teal },
  meta: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.inkLt },
  pinNote: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.inkLt },

  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cancel: { fontFamily: fonts.regular, fontSize: 15, color: colors.inkLt },
});
