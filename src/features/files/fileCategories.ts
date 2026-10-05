import type { IconName } from '@/components/ui/Icon';
import { Colors, withAlpha } from '@/theme';

// How the Cloud tab sorts and draws files: by the kind of file, read from its MIME type.

export type FileCategory = 'photo' | 'video' | 'document' | 'audio' | 'other';

export function categoryOf(mimeType: string): FileCategory {
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (/pdf|document|spreadsheet|text/.test(mimeType)) return 'document';
  return 'other';
}

/**
 * Each category has its own hue so a file is recognised before its name is read; the file list in
 * the store screenshots relies on it.
 */
export const CATEGORY_STYLE: Record<FileCategory, { icon: IconName; color: string; tint: string }> =
  {
    photo: { icon: 'image', color: Colors.pastelSky, tint: withAlpha(Colors.pastelSky, 0.15) },
    video: { icon: 'film', color: Colors.brandBlue, tint: Colors.brandBlueDim },
    document: { icon: 'document', color: Colors.pastelLavender, tint: Colors.lavenderDim },
    audio: { icon: 'music', color: Colors.pastelMint, tint: withAlpha(Colors.pastelMint, 0.15) },
    other: { icon: 'package', color: Colors.textSecondary, tint: Colors.neutralDim },
  };

/** The filter chips above the file list. */
export const CATEGORY_FILTERS: { key: FileCategory | 'all'; label: string; icon: IconName }[] = [
  { key: 'all', label: 'All', icon: 'folder' },
  { key: 'photo', label: 'Photos', icon: 'image' },
  { key: 'video', label: 'Videos', icon: 'film' },
  { key: 'document', label: 'Docs', icon: 'document' },
  { key: 'audio', label: 'Audio', icon: 'music' },
];
