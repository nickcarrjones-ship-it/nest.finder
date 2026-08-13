import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from './ui/Card';
import { colors, spacing, type } from '../theme';
import type { Member } from '../lib/types';

export interface SelectedArea {
  name: string;
  memberTimes: number[];
}

interface SelectedAreaCardProps {
  area: SelectedArea;
  members: Member[];
  onClose: () => void;
}

/**
 * Mobile equivalent of the web app's area-circle popup (js/map-core.js
 * bindPopup, ~line 207) — deliberately simpler: just the area name and each
 * person's real commute time, no "View area →" button, since the area
 * detail screen it would open to doesn't exist on mobile yet (Week 4).
 */
export function SelectedAreaCard({ area, members, onClose }: SelectedAreaCardProps) {
  const insets = useSafeAreaInsets();

  return (
    <Card elevated style={[styles.card, { bottom: insets.bottom + spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.name}>{area.name}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      {members.map((m, i) => (
        <Text key={m.id} style={styles.commuteLine}>
          {m.name}: <Text style={styles.commuteMins}>{area.memberTimes[i]} min</Text>
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  name: { ...type.bodyStrong, color: colors.ink, flex: 1 },
  close: { ...type.body, color: colors.inkGhost, fontSize: 16, paddingLeft: spacing.sm },
  commuteLine: { ...type.body, color: colors.inkMid, marginTop: 2 },
  commuteMins: { fontWeight: '600', color: colors.ink },
});
