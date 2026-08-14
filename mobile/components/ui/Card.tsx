import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface CardProps extends ViewProps {
  /** Adds a soft drop shadow, matching --shadow-card in the web design system. */
  elevated?: boolean;
}

/**
 * Mirrors the hairline-bordered cards used throughout the web app
 * (e.g. .vw-card in css/styles.css:590-593): 1px rule border, 10px radius,
 * a slightly-off-white surface so it reads as a "card" against the cream
 * page background.
 */
export function Card({ elevated, style, children, ...viewProps }: CardProps) {
  return (
    <View style={[styles.base, elevated && styles.elevated, style]} {...viewProps}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.lg,
    backgroundColor: '#FAFAF9',
    padding: spacing.md,
  },
  elevated: {
    borderWidth: 0,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4, // Android shadow equivalent
  },
});
