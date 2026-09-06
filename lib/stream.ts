import * as DocumentPicker from 'expo-document-picker';
import { supabase } from './supabase';

export type VideoMeta = { uri: string; name: string; size: number };

/** Cloudflare Stream (Bundle Basic) cap in MB. Warn at pick time. */
export const STREAM_MAX_MB = 180;

export const StreamService = {

  async pickVideo(): Promise<VideoMeta | null> {
    // DocumentPicker avoids the Android MediaStore thumbnail bug that crashes
    // the system Photos picker for videos >~10s. Works for files of any size
    // (multi-GB movies, series, etc.) and surfaces the real file URI.
    // copyToCacheDirectory: false → stream directly from the content:// URI,
    // no copy step (avoids hangs/OOM on the emulator for large files).
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: false,
      multiple: false,
    });
    if (result.canceled || result.assets.length === 0) return null;

    const asset = result.assets[0];
    const size = asset.size ?? 0;
    const name = asset.name ?? asset.uri.split('/').pop() ?? 'video.mp4';
    return { uri: asset.uri, name, size };
  },

  /**
   * Multi-select video picker for the upload queue (v0.7.0).
   * Uses expo-document-picker with multiple: true — the system file picker
   * lets the user select N files at once. content:// URIs are streamed
   * directly (copyToCacheDirectory: false), avoiding copy OOM on large files.
   *
   * Files over STREAM_MAX_MB (180 MB) are NOT filtered here — the queue
   * screen warns and can reject them per-item. This avoids deleting files
   * from the user's selection without their knowledge.
   */
  async pickVideos(): Promise<VideoMeta[]> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: false,
      multiple: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return [];
    }

    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name ?? asset.uri.split('/').pop() ?? 'video.mp4',
      size: asset.size ?? 0,
    }));
  },

  async uploadVideo(
    meta: VideoMeta,
    onProgress: (pct: number) => void,
    channelId?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    onProgress(0);

    // Check if already aborted before starting
    if (signal?.aborted) throw new Error('Upload cancelled');

    // Step 1 — get a direct-upload URL + UID from the Edge Function
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !session) throw new Error('Not authenticated');

    if (signal?.aborted) throw new Error('Upload cancelled');

    const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-stream-upload`;
    const fnRes = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileSize: meta.size, fileName: meta.name, channelId }),
      signal,
    });

    const fnJson = await fnRes.json();
    if (!fnRes.ok) throw new Error(fnJson.error ?? 'Failed to get Stream upload URL');
    const { uploadURL, uid } = fnJson as { uploadURL: string; uid: string };

    onProgress(0.05); // edge function returned

    // Step 2 — upload the file to Cloudflare Stream via XMLHttpRequest using FormData.
    // This avoids native expo-file-system bugs where uploadAsync hangs on completion on Android.
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();

      // Append file payload inside the 'file' field required by Cloudflare Stream
      formData.append('file', {
        uri: meta.uri,
        type: 'video/mp4',
        name: meta.name,
      } as any);

      // Stall watchdog: large uploads on slow links are fine as long as bytes
      // keep moving. We only abort if NO progress happens for STALL_MS — that
      // means the connection died. A legit slow upload keeps resetting the timer
      // via progress events, so it is never killed for merely being slow.
      const STALL_MS = 90_000;
      let settled = false;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (stallTimer) clearTimeout(stallTimer);
        fn();
      };
      const armStall = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          try { xhr.abort(); } catch {}
          finish(() => reject(new Error('Upload stalled — no data was sent for 90 seconds. Check your connection and try again.')));
        }, STALL_MS);
      };

      xhr.upload.addEventListener('progress', (event) => {
        armStall(); // bytes moved — reset the watchdog
        if (event.lengthComputable && event.total > 0) {
          onProgress(0.05 + (event.loaded / event.total) * 0.94);
        }
      });

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(1);
          finish(() => resolve(uid));
        } else if (xhr.status === 413) {
          // Cloudflare returns an HTML 413 page — never surface that raw body.
          finish(() => reject(new Error('Video is too large for the current Cloudflare Stream plan. Maximum upload size is 200 MB. Please pick a smaller file.')));
        } else if (xhr.status >= 500) {
          finish(() => reject(new Error('Cloudflare is having trouble receiving the file right now. Please try again in a moment.')));
        } else {
          finish(() => reject(new Error(`Video upload failed (HTTP ${xhr.status}). Please try again.`)));
        }
      };

      xhr.onerror = () => {
        finish(() => reject(new Error('Network error occurred during video upload.')));
      };

      // Wire abort signal to XHR so pauseUpload actually cancels the in-flight upload
      if (signal) {
        if (signal.aborted) {
          finish(() => reject(new Error('Upload cancelled')));
          return;
        }
        const onAbort = () => {
          try { xhr.abort(); } catch {}
          finish(() => reject(new Error('Upload cancelled')));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }

      armStall(); // start the watchdog before the request begins
      xhr.open('POST', uploadURL);
      xhr.send(formData);
    });
  },

  /** Returns a Cloudflare Stream embed/watch URL from a stored UID */
  getPlaybackUrl(uid: string): string {
    return `https://iframe.videodelivery.net/${uid}`;
  },

  /**
   * Returns HLS streaming manifest URL for native video players (expo-video).
   * MUST use the videodelivery.net delivery host — NOT iframe.videodelivery.net,
   * which serves the HTML embed page (content-type text/html). Handing that HTML
   * to expo-video yields a 00:00/00:00 black player. (Regression of commit cb19029.)
   *
   * FREE content only. Premium posts (access_level='premium') have
   * requireSignedURLs=true on Cloudflare, so this plain URL 403s for everyone
   * — use getSignedPlaybackUrl(postId) instead.
   *
   * Since v57 this URL can also fail for a genuinely FREE post. Videos are now
   * created locked (generate-stream-upload sets requireSignedURLs=true) and
   * unlocked only when stream-set-access publishes the post as free, so a
   * failed or skipped unlock leaves a free video that this plain URL cannot
   * play. That is the deliberate direction to fail in — the alternative
   * default leaked premium video — and resolveFreePlaybackUrl() below repairs
   * it at playback time. Prefer that over calling this directly.
   */
  getHlsPlaybackUrl(uid: string): string {
    return `https://videodelivery.net/${uid}/manifest/video.m3u8`;
  },

  /**
   * FREE content, with the v57 self-repair. Tries the plain unsigned URL
   * first — that is the normal case, costs no round trip, and is what every
   * already-published free video still uses. If Cloudflare rejects it because
   * the video is still locked, falls back to the same signed-token endpoint
   * premium uses; that endpoint mints a token for a free post without
   * requiring any entitlement, but still refuses a suspended or banned caller.
   *
   * A HEAD request is enough to tell the two apart: a locked video answers
   * 403 on the manifest, an unlocked one answers 200.
   */
  async resolveFreePlaybackUrl(postId: string, uid: string): Promise<string> {
    const plain = this.getHlsPlaybackUrl(uid);

    // Only a 403 means "locked, you need a token". Every other outcome —
    // 200, a 405 because Cloudflare declines HEAD on manifests, a CORS
    // rejection, a flaky network — is NOT evidence of a lock, and must fall
    // back to the plain URL, which is exactly what every build before v57 used
    // and what still works for every unlocked video.
    //
    // Getting this wrong is a live regression, not a theoretical one: until
    // the v57 edge function is deployed, the token endpoint answers free posts
    // with 400 "This video does not require a playback token". An earlier
    // version of this method routed every non-200 HEAD there and let that 400
    // throw — turning a working free video into an error message on any
    // transient hiccup. Degrade to the plain URL instead; a dead player is
    // still better than a false error, and the player surfaces its own
    // failure if the URL really is bad.
    let locked = false;
    try {
      const head = await fetch(plain, { method: 'HEAD' });
      if (head.ok) return plain;
      locked = head.status === 403;
    } catch {
      // Network or method failure. Says nothing about lock state.
    }

    if (!locked) return plain;

    try {
      return await this.getSignedPlaybackUrl(postId);
    } catch {
      // The video is locked AND the token path failed — most likely because
      // the v57 function is not deployed yet. Hand back the plain URL so the
      // player reports the real problem rather than us guessing at it.
      return plain;
    }
  },

  /**
   * PREMIUM content. Asks the `stream-playback-token` edge function for a
   * short-lived signed manifest URL — the function derives server-side
   * whether the signed-in caller is actually entitled to this post's video
   * (never trusting the client to self-report), so this only resolves for an
   * active/lifetime subscriber, an admin grant holder, or (since v57) any
   * caller entitled to a free post via resolveFreePlaybackUrl. In every case
   * the account itself must still be 'active' — a suspended or banned caller
   * is refused here even with a live subscription. Throws with a user-facing
   * message on rejection; the caller should NOT fall back to
   * getHlsPlaybackUrl().
   */
  async getSignedPlaybackUrl(postId: string): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Please sign in to watch this video.');

    const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stream-playback-token`;
    let res: Response;
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postId }),
      });
    } catch {
      throw new Error('Could not reach the video service. Check your connection and try again.');
    }

    const json = await res.json().catch(() => null);
    if (res.status === 403) throw new Error('Subscribe to Premium to watch this video.');
    if (!res.ok || !json?.url) {
      throw new Error(json?.error ?? "This video isn't available right now.");
    }
    return json.url as string;
  },
};
