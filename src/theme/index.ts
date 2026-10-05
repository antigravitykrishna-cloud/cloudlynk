import { Platform } from 'react-native';

/** Cloudlynk design tokens. The app is dark-only (userInterfaceStyle "dark" in app.json). */

/** `#RRGGBB` at the given opacity, as an `rgba()` string. Translucent colours derive from tokens. */
export function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

// The two brand hues, and the gradient they form. Everything else is derived.
const BRAND_BLUE = '#2E7DFF';
const BRAND_CYAN = '#00D4FF';

const DANGER = '#FF4D6D';
const WARNING = '#FFB347';
const SUCCESS = '#2ED47A';
const PASTEL_LAVENDER = '#B4A9FF';
const TEXT_SECONDARY = '#9FB0C9';

/** Opacity of the `*Dim` tints (chip and badge backgrounds) and `*Border` outlines. */
const DIM = 0.15;
const BORDER = 0.4;

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
  textSecondary: TEXT_SECONDARY,
  textMuted: '#6B7C97',
  textInverse: '#0B1220',

  // Brand
  brandBlue: BRAND_BLUE,
  brandBlueDim: withAlpha(BRAND_BLUE, DIM),
  brandBlueBorder: withAlpha(BRAND_BLUE, 0.45),
  brandCyan: BRAND_CYAN,
  brandCyanDim: withAlpha(BRAND_CYAN, DIM),

  // Status
  danger: DANGER,
  dangerDim: withAlpha(DANGER, DIM),
  dangerBorder: withAlpha(DANGER, BORDER),
  warning: WARNING,
  warningDim: withAlpha(WARNING, DIM),
  warningBorder: withAlpha(WARNING, BORDER),
  success: SUCCESS,
  successDim: withAlpha(SUCCESS, DIM),
  successBorder: withAlpha(SUCCESS, BORDER),
  neutralDim: withAlpha(TEXT_SECONDARY, 0.12),
  gold: '#FFC65C',

  // Pastels: category chips and avatar fallbacks
  pastelMint: '#7FE7C4',
  pastelLavender: PASTEL_LAVENDER,
  lavenderDim: withAlpha(PASTEL_LAVENDER, DIM),
  pastelPeach: '#FFC49B',
  pastelPink: '#FFA8CC',
  pastelSky: '#8FD3FF',
  pastelButter: '#FFE29A',

  // Absolutes, for scrims over images and video (usually through withAlpha).
  white: '#FFFFFF',
  black: '#000000',
};

/** Payment providers' own brand colours, shown on their buttons in the payment sheet. */
export const PartnerColors = {
  upi: '#FF7A00',
  googlePlay: '#34A853',
  razorpay: '#3395FF',
  sabpaisa: '#1E63D6',
};

/**
 * The brand gradient (blue -> cyan) as an expo-linear-gradient `colors` tuple. Use for primary
 * buttons, the storage meter and the Premium badge, not large surfaces.
 */
export const BrandGradient = [BRAND_BLUE, BRAND_CYAN] as const;

/** Same ramp at low opacity, for card and header washes. */
export const BrandGradientSubtle = [
  withAlpha(BRAND_BLUE, 0.18),
  withAlpha(BRAND_CYAN, 0.06),
] as const;

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
