import type { ChannelPost, ExploreFilter, GuestChannelPost } from './types';

/** The column a listing sorts by for an Explore filter. */
export function exploreOrderColumn(filter?: ExploreFilter): 'view_count' | 'created_at' {
  return filter === 'popular' || filter === 'most_watched' ? 'view_count' : 'created_at';
}

/** Keeps the first row for each id, in order. */
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/**
 * The Feed: approved posts first (they win on a duplicate id), then locked previews, newest first,
 * cut to `limit`.
 */
export function mergeFeed(
  posts: GuestChannelPost[],
  previews: GuestChannelPost[],
  limit: number,
): GuestChannelPost[] {
  return dedupeById([...posts, ...previews])
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
}

/**
 * Groups approved content into rows: Featured (one per type), Movies, each series, Shorts, then
 * genre rows (movies and shorts only), then New This Week.
 */
export function groupByGenre(
  posts: ChannelPost[],
  now: number = Date.now(),
): Record<string, ChannelPost[]> {
  const groups: Record<string, ChannelPost[]> = {};
  const approved = posts.filter(p => p.status === 'approved');

  const movies = approved.filter(p => p.content_type === 'movie');
  const seriesPosts = approved.filter(p => p.content_type === 'series');
  const shorts = approved.filter(p => p.content_type === 'short');

  // Featured: one representative per type, max 5 total
  const featured: ChannelPost[] = [];
  if (movies[0]) featured.push(movies[0]);
  const seenSeriesIds = new Set<string>();
  for (const p of seriesPosts) {
    const key = p.series_id ?? p.id;
    if (!seenSeriesIds.has(key)) {
      seenSeriesIds.add(key);
      featured.push(p);
    }
    if (featured.length >= 5) break;
  }
  if (featured.length < 5 && shorts[0]) featured.push(shorts[0]);
  if (featured.length > 0) groups['Featured'] = featured;

  if (movies.length > 0) groups['Movies'] = movies;

  // Series rows — each unique series_id gets its own named row
  const bySeriesId: Record<string, ChannelPost[]> = {};
  const ungroupedSeries: ChannelPost[] = [];
  seriesPosts.forEach(p => {
    if (p.series_id) {
      if (!bySeriesId[p.series_id]) bySeriesId[p.series_id] = [];
      bySeriesId[p.series_id].push(p);
    } else {
      ungroupedSeries.push(p);
    }
  });
  Object.values(bySeriesId).forEach(episodes => {
    const sorted = [...episodes].sort((a, b) => {
      const s = (a.season_number ?? 0) - (b.season_number ?? 0);
      return s !== 0 ? s : (a.episode_number ?? 0) - (b.episode_number ?? 0);
    });
    groups[`Series: ${seriesLabel(sorted[0]?.title ?? 'Series')}`] = sorted;
  });
  if (ungroupedSeries.length > 0) groups['Web Series'] = ungroupedSeries;

  if (shorts.length > 0) groups['Shorts'] = shorts;

  // Genre rows — movies and shorts only, not series episodes
  [...movies, ...shorts].forEach(p => {
    if (p.genre) {
      if (!groups[p.genre]) groups[p.genre] = [];
      if (!groups[p.genre].includes(p)) groups[p.genre].push(p);
    }
  });

  const recent = approved.filter(p => (now - new Date(p.created_at).getTime()) / 86400000 <= 7);
  if (recent.length > 0) groups['New This Week'] = recent;

  return groups;
}

/** "Show - S1E2" / "Show: Ep 3" -> "Show". Falls back to the raw title. */
export function seriesLabel(rawTitle: string): string {
  return (
    rawTitle
      .replace(/\s*[-:]\s*[Ss]\d+.*$/, '')
      .replace(/\s*[-:]\s*[Ee]p.*$/i, '')
      .trim() || rawTitle
  );
}
