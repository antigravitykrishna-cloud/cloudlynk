import { groupByGenre } from './grouping';
import * as moderation from './moderation';
import * as mutations from './mutations';
import * as queries from './queries';

export * from './types';
export type { CreatePostOptions } from './mutations';

/**
 * Channel posts: reads (queries.ts), uploads and creation (mutations.ts), admin review
 * (moderation.ts) and the pure row-building logic (grouping.ts).
 */
export const PostService = {
  ...queries,
  ...mutations,
  ...moderation,
  groupByGenre,
};
