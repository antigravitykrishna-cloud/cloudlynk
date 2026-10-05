import {
  STREAM_MAX_BYTES,
  STREAM_MAX_MB,
  streamUploadApi,
  type VideoMeta,
} from '@/features/upload/api/streamUploadApi';
import { postsApi } from '@/features/content/api/postsApi';
import { defaultAccessLevel, type AccessLevel, type ContentType } from '@/features/content/model';
import { toNewPost } from '@/features/upload/toNewPost';
import { clearQueue, loadQueue, saveQueue } from '@/features/upload/uploadQueueStorage';
import { errorMessage } from '@/utils/errors';

// The upload queue: videos picked on the phone, uploaded one at a time while the app is open.
// Each item goes to Cloudflare Stream (streamUploadApi), then becomes a post (postsApi.create).
// Screens follow it through subscribe(); the list is saved on the device and survives a restart.

export type QueueItemStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'over_limit';

/** The details typed in for a video. Numbers stay strings while they are being edited. */
export type VideoDetails = {
  title: string;
  body: string;
  contentType: ContentType;
  accessLevel: AccessLevel;
  genre: string;
  durationMin: string;
  seasonNo: string;
  episodeNo: string;
  episodeTitle: string;
  releaseYear: string;
  thumbnailUri: string | null;
  /** Episodes with the same series name are grouped on the channel page (see seriesId). */
  seriesName: string;
  seriesId: string | null;
};

export type QueueItem = VideoDetails & {
  /** Made on the phone; stays the same across restarts. */
  id: string;
  /** The account that queued it. */
  userId: string;
  channelId: string;
  /** The file on the phone (a content:// URI). */
  video: VideoMeta;
  status: QueueItemStatus;
  /** 0..1 while uploading. */
  progress: number;
  error: string | null;
  /** The Cloudflare Stream uid, once uploaded. */
  streamUid: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QueueState = {
  items: QueueItem[];
  isUploading: boolean;
  /** Index of the item uploading now, or -1. */
  currentIndex: number;
};

/** The details a caller may change on a queued item. */
export type EditableDetails = Partial<
  Omit<VideoDetails, 'seriesName' | 'seriesId'> & { channelId: string }
>;

/** Free accounts may queue this many files at once; Premium has no limit. */
export const FREE_QUEUE_LIMIT = 5;

type Listener = (state: QueueState) => void;

let state: QueueState = { items: [], isUploading: false, currentIndex: -1 };
const listeners = new Set<Listener>();
let abortController: AbortController | null = null;

const now = () => new Date().toISOString();
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function notify() {
  const snapshot = { ...state, items: [...state.items] };
  listeners.forEach(listener => listener(snapshot));
}

async function persistAndNotify() {
  await saveQueue(state);
  notify();
}

function updateAt(index: number, patch: Partial<QueueItem>) {
  state.items[index] = { ...state.items[index], ...patch, updatedAt: now() };
}

function newItem(
  entry: Partial<VideoDetails> & { video: VideoMeta },
  channelId: string,
  userId: string,
): QueueItem {
  const contentType = entry.contentType ?? 'movie';
  const tooLarge = entry.video.size > STREAM_MAX_BYTES;
  return {
    id: newId(),
    userId,
    channelId,
    video: entry.video,
    title: entry.title ?? '',
    body: entry.body ?? '',
    contentType,
    accessLevel: entry.accessLevel ?? defaultAccessLevel(contentType),
    genre: entry.genre ?? '',
    durationMin: entry.durationMin ?? '',
    seasonNo: entry.seasonNo ?? '',
    episodeNo: entry.episodeNo ?? '',
    episodeTitle: entry.episodeTitle ?? '',
    releaseYear: entry.releaseYear ?? String(new Date().getFullYear()),
    thumbnailUri: entry.thumbnailUri ?? null,
    seriesName: entry.seriesName ?? '',
    seriesId: entry.seriesId ?? null,
    status: tooLarge ? 'over_limit' : 'queued',
    progress: 0,
    error: tooLarge
      ? `File exceeds ${STREAM_MAX_MB}MB upload limit (${(entry.video.size / 1024 / 1024).toFixed(0)}MB)`
      : null,
    streamUid: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

/** Uploads one item and creates its post. Throws on failure. */
async function uploadItem(index: number, signal: AbortSignal): Promise<string> {
  const item = state.items[index];
  const streamUid = await streamUploadApi.upload(
    item.video,
    progress => {
      state.items[index] = { ...state.items[index], progress };
      notify();
    },
    { channelId: item.channelId || undefined, signal },
  );

  await postsApi.create(
    toNewPost(item, {
      channelId: item.channelId,
      authorId: item.userId,
      streamVideoUid: streamUid,
      fallbackTitle: item.video.name,
    }),
  );
  return streamUid;
}

/** Uploads queued items one after another until none are left or the queue is paused. */
async function processQueue(): Promise<void> {
  while (state.isUploading) {
    const index = state.items.findIndex(item => item.status === 'queued');
    if (index === -1) {
      state.isUploading = false;
      state.currentIndex = -1;
      notify();
      return;
    }

    state.currentIndex = index;
    updateAt(index, { status: 'uploading', progress: 0, error: null });
    await persistAndNotify();

    abortController = new AbortController();
    try {
      const streamUid = await uploadItem(index, abortController.signal);
      updateAt(index, { status: 'done', progress: 1, streamUid });
    } catch (err) {
      // Pausing aborts the upload in flight, so it also ends up here ("Upload cancelled").
      updateAt(index, { status: 'failed', error: errorMessage(err, 'Upload failed') });
    }
    abortController = null;
    state.currentIndex = -1;
    await persistAndNotify();
  }
}

export const UploadQueue = {
  /** Loads the saved queue. Items that were mid-upload when the app closed go back to queued. */
  async init(): Promise<QueueState> {
    const saved = await loadQueue();
    if (saved) {
      state = {
        isUploading: false,
        currentIndex: -1,
        items: saved.items.map(item =>
          item.status === 'uploading'
            ? { ...item, status: 'queued', progress: 0, error: null, updatedAt: now() }
            : item,
        ),
      };
    }
    notify();
    return state;
  },

  /** Calls `listener` now and on every change. Returns the unsubscribe. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  },

  getState(): QueueState {
    return state;
  },

  /**
   * Adds videos with whatever details are known. Files over the size limit are added as
   * `over_limit` (shown, never uploaded). A free account's queue is capped at FREE_QUEUE_LIMIT
   * uploadable items. Resolves with the items added.
   */
  async add(
    entries: (Partial<VideoDetails> & { video: VideoMeta })[],
    channelId: string,
    userId: string,
    hasPlan: boolean,
  ): Promise<QueueItem[]> {
    const limit = hasPlan ? Infinity : FREE_QUEUE_LIMIT;
    let freeSlots = limit - state.items.filter(i => i.status !== 'over_limit').length;

    const added: QueueItem[] = [];
    for (const entry of entries) {
      const item = newItem(entry, channelId, userId);
      if (item.status !== 'over_limit') {
        if (freeSlots <= 0) break;
        freeSlots -= 1;
      }
      added.push(item);
    }
    if (added.length > 0) {
      state.items = [...state.items, ...added];
      await persistAndNotify();
    }
    return added;
  },

  /** Removes an item. The one uploading right now cannot be removed. */
  async remove(itemId: string): Promise<boolean> {
    const index = state.items.findIndex(i => i.id === itemId);
    if (index === -1 || index === state.currentIndex) return false;
    state.items = state.items.filter((_, i) => i !== index);
    if (state.currentIndex > index) state.currentIndex -= 1;
    await persistAndNotify();
    return true;
  },

  async update(itemId: string, details: EditableDetails): Promise<boolean> {
    const index = state.items.findIndex(i => i.id === itemId);
    if (index === -1) return false;
    updateAt(index, details);
    await persistAndNotify();
    return true;
  },

  /** Starts (or resumes) uploading. Does nothing if already running. */
  async start(): Promise<void> {
    if (state.isUploading) return;
    state.isUploading = true;
    notify();
    await processQueue();
  },

  /** Stops after aborting the upload in flight; that item is marked failed and can be retried. */
  async pause(): Promise<void> {
    abortController?.abort();
    abortController = null;
    state.isUploading = false;
    notify();
  },

  /** Puts a failed item back in the queue and starts uploading if idle. */
  async retry(itemId: string): Promise<boolean> {
    const index = state.items.findIndex(i => i.id === itemId);
    if (index === -1 || state.items[index].status !== 'failed') return false;
    updateAt(index, { status: 'queued', progress: 0, error: null });
    await persistAndNotify();
    await UploadQueue.start();
    return true;
  },

  /** Removes finished, failed and too-large items. */
  async clearFinished(): Promise<void> {
    const currentId = state.items[state.currentIndex]?.id ?? null;
    state.items = state.items.filter(
      i => i.status !== 'done' && i.status !== 'failed' && i.status !== 'over_limit',
    );
    state.currentIndex = currentId ? state.items.findIndex(i => i.id === currentId) : -1;
    await persistAndNotify();
  },

  /** Empties the queue and forgets it on this device. Called on sign-out. */
  async destroy(): Promise<void> {
    abortController?.abort();
    abortController = null;
    state = { items: [], isUploading: false, currentIndex: -1 };
    await clearQueue();
    notify();
  },
};
