import type { IconName } from '@/components/ui/Icon';
import type { ContentType } from '@/features/content/model';
import { Colors } from '@/theme';

/** The short label shown on posters, e.g. "MOVIE". */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  movie: 'MOVIE',
  series: 'SERIES',
  short: 'SHORT',
  post: 'POST',
};

const COLORS: Record<ContentType, string> = {
  movie: Colors.brandBlue,
  series: Colors.brandCyan,
  short: Colors.pastelMint,
  post: Colors.pastelLavender,
};

const ICONS: Record<ContentType, IconName> = {
  movie: 'film',
  series: 'tv',
  short: 'video',
  post: 'document',
};

/** Each content type's own colour, so a movie, an episode and a short are told apart at a glance. */
export function contentTypeColor(type: ContentType): string {
  return COLORS[type] ?? Colors.brandBlue;
}

/** The placeholder icon for a post without a thumbnail. */
export function contentTypeIcon(type: string | null | undefined): IconName {
  return ICONS[type as ContentType] ?? 'document';
}
