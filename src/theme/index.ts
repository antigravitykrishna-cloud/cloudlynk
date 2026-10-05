import { Platform } from 'react-native';

/** Cloudlynk design tokens. The app is dark-only (userInterfaceStyle "dark" in app.json). */

// The two brand hues, and the gradient they form. Everything else is derived.
const BRAND_BLUE = '#2E7DFF';
const BRAND_CYAN = '#00D4FF';

export const Colors = {
  // Surfaces: a navy ramp (each step shifts hue as well as lightness, so
  // elevation stays visible on OLED screens).
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

  // Brand
  brandBlue: BRAND_BLUE,
  brandBlueDim: 'rgba(46, 125, 255, 0.15)',
  brandBlueBorder: 'rgba(46, 125, 255, 0.45)',
  brandCyan: BRAND_CYAN,
  brandCyanDim: 'rgba(0, 212, 255, 0.15)',

  // Status
  danger: '#FF4D6D',
  dangerDim: 'rgba(255, 77, 109, 0.15)',
  warning: '#FFB347',
  warningDim: 'rgba(255, 179, 71, 0.15)',
  success: '#2ED47A',
  successDim: 'rgba(46, 212, 122, 0.15)',
  gold: '#FFC65C',

  // Pastels: category chips and avatar fallbacks
  pastelMint: '#7FE7C4',
  pastelLavender: '#B4A9FF',
  lavenderDim: 'rgba(180, 169, 255, 0.15)',
  pastelPeach: '#FFC49B',
  pastelPink: '#FFA8CC',
  pastelSky: '#8FD3FF',
  pastelButter: '#FFE29A',

  white: '#FFFFFF',
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
