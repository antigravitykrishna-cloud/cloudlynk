import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Colors } from '../constants/theme';

type Props = {
  size?: number;
  /**
   * `mark` draws the cloud + play glyph alone, for a surface that already has
   * a background. `tile` puts it on the navy rounded square — the app-icon
   * lockup — for when the logo sits on an arbitrary colour (a photo, a video
   * still) and needs its own ground to stay legible.
   */
  variant?: 'mark' | 'tile';
};

/**
 * The Cloudlynk mark, drawn rather than rasterised.
 *
 * This used to be `<Image source={require('../assets/icon.png')} />`, i.e. the
 * 512px launcher icon scaled down — soft at the 24-32px sizes it is actually
 * used at, and impossible to recolour. As vector it is sharp at every size,
 * costs no asset, and takes its colours from the theme, so the next palette
 * change reaches it too.
 *
 * assets/icon.png is untouched and is still the launcher icon; Android and the
 * store both need a raster. This is only what the app itself draws.
 */
export function CloudlynkLogo({ size = 32, variant = 'mark' }: Props) {
  // Gradient ids are scoped to their own <Svg>, so two logos on one screen do
  // not collide and this does not need to be unique per instance.
  const gradId = 'cloudlynkBrand';

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={Colors.brandBlue} />
          <Stop offset="1" stopColor={Colors.brandCyan} />
        </LinearGradient>
      </Defs>

      {variant === 'tile' && (
        <Rect x="0" y="0" width="100" height="100" rx="24" fill={Colors.bg} />
      )}

      {/* Cloud silhouette: three lobes over a flat base, as one closed path so
          the gradient sweeps the whole shape instead of restarting per lobe. */}
      <Path
        d="M30 74
           A18 18 0 0 1 28.5 38.5
           A21 21 0 0 1 67 30.5
           A17 17 0 0 1 71 74
           Z"
        fill={`url(#${gradId})`}
      />

      {/* Play button knocked out in the ground colour, so the triangle reads
          as a hole in the cloud rather than a sticker on top of it. */}
      <Circle cx="50" cy="55" r="16" fill={Colors.bg} />
      <Path d="M45 46.5 L61 55 L45 63.5 Z" fill={`url(#${gradId})`} />
    </Svg>
  );
}
