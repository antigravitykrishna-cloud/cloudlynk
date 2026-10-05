export type PostStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type ContentType = 'post' | 'movie' | 'series' | 'short';
export type AccessLevel = 'free' | 'premium';
export type ExploreFilter = 'all' | 'popular' | 'most_watched' | 'latest' | 'most_searched';

/**
 * Exactly the channel_posts columns guests may read (v61). Asking a guest query for any other
 * column fails the whole request. video_url / media_url / trailer_url are excluded on purpose.
 */
export const GUEST_POST_COLUMNS =
  'id, channel_id, author_id, title, body, content_type, access_level, genre, ' +
  'duration_min, release_year, season_number, episode_number, episode_title, ' +
  'series_id, tags, media_type, thumbnail_url, is_short, view_count, status, created_at';

/** Post columns plus the author's public profile. */
export const POST_WITH_AUTHOR =
  '*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)';

/**
 * Default access level: movies and series are premium, shorts and posts free, unless the uploader
 * chooses otherwise. Enforced server-side.
 */
export function defaultAccessLevel(contentType: ContentType): AccessLevel {
  return contentType === 'movie' || contentType === 'series' ? 'premium' : 'free';
}

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
  video_url: string | null;
  submitted_at: string | null;
  series_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  view_count: number;
  created_at: string;
  author?: { id: string; full_name: string | null; avatar_url: string | null };
  channel?: { name: string };
};

/**
 * A post as a guest sees it: no video or moderation fields. Typed this way so the compiler stops
 * code from trying to play a guest's post.
 */
export type GuestChannelPost = Omit<
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
