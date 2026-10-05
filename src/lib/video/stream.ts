import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { nativeFile } from '@/lib/nativeFile';

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
   * Multi-select video picker for the upload queue. content:// files are streamed, not copied, to
   * avoid running out of memory. Files over STREAM_MAX_MB are flagged by the queue screen rather
   * than silently dropped here.
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

    return result.assets.map(asset => ({
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
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();
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
      formData.append('file', nativeFile({ uri: meta.uri, type: 'video/mp4', name: meta.name }));

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
          try {
            xhr.abort();
          } catch {}
          finish(() =>
            reject(
              new Error(
                'Upload stalled — no data was sent for 90 seconds. Check your connection and try again.',
              ),
            ),
          );
        }, STALL_MS);
      };

      xhr.upload.addEventListener('progress', event => {
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
          finish(() =>
            reject(
              new Error(
                'Video is too large for the current Cloudflare Stream plan. Maximum upload size is 200 MB. Please pick a smaller file.',
              ),
            ),
          );
        } else if (xhr.status >= 500) {
          finish(() =>
            reject(
              new Error(
                'Cloudflare is having trouble receiving the file right now. Please try again in a moment.',
              ),
            ),
          );
        } else {
          finish(() =>
            reject(new Error(`Video upload failed (HTTP ${xhr.status}). Please try again.`)),
          );
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
          try {
            xhr.abort();
          } catch {}
          finish(() => reject(new Error('Upload cancelled')));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }

      armStall(); // start the watchdog before the request begins
      xhr.open('POST', uploadURL);
      xhr.send(formData);
    });
  },

  /**
   * Free titles play through a short-lived token like premium ones. The server issues it without
   * asking for a plan, but refuses guests and suspended accounts.
   */
  async resolveFreePlaybackUrl(postId: string, _uid: string): Promise<string> {
    // Every video is locked on Cloudflare, free ones included, so a free
    // title plays through the same short-lived token as premium. The server
    // mints it without asking for a plan, but refuses guests and suspended
    // accounts -- which a plain URL could not.
    return this.getSignedPlaybackUrl(postId);
  },

  /**
   * A short-lived signed playback URL from the stream-playback-token function, which checks server-
   * side that the caller may watch this post (plan, admin grant, or a free title; account must be
   * active; not a guest). Throws a user-facing message when refused.
   */
  async getSignedPlaybackUrl(postId: string): Promise<string> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
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
    if (res.status === 403) {
      throw new Error(
        json?.error && json.error !== "This video isn't available."
          ? json.error
          : 'Subscribe to Premium to watch this video.',
      );
    }
    if (!res.ok || !json?.url) {
      throw new Error(json?.error ?? "This video isn't available right now.");
    }
    return json.url as string;
  },
};
