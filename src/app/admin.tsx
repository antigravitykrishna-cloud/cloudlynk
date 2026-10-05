import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { ToolTile } from '@/components/admin/AdminUI';
import { ADMIN_TOOLS } from '@/components/admin/adminTools';
import { ReviewCard, ReviewEmpty } from '@/components/admin/ReviewCard';
import { showAlert } from '@/components/ui/Feedback';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { useAdminReview } from '@/hooks/useAdminReview';
import { useAuth } from '@/hooks/useAuth';
import { formatTimeAgo } from '@/lib/data/files';
import { PostService } from '@/lib/data/posts';

type QueueTab = 'channels' | 'posts';

export default function AdminScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<QueueTab>('channels');
  const review = useAdminReview(profile?.id);

  useEffect(() => {
    if (profile && !profile.is_admin) {
      showAlert('Access denied');
      router.replace('/(tabs)/profile');
    }
  }, [profile, router]);

  const counts: Record<QueueTab, number> = {
    channels: review.channels.length,
    posts: review.posts.length,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace('/(tabs)/profile')}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={review.refreshing}
            onRefresh={review.refresh}
            tintColor={Colors.brandBlue}
          />
        }
      >
        <View style={styles.toolGrid}>
          {ADMIN_TOOLS.map(t => (
            <ToolTile
              key={t.label}
              icon={t.icon}
              label={t.label}
              hint={t.hint}
              tint={t.tint}
              onPress={() => router.push(t.href)}
            />
          ))}
        </View>

        <Text style={styles.queueLabel}>REVIEW QUEUE</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>{counts.channels}</Text>
            <Text style={styles.summaryLbl}>Channels</Text>
          </View>
          <View style={[styles.summaryItem, styles.summaryDivider]}>
            <Text style={styles.summaryVal}>{counts.posts}</Text>
            <Text style={styles.summaryLbl}>Posts</Text>
          </View>
        </View>
        <View style={styles.tabRow}>
          {(['channels', 'posts'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtActive]}>
                {`${tab === 'channels' ? 'Channels' : 'Posts'} (${counts[tab]})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {review.loading ? (
          <ActivityIndicator color={Colors.brandBlue} style={{ marginTop: 40 }} />
        ) : activeTab === 'channels' ? (
          review.channels.length === 0 ? (
            <ReviewEmpty message="No channels waiting." />
          ) : (
            review.channels.map(ch => (
              <ReviewCard
                key={ch.id}
                icon={ch.is_public ? 'globe' : 'lock'}
                title={ch.name}
                meta={`by ${ch.owner?.full_name ?? ch.owner?.email ?? 'Unknown'} · ${formatTimeAgo(ch.created_at)}`}
                description={ch.description}
                busy={review.reviewing === ch.id}
                onApprove={() => review.approveChannel(ch)}
                onReject={() => review.rejectChannel(ch)}
              />
            ))
          )
        ) : review.posts.length === 0 ? (
          <ReviewEmpty message="No posts waiting." />
        ) : (
          review.posts.map(post => {
            const thumbPath = post.thumbnail_url ?? post.media_url;
            return (
              <ReviewCard
                key={post.id}
                icon="edit"
                iconSize={18}
                iconColor={Colors.pastelLavender}
                iconBg={Colors.lavenderDim}
                title={post.title ?? post.body?.slice(0, 40) ?? 'Untitled'}
                titleLines={1}
                meta={`${post.author?.full_name ?? 'Unknown'} → #${post.channel?.name ?? '?'} · ${formatTimeAgo(post.created_at)}`}
                description={post.body}
                descriptionLines={4}
                imageUrl={thumbPath ? PostService.getMediaPublicUrl(thumbPath) : null}
                busy={review.reviewing === post.id}
                onApprove={() => review.approvePost(post)}
                onReject={() => review.rejectPost(post)}
              />
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 26, color: Colors.brandBlue, fontWeight: FontWeight.bold },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    textAlign: 'center',
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  queueLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    marginLeft: Spacing.lg + 4,
    marginTop: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    margin: Spacing.lg,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg },
  summaryDivider: { borderLeftWidth: 0.5, borderLeftColor: Colors.border },
  summaryVal: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.brandBlue,
  },
  summaryLbl: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginTop: 4,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: 3,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.surface },
  tabTxt: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted },
  tabTxtActive: { color: Colors.text },
});
