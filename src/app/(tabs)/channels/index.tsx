import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { LoginSheet } from '@/components/auth/LoginSheet';
import { ChannelsEmpty } from '@/components/channels/ChannelsEmpty';
import { ChannelsHeader } from '@/components/channels/ChannelsHeader';
import { ChannelRow } from '@/components/channels/ChannelRow';
import {
  joinGate,
  rowAction,
  searchChannels,
  type Channel,
  type ChannelFilter,
  type ChannelTab,
} from '@/components/channels/shared';
import { showAlert } from '@/components/ui/Feedback';
import { fireHaptic } from '@/components/ui/Press';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useChannelList } from '@/hooks/useChannelList';
import { promptSaveAccount } from '@/lib/auth/guest';
import { ChannelService } from '@/lib/data/channels';
import { errorMessage } from '@/lib/errors';

export default function ChannelsScreen() {
  // isPaidUser reads plan_status and honours plan_expires_at (not the legacy
  // `plan` column, which locked paying people out of their channels).
  const { user, isAdmin, isPaidUser, isGuest } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<ChannelTab>('discover');
  const [filter, setFilter] = useState<ChannelFilter>('top_rated');
  const [query, setQuery] = useState('');
  const [signInSheet, setSignInSheet] = useState(false);
  const list = useChannelList(user?.id, tab, filter);

  const visible = searchChannels(list.channels, query);

  // Opening a channel is never gated: guests and people without a plan can
  // look inside and see what it has. What is gated is joining it and
  // watching its content -- see app/(tabs)/channels/[id].tsx.
  const open = (channel: Channel) =>
    router.push({ pathname: '/(tabs)/channels/[id]', params: { id: channel.id } });

  const join = async (channel: Channel) => {
    const gate = joinGate({
      signedIn: !!user?.id,
      isGuest,
      isPaidUser,
      isAdmin,
      channelIsPublic: !!channel.is_public,
    });
    if (gate === 'sign_in') return setSignInSheet(true);
    if (gate === 'save_account') return promptSaveAccount(router, 'join channels');
    if (gate === 'premium') return router.push('/premium');
    if (!user?.id) return;
    try {
      await ChannelService.joinChannel(channel.id, user.id);
      fireHaptic('success');
      await list.reload();
      open(channel);
    } catch (err: unknown) {
      fireHaptic('error');
      showAlert('Cannot join channel', errorMessage(err, 'Could not join channel.'));
    }
  };

  const leave = (channel: Channel) => {
    const userId = user?.id;
    if (!userId) return;
    showAlert('Leave channel', `Leave "${channel.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await ChannelService.leaveChannel(channel.id, userId);
            await list.reload();
          } catch (err: unknown) {
            showAlert('Error', errorMessage(err, 'Could not leave channel.'));
          }
        },
      },
    ]);
  };

  const confirmDelete = (channel: Channel) =>
    showAlert('Confirm Delete', `Permanently delete "${channel.name}" and all its content?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await ChannelService.deleteChannel(channel.id);
            await list.reloadChannels();
            showAlert('Deleted', `"${channel.name}" has been deleted.`);
          } catch (err: unknown) {
            showAlert('Error', errorMessage(err, 'Delete failed'));
          }
        },
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

  const refreshControl = (
    <RefreshControl
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      tintColor={Colors.brandBlue}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ChannelsHeader
        query={query}
        onQueryChange={setQuery}
        tab={tab}
        onTabChange={setTab}
        filter={filter}
        onFilterChange={setFilter}
      />

      {list.loading ? (
        <ListSkeleton rows={7} />
      ) : visible.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <ChannelsEmpty
            loadFailed={list.loadFailed}
            joinedTab={tab === 'joined'}
            signedIn={!!user?.id}
            onRetry={list.refresh}
          />
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {visible.map((channel, idx) => {
            const action = rowAction(channel, {
              userId: user?.id,
              isAdmin,
              isMember: list.joinedIds.has(channel.id),
            });
            return (
              <ChannelRow
                key={channel.id}
                channel={channel}
                index={idx}
                action={action}
                onOpen={() => open(channel)}
                onAction={() =>
                  action === 'manage'
                    ? manage(channel)
                    : action === 'leave'
                      ? leave(channel)
                      : join(channel)
                }
              />
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
      <LoginSheet
        allowGuest={false}
        visible={signInSheet}
        onClose={() => setSignInSheet(false)}
        message="Sign in to join channels. It only takes a moment."
        returnTo="/(tabs)/channels"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  list: { paddingVertical: 8 },
});
