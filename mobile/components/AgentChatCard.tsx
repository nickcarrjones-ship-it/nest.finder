import { Dimensions, StyleSheet } from 'react-native';
import { BottomSheet } from './ui/BottomSheet';
import { AgentChatView } from './AgentChatView';

interface AgentChatCardProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The Map's compact entry point into the Agent conversation — a ~⅓-screen
 * card, customer-service-widget style, so the map (and the picks it's
 * already updating live) stays visible underneath while you talk. Same
 * AgentChatView, same store, as the full-screen Agent tab — just a shorter
 * container.
 */
export function AgentChatCard({ visible, onClose }: AgentChatCardProps) {
  // No sheet `title` here — AgentChatView already carries its own heading
  // ("What are you looking for?"), and stacking a second "Maloca Agent"
  // label above it just ate space this compact card can't spare.
  return (
    <BottomSheet visible={visible} onClose={onClose} style={styles.sheet}>
      <AgentChatView />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { height: Dimensions.get('window').height * 0.42, maxHeight: '58%' },
});
