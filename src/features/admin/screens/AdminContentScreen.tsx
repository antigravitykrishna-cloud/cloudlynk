import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, TextButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { PillTabs } from '@/components/ui/Tabs';
import { Colors, Spacing } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatDateTime } from '@/utils/format';
import type { AccessLevel } from '@/features/content/model';
import {
  adminContentApi,
  type AdminPost,
  type AdminPostStatus,
} from '@/features/admin/api/adminContentApi';
import { AdminScreen } from '@/features/admin/components/AdminScreen';
import { adminStyles } from '@/features/admin/components/adminStyles';

// Everything published, filterable by status and access level: publish or unpublish, switch free /
// premium, manage who has access, edit in place.

type StatusFilter = AdminPostStatus | 'all';
type AccessFilter = AccessLevel | 'all';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
];

const ACCESS_FILTERS: { key: AccessFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Free' },
  { key: 'premium', label: 'Premium' },
];

const STATUS_TONE: Record<AdminPostStatus, ChipTone> = {
  draft: 'neutral',
  pending: 'warn',
  approved: 'good',
  rejected: 'bad',
  removed: 'neutral',
};

export default function AdminContentScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [access, setAccess] = useState<AccessFilter>('all');
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      adminContentApi
        .listPosts({ status, accessLevel: access })
        .then(setPosts)
        .catch(err =>
          showAlert('Could not load content', errorMessage(err, 'Check your connection.')),
        )
        .finally(() => setLoading(false));
    }, [status, access]),
  );

  async function change(post: AdminPost, patch: Partial<AdminPost>, action: () => Promise<void>) {
    setActingOn(post.id);
    try {
      await action();
      setPosts(list => list.map(item => (item.id === post.id ? { ...item, ...patch } : item)));
    } catch (err) {
      showAlert('Not changed', errorMessage(err, 'Please try again.'));
    } finally {
      setActingOn(null);
    }
  }

  const toggleAccess = (post: AdminPost) => {
    const next: AccessLevel = post.access_level === 'premium' ? 'free' : 'premium';
    showAlert(
      next === 'free' ? 'Make this free?' : 'Make this premium?',
      next === 'free'
        ? 'Anyone will be able to watch it.'
        : 'Only subscribers, and people you grant access to, will be able to watch it. The video is locked on Cloudflare first; if that fails, nothing changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next === 'free' ? 'Make free' : 'Make premium',
          onPress: () =>
            change(post, { access_level: next }, () =>
              adminContentApi.setPostAccessLevel(post.id, next),
            ),
        },
      ],
    );
  };

  const togglePublished = (post: AdminPost) => {
    const next: AdminPostStatus = post.status === 'approved' ? 'draft' : 'approved';
    change(post, { status: next }, () => adminContentApi.setPostStatus(post.id, next));
  };

  return (
    <AdminScreen
      title="Content"
      right={<TextButton label="Upload" onPress={() => router.push('/admin/upload')} />}
    >
      <View style={styles.filters}>
        <PillTabs tabs={STATUS_FILTERS} selected={status} onSelect={setStatus} />
        <PillTabs tabs={ACCESS_FILTERS} selected={access} onSelect={setAccess} />
      </View>
      {loading ? (
        <ActivityIndicator color={Colors.brandBlue} size="large" style={styles.loading} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={post => post.id}
          contentContainerStyle={adminStyles.list}
          ListEmptyComponent={<EmptyState icon="film" title="No content matches these filters" />}
          renderItem={({ item }) => (
            <Card>
              <View style={[adminStyles.row, styles.header]}>
                <Text style={[adminStyles.name, styles.flex]} numberOfLines={1}>
                  {item.title || item.body?.slice(0, 40) || 'Untitled'}
                </Text>
                <Chip label={item.status.toUpperCase()} tone={STATUS_TONE[item.status]} />
              </View>
              <Text style={adminStyles.muted}>
                {item.content_type}
                {item.genre ? ` · ${item.genre}` : ''}
                {item.duration_min ? ` · ${item.duration_min} min` : ''}
              </Text>
              <Text style={[adminStyles.muted, item.access_level === 'premium' && styles.premium]}>
                {item.access_level === 'premium' ? 'Premium' : 'Free'} ·{' '}
                {formatDateTime(item.created_at)}
              </Text>
              <View style={adminStyles.actions}>
                <Button
                  label={`Make ${item.access_level === 'premium' ? 'free' : 'premium'}`}
                  variant="secondary"
                  size="sm"
                  busy={actingOn === item.id}
                  onPress={() => toggleAccess(item)}
                />
                <Button
                  label="Manage access"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    router.push({ pathname: '/admin/post-access', params: { postId: item.id } })
                  }
                />
                {/* Edits in place, so the post keeps its id and every access grant on it. */}
                <Button
                  label="Edit"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    router.push({ pathname: '/admin/edit-post', params: { postId: item.id } })
                  }
                />
                <Button
                  label={item.status === 'approved' ? 'Unpublish' : 'Publish'}
                  variant={item.status === 'approved' ? 'warning' : 'primary'}
                  size="sm"
                  disabled={actingOn === item.id}
                  onPress={() => togglePublished(item)}
                />
              </View>
            </Card>
          )}
        />
      )}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.sm },
  loading: { marginTop: 60 },
  header: { justifyContent: 'space-between', marginBottom: Spacing.xs },
  flex: { flex: 1 },
  premium: { color: Colors.gold },
});
