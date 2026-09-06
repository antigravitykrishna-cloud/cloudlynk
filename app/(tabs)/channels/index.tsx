import { CloudlynkLogo } from '../../../components/CloudlynkLogo';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { GuestPrompt } from '../../../components/GuestPrompt';
import { useAuth } from '../../../hooks/useAuth';
import { ChannelService } from '../../../lib/channels';
import { supabase } from '../../../lib/supabase';
import { Colors } from '../../../constants/theme';
import { Database } from '../../../lib/supabase';

type Channel = Database['public']['Tables']['channels']['Row'];
type TabKey = 'discover' | 'feed' | 'joined';
type FilterKey = 'top_rated' | 'trending' | 'latest';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'feed', label: 'Feed' },
  { key: 'joined', label: 'Joined' },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'top_rated', label: 'Top Rated' },
  { key: 'trending', label: 'Trending' },
  { key: 'latest', label: 'Latest' },
];

export default function ChannelsScreen() {
  const { user, profile, isAdmin } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('discover');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('top_rated');
  const [searchQuery, setSearchQuery] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [joinedChannelIds, setJoinedChannelIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isPaidUser = profile?.plan !== 'free' && profile?.plan != null;

  const prevUserIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== user?.id) {
      setChannels([]);
      setJoinedChannelIds(new Set());
      setLoading(true);
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id]);

  const loadMemberships = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', user.id);
    setJoinedChannelIds(new Set((data ?? []).map((r: any) => r.channel_id)));
  }, [user?.id]);

  const loadChannels = useCallback(async () => {
    if (!user?.id) return;
    try {
      let data: Channel[] = [];
      if (activeTab === 'joined') {
        data = (await ChannelService.getMyChannels(user.id)) as Channel[];
      } else {
        data = (await ChannelService.getDiscoverChannels(user.id, activeFilter)) as Channel[];
      }
      setChannels(data);
    } catch (err) {
      if (__DEV__) console.error('loadChannels error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeTab, activeFilter]);

  useFocusEffect(useCallback(() => { setLoading(true); loadChannels(); loadMemberships(); }, [loadChannels, loadMemberships]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChannels();
    setRefreshing(false);
  }, [loadChannels]);

  const sortedChannels = channels.filter(c => {
    if (searchQuery.length === 0) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      (c.description ?? '').toLowerCase().includes(q);
  });

  const handleJoinPress = (channel: Channel) => {
    if (!isPaidUser) {
      Alert.alert(
        'Subscription Required',
        'A subscription is required to join this channel. Upgrade to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/premium') },
        ],
      );
      return;
    }
    handleJoin(channel);
  };

  const handleJoin = async (channel: Channel) => {
    if (!user?.id) return;
    try {
      await ChannelService.joinChannel(channel.id, user.id);
      await loadChannels();
      await loadMemberships();
      router.push({ pathname: '/(tabs)/channels/[id]', params: { id: channel.id } });
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : 'Could not join channel.';
      Alert.alert('Cannot join channel', msg);
    }
  };

  const handleLeave = (channel: Channel) => {
    if (!user?.id) return;
    Alert.alert('Leave channel', `Leave "${channel.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive',
        onPress: async () => {
          try {
            await ChannelService.leaveChannel(channel.id, user!.id);
            await loadChannels();
            await loadMemberships();
          } catch (err: unknown) {
            const msg = err instanceof Error && err.message ? err.message : 'Could not leave channel.';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleManage = (channel: Channel) => {
    Alert.alert(
      `Manage: ${channel.name}`,
      `Members: ${channel.member_count ?? 0} · Posts: ${channel.post_count ?? 0}`,
      [
        { text: 'View Channel', onPress: () => router.push({ pathname: '/(tabs)/channels/[id]', params: { id: channel.id } }) },
        {
          text: 'Delete Channel', style: 'destructive',
          onPress: () => {
            Alert.alert('Confirm Delete', `Permanently delete "${channel.name}" and all its content?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                  try {
                    await ChannelService.deleteChannel(channel.id);
                    await loadChannels();
                    Alert.alert('Deleted', `"${channel.name}" has been deleted.`);
                  } catch (err: unknown) {
                    Alert.alert('Error', err instanceof Error ? err.message : 'Delete failed');
                  }
                },
              },
            ]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleRowPress = (channel: Channel) => {
    if (!isPaidUser && !isAdmin && channel.owner_id !== user?.id && !joinedChannelIds.has(channel.id)) {
      Alert.alert(
        'Subscription Required',
        'A subscription is required to view this channel. Upgrade to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/premium') },
        ],
      );
      return;
    }
    router.push({ pathname: '/(tabs)/channels/[id]', params: { id: channel.id } });
  };

  // v61: guests reach this tab but every query here early-returns on
  // !user?.id, so without this they get a blank screen and assume the app
  // is broken rather than that the feature needs an account.
  if (!user?.id) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <GuestPrompt icon="📺" title="Join channels you like" message="Follow creators, join public channels, or start your own. Public and private both." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Red Header */}
      <View style={styles.redHeader}>
        <Text style={styles.redHeaderTitle}>Channels</Text>
        <CloudlynkLogo size={28} />
      </View>

      {/* Search bar (white pill on red bg) */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>{'🔍'}</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.searchClear}>{'✕'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={styles.tab}
            onPress={() => setActiveTab(t.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
            {activeTab === t.key && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter pills on white bg */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, activeFilter === f.key && styles.filterPillActive]}
              onPress={() => setActiveFilter(f.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterPillText, activeFilter === f.key && styles.filterPillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Channel list */}
      {loading ? (
        <ActivityIndicator color={Colors.brand} size="large" style={{ marginTop: 60 }} />
      ) : sortedChannels.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}>
          <View style={styles.emptyState}>
            <CloudlynkLogo size={48} />
            <Text style={styles.emptyText}>No Record Found</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}
        >
          {sortedChannels.map(channel => {
            const memberCount = (channel.member_count ?? 0).toLocaleString();
            const contentCount = (channel.post_count ?? 0).toLocaleString();
            const isMember = joinedChannelIds.has(channel.id);
            const isPending = channel.status === 'pending';
            return (
              <View key={channel.id} style={styles.channelRow}>
                {isPending && (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>PENDING</Text>
                  </View>
                )}
                {/* Avatar — sibling TouchableOpacity, NOT nested */}
                <TouchableOpacity
                  style={styles.channelAvatar}
                  onPress={() => handleRowPress(channel)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.channelAvatarEmoji}>
                    {channel.is_public ? '🌐' : '🔐'}
                  </Text>
                </TouchableOpacity>

                {/* Center info — sibling TouchableOpacity */}
                <TouchableOpacity
                  style={styles.channelInfo}
                  onPress={() => handleRowPress(channel)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
                  <View style={styles.channelStats}>
                    <View style={styles.channelStat}>
                      <Text style={styles.channelStatIcon}>{'👤'}</Text>
                      <Text style={styles.channelStatText}>{memberCount}</Text>
                    </View>
                    <View style={styles.channelStat}>
                      <Text style={styles.channelStatIcon}>{'📁'}</Text>
                      <Text style={styles.channelStatText}>{contentCount}</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Right action — sibling TouchableOpacity, NO nesting */}
                {isAdmin || channel.owner_id === user?.id ? (
                  <TouchableOpacity
                    style={styles.manageBtn}
                    onPress={() => handleManage(channel)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.manageBtnText}>Manage</Text>
                  </TouchableOpacity>
                ) : isMember ? (
                  <TouchableOpacity
                    style={styles.leaveBtn}
                    onPress={() => handleLeave(channel)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.leaveBtnText}>Leave</Text>
                  </TouchableOpacity>
                ) : isPaidUser ? (
                  <TouchableOpacity
                    style={styles.joinBtn}
                    onPress={() => handleJoinPress(channel)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.joinBtnText}>Join</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.lockBtn}
                    onPress={() => handleJoinPress(channel)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.lockBtnIcon}>{'🔒'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  redHeader: { backgroundColor: Colors.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  redHeaderTitle: { color: '#ffffff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  crownBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff' },
  crownText: { fontSize: 18, color: Colors.brand, fontWeight: '900' },
  searchBarWrap: { backgroundColor: Colors.surface, paddingHorizontal: 16, paddingBottom: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: Colors.border },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
  searchClear: { fontSize: 14, color: Colors.textMuted, padding: 4 },
  tabBar: { backgroundColor: Colors.surface, flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 24 },
  tab: { paddingVertical: 4, alignItems: 'center' },
  tabText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: '#ffffff', fontWeight: '800' },
  tabUnderline: { position: 'absolute', bottom: -8, left: 0, right: 0, height: 3, backgroundColor: '#ffffff', borderRadius: 2 },
  filterBar: { backgroundColor: Colors.bg, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  filterPillActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  filterPillText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  filterPillTextActive: { color: '#ffffff' },
  list: { paddingVertical: 8 },
  channelRow: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  pendingBadge: { position: 'absolute', top: 6, right: 16, backgroundColor: '#FFB347', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, zIndex: 1 },
  pendingBadgeText: { fontSize: 9, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  channelAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surfaceHover, alignItems: 'center', justifyContent: 'center' },
  channelAvatarEmoji: { fontSize: 22 },
  channelInfo: { flex: 1, minWidth: 0 },
  channelName: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  channelStats: { flexDirection: 'row', gap: 14 },
  channelStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  channelStatIcon: { fontSize: 12 },
  channelStatText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  manageBtn: { backgroundColor: Colors.brand, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  manageBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  joinBtn: { backgroundColor: Colors.brand, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 },
  joinBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  leaveBtn: { backgroundColor: Colors.surfaceElevated, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.brand },
  leaveBtnText: { color: Colors.brand, fontSize: 13, fontWeight: '700' },
  lockBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  lockBtnIcon: { fontSize: 16 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 20 },
  emptyText: { fontSize: 16, color: Colors.text, fontWeight: '600', marginTop: 16 },
});
