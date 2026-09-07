import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';
import { Colors } from '../constants/theme';

// A stroke-based icon set, drawn here rather than pulled from a library.
//
// The app used emoji for every piece of UI chrome — ☁️ for the Cloud tab, 🛡️
// for Admin, 💎 for Premium. Emoji are rendered by the *system* font, so they
// look different on every phone (Samsung, Pixel and Xiaomi each ship their own
// set), they cannot inherit the brand colour, and at tab-bar size they read as
// clip-art. That is the single clearest "unfinished app" signal left in the UI.
//
// @expo/vector-icons is not a dependency and adding one overnight risks the
// native build, but react-native-svg is already installed and already renders
// CloudlynkLogo. So these are hand-drawn on a 24x24 grid with a consistent
// 1.8 stroke, round caps and round joins — the geometry Netflix, Instagram and
// Linear all use, and the reason their icon sets look like a set.
//
// Every icon inherits `color`, so an active tab tints blue and an inactive one
// greys, from the same component.

export type IconName =
  | 'cloud' | 'compass' | 'broadcast' | 'user'
  | 'shield' | 'clipboard' | 'edit' | 'chart' | 'flag' | 'check-circle'
  | 'film' | 'upload' | 'history' | 'bell' | 'video' | 'lock'
  | 'document' | 'package' | 'diamond' | 'tv' | 'play' | 'plus'
  | 'settings' | 'chevron-right' | 'search' | 'trash' | 'logout'
  | 'wifi' | 'refresh' | 'tools'
  | 'eye' | 'eye-off' | 'folder' | 'image' | 'music' | 'globe';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  /** Filled icons read as "active"; the set is outline-first like iOS/Netflix. */
  filled?: boolean;
};

export function Icon({ name, size = 24, color = Colors.textSecondary, filled = false }: Props) {
  // Stroke width is scaled so a 16px icon does not look hairline next to a
  // 28px one — a fixed width would.
  const sw = Math.max(1.4, (size / 24) * 1.8);
  const common = {
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: filled ? color : 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'cloud' && (
        <Path d="M6.5 19a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 17.7 8.6 4.2 4.2 0 0 1 18 19H6.5Z" {...common} />
      )}

      {name === 'compass' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="m15.6 8.4-2 5.2-5.2 2 2-5.2 5.2-2Z" {...common} fill={color} />
        </>
      )}

      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="7" {...common} />
          <Line x1="16.2" y1="16.2" x2="21" y2="21" {...common} />
        </>
      )}

      {name === 'broadcast' && (
        <>
          <Circle cx="12" cy="12" r="2.2" {...common} fill={color} />
          <Path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 15.8a5.4 5.4 0 0 0 0-7.6" {...common} />
          <Path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 18.4a9 9 0 0 0 0-12.8" {...common} />
        </>
      )}

      {name === 'user' && (
        <>
          <Circle cx="12" cy="8" r="3.6" {...common} />
          <Path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" {...common} />
        </>
      )}

      {name === 'shield' && (
        <Path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3Z" {...common} />
      )}

      {name === 'clipboard' && (
        <>
          <Rect x="5" y="4.5" width="14" height="16" rx="2.5" {...common} />
          <Path d="M9 4.5V3.4A1.4 1.4 0 0 1 10.4 2h3.2A1.4 1.4 0 0 1 15 3.4V4.5" {...common} />
          <Line x1="8.8" y1="10.5" x2="15.2" y2="10.5" {...common} />
          <Line x1="8.8" y1="14.5" x2="13" y2="14.5" {...common} />
        </>
      )}

      {name === 'edit' && (
        <>
          <Path d="M11 4.5H6.5A2.5 2.5 0 0 0 4 7v10.5A2.5 2.5 0 0 0 6.5 20H17a2.5 2.5 0 0 0 2.5-2.5V13" {...common} />
          <Path d="M17.4 3.6a2 2 0 0 1 2.8 2.8L12.8 13.8l-3.6 1 1-3.6 7.2-7.6Z" {...common} />
        </>
      )}

      {name === 'chart' && (
        <>
          <Line x1="4.5" y1="20" x2="19.5" y2="20" {...common} />
          <Rect x="6.5" y="12" width="3" height="6" rx="1" {...common} />
          <Rect x="11" y="8" width="3" height="10" rx="1" {...common} />
          <Rect x="15.5" y="4.5" width="3" height="13.5" rx="1" {...common} />
        </>
      )}

      {name === 'flag' && (
        <>
          <Path d="M5.5 21V4" {...common} />
          <Path d="M5.5 5h11l-2 3.5 2 3.5h-11" {...common} />
        </>
      )}

      {name === 'check-circle' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Polyline points="8,12.4 10.9,15.2 16,9.6" {...common} fill="none" />
        </>
      )}

      {name === 'film' && (
        <>
          <Rect x="3.5" y="5" width="17" height="14" rx="2.5" {...common} />
          <Line x1="8" y1="5" x2="8" y2="19" {...common} />
          <Line x1="16" y1="5" x2="16" y2="19" {...common} />
          <Line x1="3.5" y1="12" x2="20.5" y2="12" {...common} />
        </>
      )}

      {name === 'upload' && (
        <>
          <Path d="M4.5 15.5V18a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5v-2.5" {...common} />
          <Polyline points="8.2,8.2 12,4.4 15.8,8.2" {...common} fill="none" />
          <Line x1="12" y1="4.8" x2="12" y2="15.4" {...common} />
        </>
      )}

      {name === 'history' && (
        <>
          <Path d="M3.8 12a8.2 8.2 0 1 0 2.6-6" {...common} />
          <Polyline points="3.4,4.2 3.4,8.4 7.6,8.4" {...common} fill="none" />
          <Polyline points="12,7.6 12,12.4 15.4,14.2" {...common} fill="none" />
        </>
      )}

      {name === 'bell' && (
        <>
          <Path d="M18 16.5H6l1.3-2.2V11a4.7 4.7 0 0 1 9.4 0v3.3L18 16.5Z" {...common} />
          <Path d="M10.4 19.4a1.9 1.9 0 0 0 3.2 0" {...common} />
        </>
      )}

      {name === 'video' && (
        <>
          <Rect x="3" y="6.5" width="12.5" height="11" rx="2.5" {...common} />
          <Path d="m15.5 13 5.5 3V8l-5.5 3v2Z" {...common} />
        </>
      )}

      {name === 'lock' && (
        <>
          <Rect x="5" y="10.5" width="14" height="10" rx="2.5" {...common} />
          <Path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" {...common} />
        </>
      )}

      {name === 'document' && (
        <>
          <Path d="M13.5 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8.5L13.5 3Z" {...common} />
          <Polyline points="13.2,3.2 13.2,8.8 18.8,8.8" {...common} fill="none" />
        </>
      )}

      {name === 'package' && (
        <>
          <Path d="M12 3 3.8 7.3v9.4L12 21l8.2-4.3V7.3L12 3Z" {...common} />
          <Polyline points="3.9,7.4 12,11.8 20.1,7.4" {...common} fill="none" />
          <Line x1="12" y1="11.9" x2="12" y2="20.8" {...common} />
        </>
      )}

      {name === 'diamond' && (
        <>
          <Path d="M6 3.5h12l3 5-9 12-9-12 3-5Z" {...common} />
          <Polyline points="3.2,8.6 20.8,8.6" {...common} fill="none" />
          <Path d="M9.4 3.6 7.6 8.6 12 20M14.6 3.6l1.8 5L12 20" {...common} />
        </>
      )}

      {name === 'tv' && (
        <>
          <Rect x="3" y="7" width="18" height="12.5" rx="2.5" {...common} />
          <Polyline points="8,3.4 12,6.8 16,3.4" {...common} fill="none" />
        </>
      )}

      {name === 'play' && (
        <Path d="M7.5 5.4 18.6 12 7.5 18.6V5.4Z" {...common} fill={filled ? color : 'none'} />
      )}

      {name === 'plus' && (
        <>
          <Line x1="12" y1="5.5" x2="12" y2="18.5" {...common} />
          <Line x1="5.5" y1="12" x2="18.5" y2="12" {...common} />
        </>
      )}

      {name === 'settings' && (
        <>
          <Circle cx="12" cy="12" r="3.2" {...common} />
          <Path d="M19.1 14.5a1.5 1.5 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.5 1.5 0 0 0-2.5 1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.5 1.5 0 0 0-2.6-1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.5 1.5 0 0 0-1-2.5H3.8a1.9 1.9 0 1 1 0-3.8H4a1.5 1.5 0 0 0 1-2.6l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.5 1.5 0 0 0 1.7.3H9.6a1.5 1.5 0 0 0 .9-1.4V3.8a1.9 1.9 0 1 1 3.8 0V4a1.5 1.5 0 0 0 2.5 1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.3a1.9 1.9 0 1 1 0 3.8H20a1.5 1.5 0 0 0-1.4.9Z" {...common} />
        </>
      )}

      {name === 'chevron-right' && (
        <Polyline points="9.5,5.5 16,12 9.5,18.5" {...common} fill="none" />
      )}

      {name === 'trash' && (
        <>
          <Polyline points="4.5,6.5 19.5,6.5" {...common} fill="none" />
          <Path d="M8.5 6.5V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" {...common} />
          <Path d="M6.5 6.5 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12.5" {...common} />
        </>
      )}

      {name === 'wifi' && (
        <>
          <Path d="M2.6 9.2a14 14 0 0 1 18.8 0" {...common} />
          <Path d="M5.8 12.6a9.3 9.3 0 0 1 12.4 0" {...common} />
          <Path d="M9 16a4.6 4.6 0 0 1 6 0" {...common} />
          <Circle cx="12" cy="19.4" r="1" {...common} fill={color} />
        </>
      )}

      {name === 'refresh' && (
        <>
          <Path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8" {...common} />
          <Polyline points="20.6,3.4 20.6,7.6 16.4,7.6" {...common} fill="none" />
        </>
      )}

      {name === 'tools' && (
        <>
          <Path d="M14.2 6.4a3.8 3.8 0 0 0 5 5l-8.4 8.4a2.2 2.2 0 0 1-3.1-3.1l8.4-8.4a3.8 3.8 0 0 0-1.9-1.9Z" {...common} />
          <Path d="M9.6 9.6 5.2 5.2" {...common} />
        </>
      )}

      {name === 'eye' && (
        <>
          <Path d="M2.2 12S5.8 5.4 12 5.4 21.8 12 21.8 12 18.2 18.6 12 18.6 2.2 12 2.2 12Z" {...common} />
          <Circle cx="12" cy="12" r="3.1" {...common} />
        </>
      )}

      {name === 'eye-off' && (
        <>
          <Path d="M9.6 5.8A8.9 8.9 0 0 1 12 5.4c6.2 0 9.8 6.6 9.8 6.6a17 17 0 0 1-3 3.9M6.3 7.9A17 17 0 0 0 2.2 12S5.8 18.6 12 18.6a8.8 8.8 0 0 0 3.7-.8" {...common} />
          <Path d="M9.9 9.9a3.1 3.1 0 0 0 4.3 4.3" {...common} />
          <Line x1="3.5" y1="3.5" x2="20.5" y2="20.5" {...common} />
        </>
      )}

      {name === 'folder' && (
        <Path d="M3.5 7.4a2 2 0 0 1 2-2h3.2l2 2.4h7.8a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V7.4Z" {...common} />
      )}

      {name === 'image' && (
        <>
          <Rect x="3.5" y="5" width="17" height="14" rx="2.5" {...common} />
          <Circle cx="9" cy="10" r="1.6" {...common} />
          <Polyline points="4.2,17.4 9.6,12.6 13.4,15.6 16.6,13 20.2,16.4" {...common} fill="none" />
        </>
      )}

      {name === 'music' && (
        <>
          <Path d="M9.4 18V6.2l9.2-1.8V16" {...common} />
          <Circle cx="7" cy="18" r="2.5" {...common} />
          <Circle cx="16.2" cy="16" r="2.5" {...common} />
        </>
      )}

      {name === 'globe' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Line x1="3.2" y1="12" x2="20.8" y2="12" {...common} />
          <Path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z" {...common} />
        </>
      )}

      {name === 'logout' && (
        <>
          <Path d="M14.5 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7.5" {...common} />
          <Polyline points="16.5,8.2 20.3,12 16.5,15.8" {...common} fill="none" />
          <Line x1="20" y1="12" x2="10.5" y2="12" {...common} />
        </>
      )}
    </Svg>
  );
}
