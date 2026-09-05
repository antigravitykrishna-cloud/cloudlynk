import { Platform } from 'react-native';

export const Colors = {
  // Surfaces
  bg: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1C1C1C',
  surfaceHover: '#262626',
  border: '#2A2A2A',
  borderStrong: '#3A3A3A',
  // Text
  text: '#FFFFFF',
  textSecondary: '#A8A8A8',
  textMuted: '#6E6E6E',
  textInverse: '#0A0A0A',
  // Accent neons
  accentOrange: '#FF6B00',
  accentOrangeDim: 'rgba(255, 107, 0, 0.15)',
  accentGreen: '#39FF14',
  accentGreenDim: 'rgba(57, 255, 20, 0.15)',
  // Semantic
  danger: '#FF4D6D',
  warning: '#FFB347',
  success: '#39FF14',
  info: '#7DD3FC',
  // Pastels
  pastelMint: '#A7F3D0',
  pastelLavender: '#C4B5FD',
  pastelPeach: '#FED7AA',
  pastelPink: '#FBCFE8',
  pastelSky: '#BAE6FD',
  pastelButter: '#FEF3C7',
  // Compatibility aliases
  brand: '#FF6B00',
  brandLight: 'rgba(255, 107, 0, 0.15)',
  card: '#1C1C1C',
  cardHover: '#262626',
  accent: '#FF6B00',
  accentDim: 'rgba(255, 107, 0, 0.15)',
  accentBorder: 'rgba(255, 107, 0, 0.4)',
  blue: '#7DD3FC',
  blueDim: 'rgba(125, 211, 252, 0.15)',
  purple: '#C4B5FD',
  purpleDim: 'rgba(196, 181, 253, 0.15)',
  dangerDim: 'rgba(255, 77, 109, 0.15)',
  warningDim: 'rgba(255, 179, 71, 0.15)',
  successDim: 'rgba(57, 255, 20, 0.15)',
  feedCard: '#1C1C1C',
  gold: '#FFB347',
  goldBorder: '#FF9F1C',
  inactive: '#6E6E6E',
  inactiveBg: '#1C1C1C',
  white: '#FFFFFF',
  black: '#000000',
};

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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

export const FontSize = {
  xs: 10,
  sm: 11,
  md: 13,
  base: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
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
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
    },
    android: {
      elevation: 8,
    },
  }),
};

export const CATEGORY_ICONS: Record<string, string> = {
  photo: '🖼️',
  video: '🎬',
  document: '📄',
  audio: '🎵',
  other: '📦',
};

export const CATEGORY_COLORS: Record<string, string> = {
  photo: '#FF6B00',
  video: '#FF6B00',
  document: '#FF6B00',
  audio: '#FF6B00',
  other: '#FF6B00',
};

export const CATEGORY_DIM: Record<string, string> = {
  photo: 'rgba(255, 107, 0, 0.15)',
  video: 'rgba(255, 107, 0, 0.15)',
  document: 'rgba(255, 107, 0, 0.15)',
  audio: 'rgba(255, 107, 0, 0.15)',
  other: 'rgba(255, 107, 0, 0.15)',
};

// Shorthand aliases used in hooks and screens
export const blueDim = Colors.blueDim;
export const purpleDim = Colors.purpleDim;
export const dangerDim = Colors.dangerDim;
export const warningDim = Colors.warningDim;
export const accentBorder = Colors.accentBorder;
export const accentDim = Colors.accentDim;
