import { Platform } from 'react-native';

/**
 * Cloudlynk design tokens. Dark-only app (userInterfaceStyle "dark"). Some legacy names describe
 * old colours -- `accentOrange` is the brand blue and `accentGreen` the brand cyan; prefer
 * `brandBlue` / `brandCyan` in new code.
 */

// The two brand hues, and the gradient they form. Everything else is derived.
const BRAND_BLUE = '#2E7DFF';
const BRAND_CYAN = '#00D4FF';

export const Colors = {
  // Surfaces — a navy ramp, not a grey one. Each step is a real hue shift as
  // well as a lightness shift, so elevation reads on an OLED panel where a
  // pure-grey ramp collapses into black.
  bg: '#0B1220',
  surface: '#121C2E',
  surfaceElevated: '#182437',
  surfaceHover: '#1F2D44',
  border: '#22304A',
  borderStrong: '#31425F',
  // Text
  text: '#FFFFFF',
  textSecondary: '#9FB0C9',
  textMuted: '#6B7C97',
  textInverse: '#0B1220',
  // Brand. Prefer these two names in new code.
  brandBlue: BRAND_BLUE,
  brandCyan: BRAND_CYAN,
  // Accents. Named for the old palette's hues, carrying the new one — see the
  // header. `accentOrange` is the primary action colour; `accentGreen` is the
  // secondary/highlight.
  accentOrange: BRAND_BLUE,
  accentOrangeDim: 'rgba(46, 125, 255, 0.15)',
  accentGreen: BRAND_CYAN,
  accentGreenDim: 'rgba(0, 212, 255, 0.15)',
  // Semantic. danger and warning are unchanged — they were already hue-correct
  // and they must not read as brand colours. success moves off the neon green,
  // which was unreadable next to cyan and looked like an error state.
  danger: '#FF4D6D',
  warning: '#FFB347',
  success: '#2ED47A',
  info: BRAND_CYAN,
  // Pastels — retuned to sit on navy rather than black. Used for category
  // chips and avatar fallbacks.
  pastelMint: '#7FE7C4',
  pastelLavender: '#B4A9FF',
  pastelPeach: '#FFC49B',
  pastelPink: '#FFA8CC',
  pastelSky: '#8FD3FF',
  pastelButter: '#FFE29A',
  // Compatibility aliases
  brand: BRAND_BLUE,
  brandLight: 'rgba(46, 125, 255, 0.15)',
  card: '#182437',
  cardHover: '#1F2D44',
  accent: BRAND_BLUE,
  accentDim: 'rgba(46, 125, 255, 0.15)',
  accentBorder: 'rgba(46, 125, 255, 0.45)',
  blue: BRAND_BLUE,
  blueDim: 'rgba(46, 125, 255, 0.15)',
  purple: '#B4A9FF',
  purpleDim: 'rgba(180, 169, 255, 0.15)',
  dangerDim: 'rgba(255, 77, 109, 0.15)',
  warningDim: 'rgba(255, 179, 71, 0.15)',
  successDim: 'rgba(46, 212, 122, 0.15)',
  feedCard: '#182437',
  gold: '#FFC65C',
  goldBorder: '#E5A93C',
  inactive: '#6B7C97',
  inactiveBg: '#182437',
  white: '#FFFFFF',
  black: '#000000',
};

/**
 * The brand gradient (blue -> cyan) as an expo-linear-gradient `colors` tuple. Use for primary
 * buttons, the storage meter and the Premium badge, not large surfaces.
 */
export const BrandGradient = [BRAND_BLUE, BRAND_CYAN] as const;

/** Same ramp at low opacity, for card and header washes. */
export const BrandGradientSubtle = ['rgba(46, 125, 255, 0.18)', 'rgba(0, 212, 255, 0.06)'] as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  // Small chips and badges need a tighter corner than sm. It was already in
  // use in 18 places as a bare 4 — naming it makes it part of the system
  // rather than a value people re-guess.
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

/** Type scale aligned to Apple's text styles. Nothing below 11, Apple's legibility floor. */
export const FontSize = {
  xs: 11, // caption2 — the floor
  sm: 12, // caption1
  md: 13, // footnote
  base: 14,
  subhead: 15, // subheadline
  lg: 16, // callout
  xl: 18,
  title: 20, // title3
  xxl: 22, // title2
  xxxl: 28, // title1
};

export const FontWeight = {
  regular: '400' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const Shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    android: {
      elevation: 4,
    },
  }),
  brand: Platform.select({
    ios: {
      // Tinted rather than black: a blue CTA lifting off navy needs a coloured
      // shadow to read as raised at all. A black one just muddies it.
      shadowColor: BRAND_BLUE,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
    android: {
      elevation: 8,
    },
  }),
};

// Names in the app's icon set, not emoji glyphs — a file list rendered with
// system emoji looked different on every device and could not take the
// category colour beside it.
export const CATEGORY_ICONS: Record<string, string> = {
  photo: 'image',
  video: 'film',
  document: 'document',
  audio: 'music',
  other: 'package',
};

// Categories were all one colour before, which made the icon the only
// distinguishing mark in a dense file list. Distinct hues let a category be
// recognised before the label is read — the file list in the store screenshots
// relies on exactly this.
export const CATEGORY_COLORS: Record<string, string> = {
  photo: '#8FD3FF',
  video: BRAND_BLUE,
  document: '#B4A9FF',
  audio: '#7FE7C4',
  other: '#9FB0C9',
};

export const CATEGORY_DIM: Record<string, string> = {
  photo: 'rgba(143, 211, 255, 0.15)',
  video: 'rgba(46, 125, 255, 0.15)',
  document: 'rgba(180, 169, 255, 0.15)',
  audio: 'rgba(127, 231, 196, 0.15)',
  other: 'rgba(159, 176, 201, 0.15)',
};

// Shorthand aliases used in hooks and screens
export const blueDim = Colors.blueDim;
export const purpleDim = Colors.purpleDim;
export const dangerDim = Colors.dangerDim;
export const warningDim = Colors.warningDim;
export const accentBorder = Colors.accentBorder;
export const accentDim = Colors.accentDim;
