/**
 * Maloca design tokens — the 4b brand (2026-08-25).
 * Source of truth is the "Maloca app logo concepts" Claude Design doc,
 * Round 04 mark 4b ("the uneven span"): ink #22282E, ground #F2F1EE,
 * teal accent #2E7D7A, terracotta #B4552F, Familjen Grotesk for UI type,
 * IBM Plex Mono for data/labels. This REPLACES the old web-app palette
 * (warm cream / copper / logoRed key) on Nick's instruction to move the
 * whole app onto the 4b colour scheme and font.
 */

export const colors = {
  // Surfaces
  cream: '#F2F1EE', // page background (4b ground)
  creamMid: '#EDE6DA', // hover states, secondary surfaces (doc warm paper)
  creamDk: '#DBD6CC', // dividers on cream, inactive chips
  rule: '#E3E0D9', // 1px borders, hairlines (the doc's own border colour)
  white: '#FFFFFF', // input fields / elevated cards
  paper: '#FCFBF8', // card surface (doc concept-card background)

  // Text
  ink: '#22282E', // primary text, dark header (4b ink)
  inkMid: '#55504A', // body copy, secondary headers (doc body colour)
  inkLt: '#7A746B', // tertiary text, labels (doc note colour)
  inkGhost: '#A9A49A', // placeholder, disabled, section labels

  // Brand. Teal — the mark's counter fill — is THE accent: buttons, active
  // states, slider, the map region, the onboarding tiles. Terracotta is on
  // the 4b palette but is currently UNUSED: in every role it was tried it
  // read as the old copper scheme this palette replaced (Nick, 2026-08-25
  // and again 2026-08-26). Kept as a documented option, not a live token —
  // check with Nick before reintroducing it anywhere.
  teal: '#2E7D7A',
  tealSoft: 'rgba(46,125,122,0.12)',
  tealLine: 'rgba(46,125,122,0.35)',
  terracotta: '#B4552F',
  terracottaSoft: 'rgba(180,85,47,0.12)',
  terracottaLine: 'rgba(180,85,47,0.35)',

  // Area classification
  green: '#4E7A52', // Ideal (doc palette green)
  greenBg: '#EFF3EE',
  greenLine: '#B4C9B5',
  amber: '#D4A843', // Potential (sits with the doc's sand #D9C7A7)
  amberBg: '#FEF9EE',
  red: '#C0392B', // Avoid / errors — crimson, deliberately NOT the brand rust
  redBg: '#FEF0EE',
  redLine: '#F0A8A0',

  // Map pins — upcoming/wishlist/viewed unused today; retune when viewings ship
  pinUpcoming: '#3B82F6',
  pinWishlist: '#D4A843',
  pinViewed: '#9CA3AF',
  pinTop: '#2E7D7A', // AI top picks — unified with the brand teal
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
 * Font family names as expo-font registers them (one family per weight —
 * React Native doesn't synthesize weights for custom faces, so styles set
 * fontFamily and never fontWeight). Loaded in app/_layout.tsx via useFonts;
 * the boot gate there holds the app until they're ready, so nothing ever
 * renders in the system face first.
 */
export const fonts = {
  regular: 'FamiljenGrotesk_400Regular',
  medium: 'FamiljenGrotesk_500Medium',
  semibold: 'FamiljenGrotesk_600SemiBold',
  bold: 'FamiljenGrotesk_700Bold',
  // Real italic face, not a slant: React Native does NOT synthesize
  // fontStyle:'italic' for custom families (it silently renders upright),
  // so emphasis has to name this family instead.
  italic: 'FamiljenGrotesk_400Regular_Italic',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

/**
 * The doc's type treatment: Familjen Grotesk medium with tight (−2.5%)
 * tracking for headings, Plex Mono for the small uppercase labels ("data
 * and labels"). letterSpacing is in px, so the em-relative tracking is
 * pre-multiplied per size.
 */
export const type = {
  // Uppercase letter-spaced labels — now in the brand mono
  label: { fontSize: 11, fontFamily: fonts.monoMedium, letterSpacing: 1.3 },
  tab: { fontSize: 10, fontFamily: fonts.monoMedium, letterSpacing: 0.6 },
  body: { fontSize: 14, fontFamily: fonts.regular },
  bodyStrong: { fontSize: 14, fontFamily: fonts.semibold },
  title: { fontSize: 20, fontFamily: fonts.medium, letterSpacing: -0.5 },
  display: { fontSize: 28, fontFamily: fonts.medium, letterSpacing: -0.7 },
} as const;
