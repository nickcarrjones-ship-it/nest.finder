import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';
import { BottomSheet, Button } from './ui';
import { colors, fonts, radius, spacing, type } from '../theme';
import { getCalendarLink, type CalendarLink } from '../lib/calendarLink';

/**
 * Puts the household's viewings in the calendar they already look at.
 *
 * The sheet exists to do three things and refuses to do a fourth:
 *
 *   1. Add the calendar to THIS phone — one tap, webcal:// hands it to the
 *      calendar app and the app takes over from there.
 *   2. Send the link to the other person, through the OS share sheet. That
 *      is the actual job most of the time: one person sets it up, both
 *      people want it. Copying lives in that sheet too, which is why there
 *      is no separate copy button — and why this costs no new native
 *      module and no rebuild.
 *   3. Say, in the open, what the link is and what refreshing it depends
 *      on. Neither is small print: one is a credential, the other is the
 *      reason a last-minute viewing may not show up.
 *
 * The fourth thing — showing the raw URL as selectable text — is
 * deliberately not here. It is 90 characters of hex that nobody should be
 * transcribing, and putting it on screen invites exactly the screenshot
 * that hands it to someone else.
 */
interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CalendarSyncSheet({ visible, onClose }: Props) {
  const [link, setLink] = useState<CalendarLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fetched when the sheet opens rather than held on the screen behind it:
  // minting a token is a write, and it should happen because someone asked
  // for their calendar, not because they opened the viewings tab.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setError(null);
    setBusy(true);
    getCalendarLink()
      .then((got) => { if (live) setLink(got); })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [visible]);

  async function subscribe() {
    if (!link) return;
    try {
      await Linking.openURL(link.webcalUrl);
    } catch {
      setError('Your phone wouldn’t open the calendar app. Try sending yourself the link instead.');
    }
  }

  async function send() {
    if (!link) return;
    try {
      await Share.share({
        message: `Our Maloca viewings calendar — add this and every viewing we book turns up in your calendar:\n\n${link.url}`,
      });
    } catch {
      // Share sheet dismissed without picking anything — not an error.
    }
  }

  function confirmRegenerate() {
    Alert.alert(
      'Create a new link?',
      'The old link stops working straight away. Anyone using it — including your own calendar, and anyone else you sent it to — will need the new one.',
      [
        { text: 'Keep this link', style: 'cancel' },
        {
          text: 'Create new',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setError(null);
            getCalendarLink({ regenerate: true })
              .then(setLink)
              .catch((e: Error) => setError(e.message))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Viewings in your calendar">
      <View style={styles.body}>
        <Text style={styles.intro}>
          Add this once and every viewing you book shows up in your calendar — yours and
          whoever else you send it to. Nothing to install, and it keeps working.
        </Text>

        {busy && !link ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.teal} />
            <Text style={styles.loadingText}>Getting your link…</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {link ? (
          <>
            <View style={styles.actions}>
              <Button label="Add to my calendar" onPress={subscribe} disabled={busy} />
              <Button label="Send to someone" variant="secondary" onPress={send} disabled={busy} />
            </View>

            {/* Both of these are real limits, said once, plainly. Neither
                belongs in a help page nobody opens. */}
            <View style={styles.note}>
              <Text style={styles.noteTitle}>Two things worth knowing</Text>
              <Text style={styles.noteBody}>
                Your calendar decides how often it checks for updates — usually every
                hour or so. A viewing booked at the last minute might not appear in time.
              </Text>
              <Text style={styles.noteBody}>
                Anyone with the link can see your viewings without signing in. Only send it
                to people you'd show the list to.
              </Text>
            </View>

            <Button
              label="Create a new link"
              variant="secondary"
              small
              onPress={confirmRegenerate}
              loading={busy}
            />
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.lg },
  intro: { ...type.body, color: colors.inkMid, lineHeight: 20 },

  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loadingText: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMid },

  error: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.red, lineHeight: 19 },

  actions: { gap: spacing.sm },

  note: {
    backgroundColor: colors.creamMid,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  noteTitle: { ...type.label, fontSize: 11, color: colors.inkLt },
  noteBody: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMid, lineHeight: 18 },
});
