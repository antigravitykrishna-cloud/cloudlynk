// The content a channel publishes: movies, series episodes, shorts and plain posts. All of it is a
// row in `channel_posts`.

export type ContentType = 'post' | 'movie' | 'series' | 'short';
export type PostStatus = 'draft' | 'pending' | 'approved' | 'rejected';
/** 'premium' titles need an active plan (or an admin grant) to play. */
export type AccessLevel = 'free' | 'premium';

export type ChannelPost = {
  id: string;
  channel_id: string;
  author_id: string;
  title: string | null;
  body: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  thumbnail_url: string | null;
  content_type: ContentType;
  genre: string | null;
  duration_min: number | null;
  season_number: number | null;
  episode_number: number | null;
  episode_title: string | null;
  release_year: number | null;
  tags: string[] | null;
  status: PostStatus;
  access_level: AccessLevel;
  /** Cloudflare Stream video uid. Played only through a signed URL (playbackApi). */
  video_url: string | null;
  submitted_at: string | null;
  series_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  view_count?: number | null;
  created_at: string;
  author?: { id: string; full_name: string | null; avatar_url: string | null };
  channel?: { name: string };
};

/**
 * A post as listings show it: no video or moderation fields. Guests and the locked premium previews
 * get this shape, so the compiler stops code from trying to play one.
 */
export type ListedPost = Omit<
  ChannelPost,
  'video_url' | 'media_url' | 'submitted_at' | 'approved_by' | 'approved_at' | 'rejection_note'
>;

export const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Horror',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'Documentary',
  'Animation',
  'Fantasy',
  'Crime',
  'Mystery',
  'Biography',
  'Other',
];

/**
 * Movies and series are premium by default; shorts and posts are free. The uploader can change it,
 * and the server enforces whatever is stored.
 */
export function defaultAccessLevel(contentType: ContentType): AccessLevel {
  return contentType === 'movie' || contentType === 'series' ? 'premium' : 'free';
}
