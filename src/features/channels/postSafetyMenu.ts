import { showAlert } from '@/components/ui/Feedback';
import type { ChannelPost } from '@/features/content/model';
import { safetyApi } from '@/features/channels/api/safetyApi';
import { errorMessage } from '@/utils/errors';

const POST_REPORT_REASONS = [
  { label: 'Inappropriate content', reason: 'inappropriate_content' },
  { label: 'Copyright violation', reason: 'copyright_violation' },
];

const USER_REPORT_REASONS = [
  { label: 'Harassment or bullying', reason: 'harassment' },
  { label: 'Spam or scam account', reason: 'spam' },
  { label: 'Impersonation', reason: 'impersonation' },
  { label: 'Hate speech', reason: 'hate_speech' },
  { label: 'Other', reason: 'other' },
];

const failed = (fallback: string) => (err: unknown) =>
  showAlert('Error', errorMessage(err, fallback));

/**
 * The "⋯" menu on a post: report the post, report its uploader's account, or block the uploader.
 * `onBlocked` runs after a successful block, e.g. to close the post.
 */
export function showPostSafetyMenu({
  post,
  userId,
  channelId,
  onBlocked,
}: {
  post: ChannelPost;
  userId: string;
  channelId: string;
  onBlocked: () => void;
}) {
  const uploader = post.author?.full_name ?? 'this user';
  const isOwnPost = post.author_id === userId;

  const reportPost = () =>
    showAlert('Report this content', 'Why are you reporting it?', [
      ...POST_REPORT_REASONS.map(({ label, reason }) => ({
        text: label,
        onPress: () =>
          safetyApi
            .reportPost({
              channelId,
              reporterId: userId,
              reason,
              postId: post.id,
              authorId: post.author_id,
            })
            .then(() => showAlert('Reported', 'Thanks — our team will review this.'))
            .catch(failed('Could not submit report.')),
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);

  // About the uploader's behaviour in general, not this one upload.
  const reportUser = () =>
    showAlert(`Report ${uploader}`, 'Why are you reporting this account?', [
      ...USER_REPORT_REASONS.map(({ label, reason }) => ({
        text: label,
        onPress: () =>
          safetyApi
            .reportUser(userId, post.author_id, reason)
            .then(() => showAlert('Reported', 'Thanks — our team will review this account.'))
            .catch(failed('Could not submit report.')),
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);

  const block = () =>
    showAlert('Block this uploader?', `You won't see content from ${uploader} anymore.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () =>
          safetyApi
            .blockUser(userId, post.author_id)
            .then(() => {
              showAlert('Blocked');
              onBlocked();
            })
            .catch(failed('Could not block user.')),
      },
    ]);

  showAlert('More options', undefined, [
    { text: 'Report content', onPress: reportPost },
    // Reporting or blocking yourself makes no sense.
    ...(isOwnPost
      ? []
      : [
          { text: 'Report user', onPress: reportUser },
          { text: 'Block uploader', style: 'destructive' as const, onPress: block },
        ]),
    { text: 'Cancel', style: 'cancel' },
  ]);
}
