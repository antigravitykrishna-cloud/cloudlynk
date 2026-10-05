import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';
import { EmptyState, LoadFailedState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { fireHaptic } from '@/components/ui/Press';
import { SearchBar } from '@/components/ui/SearchBar';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { TabHeader } from '@/components/ui/TabHeader';
import { PillTabs, UnderlineTabs } from '@/components/ui/Tabs';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors, Spacing } from '@/theme';
import { LoginSheet } from '@/features/auth/components/LoginSheet';
import { promptSaveAccount } from '@/features/auth/guestPrompts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { channelsApi, type Channel, type DiscoverSort } from '@/features/channels/api/channelsApi';
import { joinGate, rowAction, searchChannels } from '@/features/channels/channelAccess';
import { ChannelRow } from '@/features/channels/components/ChannelRow';
import { useChannelList, type ChannelListTab } from '@/features/channels/hooks/useChannelList';
import { errorMessage } from '@/utils/errors';

// The Channels tab: browse, join, leave, and (for owners and admins) manage. Who may join is
// decided in channelAccess.ts.

const TABS: { key: ChannelListTab; label: string }[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'feed', label: 'Feed' },
  { key: 'joined', label: 'Joined' },
];

const SORTS: { key: DiscoverSort; label: string }[] = [
  { key: 'top_rated', label: 'Top Rated' },
  { key: 'trending', label: 'Trending' },
  { key: 'latest', label: 'Latest' },
];

export default function ChannelsScreen() {
  const router = useRouter();
  const { user, isAdmin, isPaidUser, isGuest } = useAuth();
  const [tab, setTab] = useState<ChannelListTab>('discover');
  const [sort, setSort] = useState<DiscoverSort>('top_rated');
  const [query, setQuery] = useState('');
  const [signInSheetOpen, setSignInSheetOpen] = useState(false);

  const { channels, joinedIds, loading, loadFailed, reload, refresh } = useChannelList(tab, sort);
  const refreshControl = usePullToRefresh(refresh);
  const visible = searchChannels(channels, query);

  const open = (channel: Channel) =>
    router.push({ pathname: '/(tabs)/channels/[id]', params: { id: channel.id } });

  const join = async (channel: Channel) => {
    const gate = joinGate({
      signedIn: !!user,
      isGuest,
      isPaidUser,
      isAdmin,
      channelIsPublic: channel.is_public,
    });
    if (gate === 'sign_in') return setSignInSheetOpen(true);
    if (gate === 'save_account') return promptSaveAccount(router, 'join channels');
    if (gate === 'premium') return router.push('/premium');
    try {
      await channelsApi.join(channel.id);
      fireHaptic('success');
      await reload();
      open(channel);
    } catch (err) {
      fireHaptic('error');
      showAlert('Cannot join channel', errorMessage(err, 'Could not join channel.'));
    }
  };

  const leave = (channel: Channel) =>
    showAlert('Leave channel', `Leave "${channel.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          channelsApi
            .leave(channel.id)
            .then(reload)
            .catch(err => showAlert('Error', errorMessage(err, 'Could not leave channel.'))),
      },
    ]);

  const confirmDelete = (channel: Channel) =>
    showAlert('Confirm Delete', `Permanently delete "${channel.name}" and all its content?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          channelsApi
            .remove(channel.id)
            .then(reload)
            .then(() => showAlert('Deleted', `"${channel.name}" has been deleted.`))
            .catch(err => showAlert('Error', errorMessage(err, 'Delete failed'))),
      },
    ]);

  const manage = (channel: Channel) =>
    showAlert(
      `Manage: ${channel.name}`,
      `Members: ${channel.member_count ?? 0} · Posts: ${channel.post_count ?? 0}`,
      [
        { text: 'View Channel', onPress: () => open(channel) },
        { text: 'Delete Channel', style: 'destructive', onPress: () => confirmDelete(channel) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );

  const actionFor = (channel: Channel) =>
    rowAction(channel, { userId: user?.id, isAdmin, isMember: joinedIds.has(channel.id) });

  const runAction = (channel: Channel) => {
    const action = actionFor(channel);
    if (action === 'manage') manage(channel);
    else if (action === 'leave') leave(channel);
    else join(channel);
  };

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <TabHeader title="Channels">
        <View style={styles.search}>
          <SearchBar value={query} onChange={setQuery} />
        </View>
        <UnderlineTabs tabs={TABS} selected={tab} onSelect={setTab} />
      </TabHeader>
      <PillTabs tabs={SORTS} selected={sort} onSelect={setSort} />

      {loading ? (
        <ListSkeleton rows={7} />
      ) : visible.length === 0 ? (
        <ScrollView contentContainerStyle={styles.grow} refreshControl={refreshControl}>
          <ChannelListEmpty loadFailed={loadFailed} onRetry={refresh} tab={tab} signedIn={!!user} />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {visible.map((channel, index) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              index={index}
              action={actionFor(channel)}
              onOpen={() => open(channel)}
              onAction={() => runAction(channel)}
            />
          ))}
        </ScrollView>
      )}

      <LoginSheet
        allowGuest={false}
        visible={signInSheetOpen}
        onClose={() => setSignInSheetOpen(false)}
        message="Sign in to join channels. It only takes a moment."
        returnTo="/(tabs)/channels"
      />
    </SafeAreaView>
  );
}

function ChannelListEmpty({
  loadFailed,
  onRetry,
  tab,
  signedIn,
}: {
  loadFailed: boolean;
  onRetry: () => void;
  tab: ChannelListTab;
  signedIn: boolean;
}) {
  if (loadFailed) return <LoadFailedState what="channels" onRetry={onRetry} />;
  const logo = <CloudlynkLogo size={48} />;
  if (tab === 'joined' && !signedIn) {
    return (
      <EmptyState
        artwork={logo}
        title="Not signed in"
        message="Browse every channel in Discover. Sign in to join one and keep it here."
      />
    );
  }
  return (
    <EmptyState
      artwork={logo}
      title="No channels yet"
      message={
        tab === 'joined'
          ? 'Channels you join will appear here.'
          : 'Join a public channel from Explore, or create your own.'
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  search: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  grow: { flexGrow: 1 },
  list: { paddingVertical: Spacing.sm, paddingBottom: Spacing.xxl },
});
