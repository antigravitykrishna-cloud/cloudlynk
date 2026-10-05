import { Linking } from 'react-native';
import { Button } from '@/components/ui/Button';
import { showAlert } from '@/components/ui/Feedback';
import { publicMedia } from '@/lib/publicMedia';
import { Colors } from '@/theme';
import { errorMessage } from '@/utils/errors';
import { formatBytes, formatClock, formatTimeAgo } from '@/utils/format';
import {
  adminModerationApi,
  type PendingChannel,
  type PendingLegacyVideo,
  type PendingPost,
} from '@/features/admin/api/adminModerationApi';
import { ReviewCard } from '@/features/admin/components/ReviewCard';
import type { useReviewQueue } from '@/features/admin/hooks/useReviewQueue';

// The three kinds of review item, each as a ReviewCard wired to the shared review queue.

type Queue = ReturnType<typeof useReviewQueue>;

export function PendingChannelCard({ channel, queue }: { channel: PendingChannel; queue: Queue }) {
  return (
    <ReviewCard
      icon={channel.is_public ? 'globe' : 'lock'}
      title={channel.name}
      meta={[
        `by ${channel.owner?.full_name ?? channel.owner?.email ?? 'Unknown'} · ${formatTimeAgo(channel.created_at)}`,
      ]}
      description={channel.description}
      busy={queue.actingOn === channel.id}
      onApprove={() => queue.approveChannel(channel)}
      onReject={() => queue.rejectChannel(channel)}
    />
  );
}

export function PendingPostCard({
  post,
  queue,
  onReject,
}: {
  post: PendingPost;
  queue: Queue;
  /** Replaces the standard confirm-and-reject, e.g. to ask for a reason first. */
  onReject?: () => void;
}) {
  const thumbnail = post.thumbnail_url ?? post.media_url;
  return (
    <ReviewCard
      icon="edit"
      iconTint={Colors.pastelLavender}
      title={post.title ?? post.body?.slice(0, 40) ?? 'Untitled'}
      meta={[
        `${post.author?.full_name ?? 'Unknown'} → #${post.channel?.name ?? '?'} · ${formatTimeAgo(post.created_at)}`,
        post.content_type.toUpperCase(),
      ]}
      description={post.body}
      imageUri={thumbnail ? publicMedia.url(thumbnail) : null}
      busy={queue.actingOn === post.id}
      onApprove={() => queue.approvePost(post)}
      onReject={onReject ?? (() => queue.rejectPost(post))}
      rejectWarning="The author will be notified."
    />
  );
}

export function PendingLegacyVideoCard({
  video,
  queue,
}: {
  video: PendingLegacyVideo;
  queue: Queue;
}) {
  const play = async () => {
    try {
      await Linking.openURL(await adminModerationApi.legacyVideoPreviewUrl(video.storage_path));
    } catch (err) {
      showAlert('Could not open video', errorMessage(err, 'Please try again.'));
    }
  };
  const duration = video.duration_seconds == null ? '--:--' : formatClock(video.duration_seconds);

  return (
    <ReviewCard
      icon="film"
      title={video.title ?? 'Untitled video'}
      meta={[
        `${video.channelName ?? 'Unknown channel'} · ${video.uploaderEmail ?? 'Unknown'}`,
        `${formatBytes(video.file_size_bytes ?? 0)} · ${duration} · ${formatTimeAgo(video.created_at)}`,
      ]}
      extra={<Button label="Play" icon="play" variant="secondary" size="sm" onPress={play} />}
      busy={queue.actingOn === video.id}
      onApprove={() => queue.setVideoStatus(video, 'approved')}
      onReject={() => queue.setVideoStatus(video, 'rejected')}
      rejectWarning="The video will be marked as rejected."
    />
  );
}
