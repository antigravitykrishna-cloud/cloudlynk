import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloudlynkLogo } from '@/components/ui/CloudlynkLogo';
import { EmptyState, LoadFailedState } from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { TabHeader } from '@/components/ui/TabHeader';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Colors, Spacing } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { postsApi } from '@/features/content/api/postsApi';
import { FeedRow } from '@/features/content/components/FeedRow';
import { usePersonaStore } from '@/lib/stores/personaStore';
import type { ListedPost } from '@/features/content/model';

// The newest posts from the channels you joined. A premium title shows a lock and opens the plans;
// anything else opens its channel.

export default function FeedScreen() {
  const router = useRouter();
  const { user, isPaidUser, isGuest } = useAuth();
  const userId = user?.id;
  const [posts, setPosts] = useState<ListedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  // Check persona access state
  const { isRejected, needsAdminApproval } = usePersonaStore();

  const load = useCallback(async () => {
    try {
      // Signed out, nothing is joined, so there is nothing to fetch.
      setPosts(userId ? await postsApi.listFeed(userId) : []);
      setLoadFailed(false);
    } catch (err) {
      if (__DEV__) console.error('Feed load error:', err);
      // Keep what is listed: blanking a working feed loses the person their place.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const refreshControl = usePullToRefresh(load);

  const isLocked = (post: ListedPost) => post.access_level === 'premium' && !isPaidUser;

  const open = (post: ListedPost) => {
    if (isLocked(post)) router.push('/premium');
    else router.push({ pathname: '/(tabs)/channels/[id]', params: { id: post.channel_id } });
  };

  // Show rejection message if user is rejected
  if (isRejected) {
    return (
      <SafeAreaView style={styles.page} edges={['top']}>
        <TabHeader title="Feed" />
        <View style={styles.blockMessage}>
          <Text style={styles.blockTitle}>Access Restricted</Text>
          <Text style={styles.blockText}>
            Your account has been restricted and cannot access premium content at this time.
            Please contact support for more information.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show pending approval message for organic users awaiting approval
  if (needsAdminApproval) {
    return (
      <SafeAreaView style={styles.page} edges={['top']}>
        <TabHeader title="Feed" />
        <View style={styles.blockMessage}>
          <Text style={styles.blockTitle}>Under Review</Text>
          <Text style={styles.blockText}>
            Your account is under review. You'll have full access once approved. Thank you for your patience.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <TabHeader title="Feed" />

      {loading ? (
        <ListSkeleton rows={6} />
      ) : posts.length === 0 ? (
        <ScrollView contentContainerStyle={styles.grow} refreshControl={refreshControl}>
          {loadFailed ? (
            <LoadFailedState what="the feed" onRetry={load} />
          ) : (
            <EmptyFeed signedIn={!!userId} isGuest={isGuest} />
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {posts.map((post, index) => (
            <FeedRow
              key={post.id}
              post={post}
              index={index}
              locked={isLocked(post)}
              onPress={() => open(post)}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * The empty Feed's next step. A guest account cannot join channels, so for it the step is saving
 * the account; everyone else is sent to browse channels.
 */
function EmptyFeed({ signedIn, isGuest }: { signedIn: boolean; isGuest: boolean }) {
  const router = useRouter();
  const step = isGuest
    ? {
        message:
          'Save your account with Google or email to join channels. Their newest videos show up here.',
        action: { label: 'Save your account', onPress: () => router.push('/save-account') },
      }
    : {
        message: signedIn
          ? 'Join the channels you like. Their newest videos show up here.'
          : 'Browse channels and join the ones you like. Their newest videos show up here.',
        action: { label: 'Browse channels', onPress: () => router.push('/(tabs)/channels') },
      };

  return (
    <EmptyState
      artwork={<CloudlynkLogo size={72} />}
      title="Join channels to get content here!"
      message={step.message}
      action={step.action}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  grow: { flexGrow: 1 },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xxl },
  blockMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  blockTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  blockText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
