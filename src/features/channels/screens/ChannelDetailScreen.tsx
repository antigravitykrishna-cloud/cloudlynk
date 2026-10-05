import { useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { showAlert } from '@/components/ui/Feedback';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors, Spacing } from '@/theme';
import { LoginSheet } from '@/features/auth/components/LoginSheet';
import { promptSaveAccount } from '@/features/auth/guestPrompts';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { channelsApi } from '@/features/channels/api/channelsApi';
import { ChannelHero } from '@/features/channels/components/ChannelHero';
import { PendingReviewList } from '@/features/channels/components/PendingReviewList';
import { PostShelf } from '@/features/channels/components/PostShelf';
import { useChannelDetail } from '@/features/channels/hooks/useChannelDetail';
import { showPostSafetyMenu } from '@/features/channels/postSafetyMenu';
import { PostDetailModal } from '@/features/content/components/PostDetailModal';
import { useWatchGate } from '@/features/content/hooks/useWatchGate';
import type { ChannelPost } from '@/features/content/model';
import { errorMessage } from '@/utils/errors';

// A channel's page. Anyone can open it and see what it has; joining needs an account, and watching
// needs the right to the title (see watchAccess.ts).

export default function ChannelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin, isPaidUser, isGuest } = useAuth();
  const mayWatch = useWatchGate();
  const { channel, shelves, awaitingReview, isMember, loading, reload, markJoined } =
    useChannelDetail(id);
  const refreshControl = usePullToRefresh(reload);

  const [selected, setSelected] = useState<ChannelPost | null>(null);
  const [joining, setJoining] = useState(false);
  const [signInSheetOpen, setSignInSheetOpen] = useState(false);

  const isOwner = !!user && channel?.owner_id === user.id;
  const featured = shelves.find(shelf => shelf.title === 'Featured')?.items[0] ?? null;

  const openPost = (post: ChannelPost) => {
    if (mayWatch(post, { isOwner })) setSelected(post);
  };

  // A signed-out visitor gets the sign-in sheet and a guest account the "save your account" prompt.
  // A public channel needs no plan to join (the plan is asked for on watching); a hidden one does.
  const join = async () => {
    if (!id) return;
    if (!user) {
      setSignInSheetOpen(true);
      return;
    }
    if (isGuest) {
      promptSaveAccount(router, 'join channels');
      return;
    }
    if (channel && !channel.is_public && !isPaidUser && !isAdmin && !isOwner) {
      router.push('/premium');
      return;
    }
    setJoining(true);
    try {
      await channelsApi.join(id);
      markJoined();
      await reload();
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not join this channel.'));
    } finally {
      setJoining(false);
    }
  };

  const openUpload = (pathname: '/upload/add-content' | '/upload/queue') =>
    router.push({ pathname, params: { channelId: id } });

  if (loading) {
    return (
      <View style={[styles.page, styles.centered]}>
        <ActivityIndicator color={Colors.brandBlue} size="large" />
      </View>
    );
  }

  const hasApprovedContent = shelves.length > 0;

  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <ChannelHero
          channel={channel}
          featured={featured}
          isMember={isMember}
          joining={joining}
          onBack={() => router.replace('/(tabs)/channels')}
          onJoin={join}
          onOpen={openPost}
        />

        {isAdmin && (
          <View style={styles.adminActions}>
            <Button
              label="+ Add Content"
              variant="outline"
              onPress={() => openUpload('/upload/add-content')}
            />
            <Button
              label="Upload Queue"
              variant="secondary"
              onPress={() => openUpload('/upload/queue')}
            />
          </View>
        )}

        {(isAdmin || isOwner) && <PendingReviewList posts={awaitingReview} />}

        {hasApprovedContent ? (
          shelves.map(shelf => <PostShelf key={shelf.title} shelf={shelf} onSelect={openPost} />)
        ) : (
          <EmptyState
            icon="film"
            title="No content yet"
            message="New movies and series will appear here."
            action={
              isAdmin
                ? { label: 'Add First Content', onPress: () => openUpload('/upload/add-content') }
                : undefined
            }
          />
        )}
      </ScrollView>

      <PostDetailModal
        post={selected}
        onClose={() => setSelected(null)}
        userId={user?.id}
        showAuthor
        onMore={
          selected && user && id
            ? () =>
                showPostSafetyMenu({
                  post: selected,
                  userId: user.id,
                  channelId: id,
                  onBlocked: () => setSelected(null),
                })
            : undefined
        }
      />
      <LoginSheet
        allowGuest={false}
        visible={signInSheetOpen}
        onClose={() => setSignInSheetOpen(false)}
        message="Sign in to join this channel. It only takes a moment."
        returnTo={id ? { pathname: '/(tabs)/channels/[id]', params: { id } } : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 40 },
  adminActions: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl, gap: Spacing.sm },
});
