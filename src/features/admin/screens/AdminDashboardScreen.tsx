import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { EmptyState } from '@/components/ui/EmptyState';
import type { IconName } from '@/components/ui/Icon';
import { UnderlineTabs } from '@/components/ui/Tabs';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors, Spacing } from '@/theme';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';
import { PendingChannelCard, PendingPostCard } from '@/features/admin/components/PendingItems';
import { ToolTile, toolGridStyle } from '@/features/admin/components/ToolTile';
import { useReviewQueue } from '@/features/admin/hooks/useReviewQueue';

// The admin panel's home: every tool in one grid, then the review queue. The client runs the app
// from here, so nothing an admin can do should need hunting for.

type Tool = { icon: IconName; label: string; hint: string; tint: string; href: Href };

const TOOLS: Tool[] = [
  {
    icon: 'user',
    label: 'Users',
    hint: 'Premium, admins, uploads, bans',
    tint: Colors.brandBlueDim,
    href: '/admin/users',
  },
  {
    icon: 'check-circle',
    label: 'User approvals',
    hint: 'Approve new accounts',
    tint: Colors.successDim,
    href: '/admin/user-approvals',
  },
  {
    icon: 'diamond',
    label: 'Subscribers',
    hint: 'Active, ending, expired',
    tint: Colors.warningDim,
    href: '/admin/subscribers',
  },
  {
    icon: 'chart',
    label: 'Payments',
    hint: 'UPI, Razorpay, Sabpaisa',
    tint: Colors.brandCyanDim,
    href: '/admin/payments',
  },
  {
    icon: 'package',
    label: 'Plans & prices',
    hint: 'Names, prices, on sale',
    tint: Colors.lavenderDim,
    href: '/admin/plans',
  },
  {
    icon: 'broadcast',
    label: 'Channels',
    hint: 'Edit, hide, suspend, delete',
    tint: Colors.brandBlueDim,
    href: '/admin/channels',
  },
  {
    icon: 'clipboard',
    label: 'Pending channels',
    hint: 'New channels to review',
    tint: Colors.warningDim,
    href: '/admin/pending-channels',
  },
  {
    icon: 'edit',
    label: 'Pending content',
    hint: 'Uploads to review',
    tint: Colors.warningDim,
    href: '/admin/pending-channel-content',
  },
  {
    icon: 'film',
    label: 'Content & access',
    hint: 'Publish, free/premium, edit',
    tint: Colors.lavenderDim,
    href: '/admin/content',
  },
  {
    icon: 'upload',
    label: 'Upload',
    hint: 'Add videos to any channel',
    tint: Colors.brandBlueDim,
    href: '/admin/upload',
  },
  {
    icon: 'bell',
    label: 'Announcement',
    hint: 'Message all users',
    tint: Colors.brandCyanDim,
    href: '/admin/broadcast',
  },
  {
    icon: 'flag',
    label: 'Reports',
    hint: 'Reported content and users',
    tint: Colors.dangerDim,
    href: '/admin/reports',
  },
  {
    icon: 'chart',
    label: 'Channel activity',
    hint: 'What is growing',
    tint: Colors.successDim,
    href: '/admin/channel-activity',
  },
  {
    icon: 'history',
    label: 'Audit log',
    hint: 'Every admin action',
    tint: Colors.neutralDim,
    href: '/admin/audit',
  },
];

type QueueTab = 'channels' | 'posts';

export default function AdminDashboardScreen() {
  const router = useRouter();
  const queue = useReviewQueue();
  const [tab, setTab] = useState<QueueTab>('channels');
  const refreshControl = usePullToRefresh(queue.reload);

  const items = tab === 'channels' ? queue.channels : queue.posts;

  return (
    <AdminScreen title="Admin Panel" fallbackHref="/(tabs)/profile">
      <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
        <View style={toolGridStyle}>
          {TOOLS.map(tool => (
            <ToolTile
              key={tool.label}
              icon={tool.icon}
              label={tool.label}
              hint={tool.hint}
              tint={tool.tint}
              badge={
                tool.href === '/admin/pending-channels'
                  ? queue.channels.length
                  : tool.href === '/admin/pending-channel-content'
                    ? queue.posts.length
                    : undefined
              }
              onPress={() => router.push(tool.href)}
            />
          ))}
        </View>

        <Text style={[adminStyles.section, styles.queueTitle]}>REVIEW QUEUE</Text>
        <UnderlineTabs
          tabs={[
            { key: 'channels', label: `Channels (${queue.channels.length})` },
            { key: 'posts', label: `Posts (${queue.posts.length})` },
          ]}
          selected={tab}
          onSelect={setTab}
        />

        <View style={adminStyles.list}>
          {queue.loading ? (
            <ActivityIndicator color={Colors.brandBlue} style={styles.loading} />
          ) : items.length === 0 ? (
            <EmptyState icon="check-circle" title="All caught up" message={`No ${tab} waiting.`} />
          ) : tab === 'channels' ? (
            queue.channels.map(channel => (
              <PendingChannelCard key={channel.id} channel={channel} queue={queue} />
            ))
          ) : (
            queue.posts.map(post => <PendingPostCard key={post.id} post={post} queue={queue} />)
          )}
        </View>
      </ScrollView>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  queueTitle: { marginTop: 0, marginLeft: Spacing.lg },
  loading: { marginTop: 40 },
});
