import { callEdgeFunction } from '@/lib/edgeFunctions';

/** The server's generic refusal; it never says whether a post is premium or exists at all. */
const UNAVAILABLE = "This video isn't available.";

export const playbackApi = {
  /**
   * A short-lived signed Cloudflare Stream URL for a post's video, from the stream-playback-token
   * function. Every video is locked on Cloudflare, free ones included; the server checks that the
   * caller may watch this post (a plan, an admin grant, or a free title) and refuses guests and
   * suspended accounts. Throws a message fit to show the person.
   */
  async getPlaybackUrl(postId: string): Promise<string> {
    const res = await callEdgeFunction<{ url?: string }>(
      'stream-playback-token',
      { postId },
      {
        signedOutMessage: 'Please sign in to watch this video.',
        unreachableMessage:
          'Could not reach the video service. Check your connection and try again.',
      },
    );
    if (res.status === 403) {
      const reason = res.data?.error;
      throw new Error(
        reason && reason !== UNAVAILABLE ? reason : 'Subscribe to Premium to watch this video.',
      );
    }
    if (!res.ok || !res.data?.url) {
      throw new Error(res.data?.error ?? "This video isn't available right now.");
    }
    return res.data.url;
  },
};
