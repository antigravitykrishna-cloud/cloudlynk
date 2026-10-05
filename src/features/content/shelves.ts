import type { ExploreSort } from '@/features/content/api/postsApi';
import type { ChannelPost } from '@/features/content/model';

// How approved posts are laid out as horizontal shelves on Explore and on a channel page.

/** A titled, horizontally scrolling row of posts. */
export type Shelf = { title: string; items: ChannelPost[] };

const FEATURED_LIMIT = 5;
const NEW_THIS_WEEK_DAYS = 7;
const DAY_MS = 86_400_000;

/** Episodes in season, then episode, order. */
function byEpisode(a: ChannelPost, b: ChannelPost): number {
  const season = (a.season_number ?? 0) - (b.season_number ?? 0);
  return season !== 0 ? season : (a.episode_number ?? 0) - (b.episode_number ?? 0);
}

/** "Mirzapur - S1E2" -> "Mirzapur": the series name without its episode suffix. */
function seriesName(title: string): string {
  return (
    title
      .replace(/\s*[-:]\s*[Ss]\d+.*$/, '')
      .replace(/\s*[-:]\s*[Ee]p.*$/i, '')
      .trim() || title
  );
}

/**
 * Groups approved posts into shelves, in display order: Featured (one per type), Movies, a shelf
 * per series, Web Series (episodes without a series), Shorts, one per genre (movies and shorts
 * only), then New This Week.
 */
export function groupIntoShelves(posts: ChannelPost[], now: number = Date.now()): Shelf[] {
  const approved = posts.filter(p => p.status === 'approved');
  const movies = approved.filter(p => p.content_type === 'movie');
  const episodes = approved.filter(p => p.content_type === 'series');
  const shorts = approved.filter(p => p.content_type === 'short');

  const shelves: Shelf[] = [];
  const add = (title: string, items: ChannelPost[]) => {
    if (items.length > 0) shelves.push({ title, items });
  };

  // Featured: the newest movie, one episode of each series, then a short.
  const featured: ChannelPost[] = movies.slice(0, 1);
  const featuredSeries = new Set<string>();
  for (const episode of episodes) {
    if (featured.length >= FEATURED_LIMIT) break;
    const key = episode.series_id ?? episode.id;
    if (featuredSeries.has(key)) continue;
    featuredSeries.add(key);
    featured.push(episode);
  }
  if (featured.length < FEATURED_LIMIT && shorts[0]) featured.push(shorts[0]);
  add('Featured', featured);

  add('Movies', movies);

  const bySeries = new Map<string, ChannelPost[]>();
  for (const episode of episodes.filter(e => e.series_id)) {
    const list = bySeries.get(episode.series_id!) ?? [];
    list.push(episode);
    bySeries.set(episode.series_id!, list);
  }
  for (const seriesEpisodes of bySeries.values()) {
    const ordered = [...seriesEpisodes].sort(byEpisode);
    add(`Series: ${seriesName(ordered[0].title ?? 'Series')}`, ordered);
  }
  add(
    'Web Series',
    episodes.filter(e => !e.series_id),
  );

  add('Shorts', shorts);

  const byGenre = new Map<string, ChannelPost[]>();
  for (const post of [...movies, ...shorts]) {
    if (!post.genre) continue;
    byGenre.set(post.genre, [...(byGenre.get(post.genre) ?? []), post]);
  }
  for (const [genre, items] of byGenre) add(genre, items);

  add(
    'New This Week',
    approved.filter(p => now - new Date(p.created_at).getTime() <= NEW_THIS_WEEK_DAYS * DAY_MS),
  );

  // A genre named like a fixed shelf (e.g. "Movies") would otherwise appear twice.
  const seen = new Set<string>();
  return shelves.filter(shelf => !seen.has(shelf.title) && seen.add(shelf.title));
}

/** Orders each shelf's items for the sort chosen on Explore. */
export function sortShelves(shelves: Shelf[], sort: ExploreSort): Shelf[] {
  if (sort === 'all') return shelves;
  const compare =
    sort === 'latest'
      ? (a: ChannelPost, b: ChannelPost) => b.created_at.localeCompare(a.created_at)
      : (a: ChannelPost, b: ChannelPost) => (b.view_count ?? 0) - (a.view_count ?? 0);
  return shelves.map(shelf => ({ ...shelf, items: [...shelf.items].sort(compare) }));
}
