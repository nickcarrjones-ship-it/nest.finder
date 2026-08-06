/**
 * Maloca design tokens.
 * Ported from design-system/Maloca Design System/colors_and_type.css so the
 * app and the web version stay visually identical. Keep the two in sync.
 */

export const colors = {
  // Surfaces
  cream: '#F7F4EF', // page background
  creamMid: '#EDE9E2', // hover states, secondary surfaces
  creamDk: '#DDD8CF', // dividers on cream, inactive chips
  rule: '#E2DDD6', // 1px borders, hairlines
  white: '#FFFFFF', // input fields / elevated cards

  // Text
  ink: '#1A1714', // primary text, dark header
  inkMid: '#3D3A35', // body copy, secondary headers
  inkLt: '#7A7670', // tertiary text, labels
  inkGhost: '#B8B4AD', // placeholder, disabled, section labels

  // Brand
  copper: '#C8722A',
  copperSoft: 'rgba(200,114,42,0.12)',
  copperLine: 'rgba(200,114,42,0.35)',
  logoRed: '#C8291A',

  // Area classification
  green: '#3DAA6A', // Ideal
  greenBg: '#F0FAF4',
  greenLine: '#A8DEC0',
  amber: '#D4A843', // Potential
  amberBg: '#FEF9EE',
  red: '#C0392B', // Avoid / errors
  redBg: '#FEF0EE',
  redLine: '#F0A8A0',

  // Map pins
  pinUpcoming: '#3B82F6', // viewings scheduled
  pinWishlist: '#D4A843', // want to view
  pinViewed: '#9CA3AF', // already seen
  pinTop: '#A855F7', // AI top picks
} as const;

export const radius = {
  xs: 4, // small tags, pills
  sm: 6, // small buttons, chips
  md: 8, // cards, primary buttons
  lg: 10, // larger cards
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * The web app uses the Outfit typeface. Loading it as a real font is a later
 * task (expo-font); until then these sizes and weights carry the hierarchy.
 */
export const type = {
  // Uppercase letter-spaced labels — the web app's signature small-caps look
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.4 },
  tab: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6 },
  body: { fontSize: 14, fontWeight: '400' },
  bodyStrong: { fontSize: 14, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700' },
  display: { fontSize: 28, fontWeight: '700' },
} as const;
