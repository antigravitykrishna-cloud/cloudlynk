import { callEdgeFunction } from '@/lib/edgeFunctions';
import { nativeFile } from '@/lib/nativeFile';

// Uploading a video straight from the phone to Cloudflare Stream. The generate-stream-upload
// function (admins only) hands out a one-time upload URL and the video's uid; the file then goes
// to Cloudflare directly, never through our servers.

/** A video file chosen for upload. Persisted with the upload queue, so keep it this shape. */
export type VideoMeta = { uri: string; name: string; size: number };

/** Largest upload the Cloudflare Stream plan accepts, in MB. Checked when files are picked. */
export const STREAM_MAX_MB = 180;
export const STREAM_MAX_BYTES = STREAM_MAX_MB * 1024 * 1024;

/** No bytes sent for this long means the connection died. A slow upload keeps resetting it. */
const STALL_MS = 90_000;

/** Share of the progress bar used by getting the upload URL; the transfer fills the rest. */
const URL_STEP = 0.05;

export const streamUploadApi = {
  /**
   * Uploads `video` and resolves with its Cloudflare Stream uid. `onProgress` gets 0..1. Abort with
   * `signal` (the upload queue's pause).
   */
  async upload(
    video: VideoMeta,
    onProgress: (fraction: number) => void,
    { channelId, signal }: { channelId?: string; signal?: AbortSignal } = {},
  ): Promise<string> {
    onProgress(0);
    if (signal?.aborted) throw new Error('Upload cancelled');

    const res = await callEdgeFunction<{ uploadURL: string; uid: string }>(
      'generate-stream-upload',
      { fileSize: video.size, fileName: video.name, channelId },
      { signal, signedOutMessage: 'Not authenticated' },
    );
    if (!res.ok || !res.data) throw new Error(res.data?.error ?? 'Failed to get Stream upload URL');
    const { uploadURL, uid } = res.data;
    onProgress(URL_STEP);

    await sendFile(uploadURL, video, fraction => onProgress(URL_STEP + fraction * 0.94), signal);
    onProgress(1);
    return uid;
  },
};

/**
 * POSTs the file to Cloudflare as multipart form data with XMLHttpRequest, which reports upload
 * progress (fetch does not) and avoids expo-file-system's uploadAsync, which can hang on Android
 * when the upload finishes.
 */
function sendFile(
  uploadUrl: string,
  video: VideoMeta,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      if (stallTimer) clearTimeout(stallTimer);
      outcome();
    };
    const fail = (message: string) => finish(() => reject(new Error(message)));
    const abort = (message: string) => {
      try {
        xhr.abort();
      } catch {
        // already closed
      }
      fail(message);
    };
    const restartStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(
        () =>
          abort(
            'Upload stalled — no data was sent for 90 seconds. Check your connection and try again.',
          ),
        STALL_MS,
      );
    };

    xhr.upload.addEventListener('progress', event => {
      restartStallTimer();
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) finish(resolve);
      // Cloudflare answers 413 with an HTML page; never show that to anyone.
      else if (xhr.status === 413) {
        fail(
          'Video is too large for the current Cloudflare Stream plan. Maximum upload size is 200 MB. Please pick a smaller file.',
        );
      } else if (xhr.status >= 500) {
        fail(
          'Cloudflare is having trouble receiving the file right now. Please try again in a moment.',
        );
      } else fail(`Video upload failed (HTTP ${xhr.status}). Please try again.`);
    };
    xhr.onerror = () => fail('Network error occurred during video upload.');

    if (signal) {
      if (signal.aborted) {
        fail('Upload cancelled');
        return;
      }
      signal.addEventListener('abort', () => abort('Upload cancelled'), { once: true });
    }

    // Cloudflare expects the file in a field called `file`. React Native's FormData accepts this
    // { uri, type, name } object and streams the file from disk.
    const form = new FormData();
    form.append('file', nativeFile({ uri: video.uri, type: 'video/mp4', name: video.name }));

    restartStallTimer();
    xhr.open('POST', uploadUrl);
    xhr.send(form);
  });
}
