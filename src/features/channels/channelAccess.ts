// Who may do what with a channel in the Channels list. Anyone can browse and open a channel.
// Joining needs a saved account; a public channel needs no plan to join (the plan is asked for when
// they try to watch), a hidden one does.

/** What stands between this person and joining a channel, or null if nothing does. */
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

export type ChannelRowAction = 'manage' | 'leave' | 'join';

/** The button on a channel row: owners and admins manage, members leave, everyone else joins. */
export function rowAction(
  channel: { owner_id: string | null },
  viewer: { userId: string | undefined; isAdmin: boolean; isMember: boolean },
): ChannelRowAction {
  if (viewer.isAdmin || channel.owner_id === viewer.userId) return 'manage';
  if (viewer.isMember) return 'leave';
  return 'join';
}

/** Channels whose name or description contains the query, ignoring case and outer spaces. */
export function searchChannels<T extends { name: string; description: string | null }>(
  channels: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return channels;
  return channels.filter(
    channel =>
      channel.name.toLowerCase().includes(q) ||
      (channel.description ?? '').toLowerCase().includes(q),
  );
}
