import { useCallback, useState } from 'react';
import { FlatList, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadFailedState } from '@/components/ui/EmptyState';
import { ExploreSkeleton } from '@/components/ui/Skeleton';
import { TabHeader } from '@/components/ui/TabHeader';
import { UnderlineTabs } from '@/components/ui/Tabs';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { postsApi, type ExploreSort } from '@/features/content/api/postsApi';
import { PostDetailModal } from '@/features/content/components/PostDetailModal';
import { SectionBlock } from '@/features/content/components/SectionBlock';
import { useExploreCatalog } from '@/features/content/hooks/useExploreCatalog';
import { useWatchGate } from '@/features/content/hooks/useWatchGate';
import type { ChannelPost } from '@/features/content/model';

// The landing tab: every title the viewer can browse, as shelves. Guests browse too; tapping a
// title routes them to what unlocks it (see watchAccess.ts).

const SORTS: { key: ExploreSort; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'popular', label: 'Popular' },
  { key: 'most_watched', label: 'Most watched' },
  { key: 'latest', label: 'Latest' },
  { key: 'most_searched', label: 'Most searched' },
];

export default function ExploreScreen() {
  const { user } = useAuth();
  const mayWatch = useWatchGate();
  const [sort, setSort] = useState<ExploreSort>('all');
  const [selected, setSelected] = useState<ChannelPost | null>(null);
  const { shelves, loading, loadFailed, reload } = useExploreCatalog(sort);
  const refreshControl = usePullToRefresh(reload);

  const open = useCallback(
    (post: ChannelPost) => {
      if (!mayWatch(post)) return;
      setSelected(post);
      postsApi.recordView(post.id);
    },
    [mayWatch],
  );

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <TabHeader title="Explore" />
      <UnderlineTabs tabs={SORTS} selected={sort} onSelect={setSort} />

      {loading ? (
        <ExploreSkeleton />
      ) : shelves.length === 0 ? (
        <ScrollView contentContainerStyle={styles.grow} refreshControl={refreshControl}>
          {loadFailed ? (
            <LoadFailedState what="content" onRetry={reload} />
          ) : (
            <EmptyState
              icon="compass"
              title="No content available"
              message="New titles appear here as soon as they are approved."
            />
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={shelves}
          keyExtractor={shelf => shelf.title}
          showsVerticalScrollIndicator={false}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          refreshControl={refreshControl}
          renderItem={({ item }) => <SectionBlock shelf={item} onSelect={open} />}
          contentContainerStyle={styles.list}
        />
      )}

      <PostDetailModal
        post={selected}
        onClose={() => setSelected(null)}
        userId={user?.id}
        canShare
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  grow: { flexGrow: 1 },
  list: { paddingBottom: 40 },
});
