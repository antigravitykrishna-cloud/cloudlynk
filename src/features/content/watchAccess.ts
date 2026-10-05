import type { AccessLevel } from '@/features/content/model';

export type Viewer = {
  signedIn: boolean;
  isGuest: boolean;
  isPaidUser: boolean;
  isAdmin: boolean;
  /** Owns the channel the post belongs to. */
  isOwner?: boolean;
};

/**
 * What happens when someone taps a title:
 *  - `play`: open it.
 *  - `guest`: signed out or a guest account. Guests see previews only; nothing plays until the
 *    account is saved, and then the plan decides.
 *  - `plans`: a signed-in account without the right to this premium title. Show the plans.
 *
 * Presentation only: the server decides who gets a playback URL.
 */
export function watchDecision(
  post: { access_level: AccessLevel },
  viewer: Viewer,
): 'play' | 'guest' | 'plans' {
  if (!viewer.signedIn || viewer.isGuest) return 'guest';
  if (post.access_level !== 'premium') return 'play';
  if (viewer.isPaidUser || viewer.isAdmin || viewer.isOwner) return 'play';
  return 'plans';
}
