import type { Database } from '@/lib/supabase';

export type Channel = Database['public']['Tables']['channels']['Row'];
export type ChannelTab = 'discover' | 'feed' | 'joined';
export type ChannelFilter = 'top_rated' | 'trending' | 'latest';

export const TABS: { key: ChannelTab; label: string }[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'feed', label: 'Feed' },
  { key: 'joined', label: 'Joined' },
];

export const FILTERS: { key: ChannelFilter; label: string }[] = [
  { key: 'top_rated', label: 'Top Rated' },
  { key: 'trending', label: 'Trending' },
  { key: 'latest', label: 'Latest' },
];

/** Channels whose name or description contains the query, ignoring case. */
export function searchChannels<T extends { name: string; description: string | null }>(
  channels: T[],
  query: string,
): T[] {
  if (query.length === 0) return channels;
  const q = query.toLowerCase();
  return channels.filter(
    c => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q),
  );
}

/**
 * What stands between this person and joining a channel, or null if nothing does. Anyone can
 * browse and open a channel; joining needs a saved account. A public channel needs no plan to join
 * (v81: the plan is asked for when they try to watch); a hidden one still does.
 */
export function joinGate(who: {
  signedIn: boolean;
  isGuest: boolean;
  isPaidUser: boolean;
  isAdmin: boolean;
  channelIsPublic: boolean;
}): 'sign_in' | 'save_account' | 'premium' | null {
  if (!who.signedIn) return 'sign_in';
  if (who.isGuest) return 'save_account';
  if (!who.channelIsPublic && !who.isPaidUser && !who.isAdmin) return 'premium';
  return null;
}

/** The button on a channel row: owners and admins manage, members leave, everyone else joins. */
export function rowAction(
  channel: { owner_id: string | null },
  viewer: { userId: string | undefined; isAdmin: boolean; isMember: boolean },
): 'manage' | 'leave' | 'join' {
  if (viewer.isAdmin || channel.owner_id === viewer.userId) return 'manage';
  if (viewer.isMember) return 'leave';
  return 'join';
}
