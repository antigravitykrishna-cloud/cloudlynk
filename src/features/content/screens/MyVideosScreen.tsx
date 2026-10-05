import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { UnderlineTabs } from '@/components/ui/Tabs';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/theme';
import { formatDate } from '@/utils/format';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { postsApi, type MyPost } from '@/features/content/api/postsApi';
import type { PostStatus } from '@/features/content/model';

// Everything the person has submitted, with where each one is in review.

type Filter = 'all' | 'pending' | 'approved' | 'rejected';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_TONE: Record<PostStatus, ChipTone> = {
  approved: 'good',
  pending: 'warn',
  rejected: 'bad',
  draft: 'neutral',
};

export default function MyVideosScreen() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('pending');
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setPosts(await postsApi.listMine(filter === 'all' ? undefined : filter));
    } catch (err) {
      if (__DEV__) console.error('My videos load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <ScreenHeader title="My Videos" />
      <UnderlineTabs tabs={FILTERS} selected={filter} onSelect={setFilter} />

      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.spinner} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon="video"
          title={filter === 'all' ? 'No video submissions yet.' : `No ${filter} submissions.`}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {posts.map(post => (
            <SubmissionRow key={post.id} post={post} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SubmissionRow({ post }: { post: MyPost }) {
  const openVideo = () => {
    if (post.video_url) Linking.openURL(post.video_url).catch(() => {});
  };

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={openVideo}
      activeOpacity={post.video_url ? 0.7 : 1}
      disabled={!post.video_url}
    >
      <View style={styles.thumbnail}>
        <Icon name={post.thumbnail_url ? 'film' : 'video'} size={26} color={Colors.textMuted} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {post.title ?? 'Untitled'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {post.channel_name ?? 'Unknown channel'}
          {post.content_type ? ` · ${post.content_type}` : ''}
        </Text>
        <Chip label={post.status.toUpperCase()} tone={STATUS_TONE[post.status] ?? 'neutral'} />
        <Text style={styles.date}>Submitted {formatDate(post.created_at)}</Text>
        {post.status === 'approved' && post.approved_at ? (
          <Text style={[styles.date, styles.approved]}>
            Approved on {formatDate(post.approved_at)}
          </Text>
        ) : null}
        {post.status === 'rejected' && post.rejection_note ? (
          <Text style={[styles.date, styles.rejected]}>{post.rejection_note}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: 60 },
  list: { paddingVertical: Spacing.sm, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  thumbnail: {
    width: 80,
    height: 110,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, justifyContent: 'center', gap: Spacing.xs },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  meta: { fontSize: FontSize.sm, color: Colors.textMuted },
  date: { fontSize: FontSize.xs, color: Colors.textMuted },
  approved: { color: Colors.success },
  rejected: { color: Colors.danger },
});
