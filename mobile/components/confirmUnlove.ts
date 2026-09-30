import { Alert } from 'react-native';
import { useProfileStore } from '../store/profileStore';

/**
 * Take an area off the loved list, after asking (Nick, 2026-09-30). One
 * function so the heart on a map card and the button on the area's detail
 * card ask the same question and do the same thing. Syncs to Firebase with
 * the rest of the profile, so the household's other phones see it too.
 */
export function confirmUnlove(area: string, onDone?: () => void): void {
  Alert.alert(`Remove ${area} from your loved areas?`, "It can still come up as a suggestion.", [
    { text: 'Keep', style: 'cancel' },
    {
      text: 'Remove',
      style: 'destructive',
      onPress: () => {
        useProfileStore.getState().unloveArea(area);
        onDone?.();
      },
    },
  ]);
}
