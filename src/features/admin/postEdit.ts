import type {
  AdminPost,
  PostClearableField,
  PostPatch,
} from '@/features/admin/api/adminContentApi';

/** The edit form: every field as typed text. */
export type PostForm = Record<keyof Required<PostPatch>, string>;

const NUMERIC: (keyof PostForm)[] = ['durationMin', 'releaseYear', 'seasonNumber', 'episodeNumber'];

/** Form fields that may be blanked, and the column each clears (admin_update_post's whitelist). */
const CLEARABLE: Partial<Record<keyof PostForm, PostClearableField>> = {
  body: 'body',
  genre: 'genre',
  durationMin: 'duration_min',
  releaseYear: 'release_year',
  seasonNumber: 'season_number',
  episodeNumber: 'episode_number',
  episodeTitle: 'episode_title',
  thumbnailUrl: 'thumbnail_url',
};

/**
 * The form for a post. Release year, season, episode and episode title are not in the admin post
 * list, so they start blank, and blank means "leave as stored".
 */
export function postToForm(post: AdminPost): PostForm {
  return {
    title: post.title ?? '',
    body: post.body ?? '',
    genre: post.genre ?? '',
    durationMin: post.duration_min != null ? String(post.duration_min) : '',
    releaseYear: '',
    seasonNumber: '',
    episodeNumber: '',
    episodeTitle: '',
    thumbnailUrl: post.thumbnail_url ?? '',
  };
}

/**
 * What to send for an edit: only the fields that changed, so the RPC leaves every other column
 * alone, plus the columns that were deliberately blanked. A number field holding something that
 * is not a number is skipped rather than sent as NaN.
 */
export function diffPostForm(
  initial: PostForm,
  form: PostForm,
): { patch: PostPatch; clear: PostClearableField[] } {
  const patch: PostPatch = {};
  const clear: PostClearableField[] = [];

  for (const key of Object.keys(form) as (keyof PostForm)[]) {
    const now = form[key].trim();
    if (now === initial[key].trim()) continue;

    if (now === '') {
      const column = CLEARABLE[key];
      if (column) clear.push(column);
      continue;
    }
    if (NUMERIC.includes(key)) {
      const value = parseInt(now, 10);
      if (!Number.isNaN(value)) Object.assign(patch, { [key]: value });
    } else {
      Object.assign(patch, { [key]: now });
    }
  }
  return { patch, clear };
}
