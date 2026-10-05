import { type IconName } from '@/components/ui/Icon';

/** Placeholder glyph when a post has no thumbnail. */
export function contentIcon(t?: string | null): IconName {
  return t === 'movie' ? 'film' : t === 'series' ? 'tv' : t === 'short' ? 'video' : 'document';
}
