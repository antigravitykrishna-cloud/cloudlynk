/**
 * v0.7.0 Upload Queue — foreground upload manager.
 *
 * Manages a sequence of video uploads: each item flows through
 * StreamService.uploadVideo() → PostService.createPost() into channel_posts.
 * The queue state is async (waiting on network), so the public API is
 * callback-driven: the caller subscribes to get state updates.
 *
 * Queue items are persisted to AsyncStorage for survival across app restarts.
 * Background survival (Android foreground service) is deferred to a future release.
 */

import { StreamService, VideoMeta, STREAM_MAX_MB } from './stream';
import { PostService, defaultAccessLevel, AccessLevel } from './posts';
import { loadQueue, saveQueue, clearQueue as clearPersistedQueue } from './uploadQueue.persistence';

// ── Types ──────────────────────────────────────────────────────

export type QueueItemStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'paused' | 'over_limit';

export type QueueItem = {
  /** Stable id generated client-side, survives restarts */
  id: string;
  /** The authenticated user uploading this item */
  userId: string;
  /** The video file on the device (content:// URI) */
  video: VideoMeta;
  /** Form fields — populated by user, empty until edited */
  channelId: string;
  title: string;
  body: string;
  contentType: string;
  /** Whether this content requires an active premium plan to view — see lib/posts.ts defaultAccessLevel() */
  accessLevel: AccessLevel;
  genre: string;
  durationMin: string;
  seasonNo: string;
  episodeNo: string;
  episodeTitle: string;
  releaseYear: string;
  thumbnailUri: string | null;
  /** Series grouping — deterministic ID derived from (channelId, seriesName) */
  seriesName: string;
  seriesId: string | null;
  /** Lifecycle */
  status: QueueItemStatus;
  /** Upload progress 0–1, only meaningful when status === 'uploading' */
  progress: number;
  /** Error message if status === 'failed' */
  error: string | null;
  /** Cloudflare Stream UID assigned after successful upload */
  streamUid: string | null;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
};

export type QueueState = {
  items: QueueItem[];
  /** true while any item is actively uploading */
  isUploading: boolean;
  /** index of the currently uploading item, -1 if idle */
  currentIndex: number;
};

type StateListener = (state: QueueState) => void;

// ── Internals ──────────────────────────────────────────────────

const MAX_FREE_ITEMS = 5;

let state: QueueState = { items: [], isUploading: false, currentIndex: -1 };
let listeners = new Set<StateListener>();
let abortController: AbortController | null = null;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function notify() {
  const snapshot = { ...state, items: [...state.items] };
  listeners.forEach((fn) => fn(snapshot));
}

function isOverSizeLimit(size: number): boolean {
  return size > STREAM_MAX_MB * 1024 * 1024;
}

// ── Public API ─────────────────────────────────────────────────

export const UploadQueue = {

  /** Load persisted queue from AsyncStorage (call once on app start) */
  async init(): Promise<QueueState> {
    const persisted = await loadQueue();
    if (persisted && Array.isArray(persisted.items)) {
      state = { ...persisted, isUploading: false, currentIndex: -1 };
      // Reset any items stuck in 'uploading' back to 'queued' (app was killed mid-upload)
      state.items = state.items.map((item) =>
        item.status === 'uploading' ? { ...item, status: 'queued' as const, progress: 0, error: null, updatedAt: new Date().toISOString() } : item
      );
    }
    notify();
    return state;
  },

  subscribe(listener: StateListener): () => void {
    listeners.add(listener);
    listener(state);
    return () => { listeners.delete(listener); };
  },

  getState(): QueueState {
    return state;
  },

  /**
   * Add video(s) to the queue with pre-filled metadata.
   * Items over the 180MB limit are marked 'over_limit' immediately.
   * Returns the number of items actually added.
   */
  async addToQueue(
    entries: Array<{
      video: VideoMeta;
      title?: string;
      body?: string;
      contentType?: string;
      accessLevel?: AccessLevel;
      genre?: string;
      durationMin?: string;
      seasonNo?: string;
      episodeNo?: string;
      episodeTitle?: string;
      releaseYear?: string;
      thumbnailUri?: string | null;
      seriesName?: string;
      seriesId?: string | null;
    }>,
    channelId: string,
    userId: string,
    isPremium: boolean,
  ): Promise<number> {
    const maxItems = isPremium ? Infinity : MAX_FREE_ITEMS;
    const uploadableCount = state.items.filter((i) => i.status !== 'over_limit').length;
    const availableSlots = maxItems - uploadableCount;

    const newItems: QueueItem[] = [];
    for (const entry of entries) {
      const oversized = isOverSizeLimit(entry.video.size);
      if (!oversized && newItems.filter((i) => i.status !== 'over_limit').length >= availableSlots) break;

      newItems.push({
        id: generateId(),
        userId,
        video: entry.video,
        channelId,
        title: entry.title ?? '',
        body: entry.body ?? '',
        contentType: entry.contentType ?? 'movie',
        accessLevel: entry.accessLevel ?? defaultAccessLevel((entry.contentType as any) ?? 'movie'),
        genre: entry.genre ?? '',
        durationMin: entry.durationMin ?? '',
        seasonNo: entry.seasonNo ?? '',
        episodeNo: entry.episodeNo ?? '',
        episodeTitle: entry.episodeTitle ?? '',
        releaseYear: entry.releaseYear ?? String(new Date().getFullYear()),
        thumbnailUri: entry.thumbnailUri ?? null,
        seriesName: entry.seriesName ?? '',
        seriesId: entry.seriesId ?? null,
        status: oversized ? 'over_limit' : 'queued',
        progress: 0,
        error: oversized
          ? `File exceeds ${STREAM_MAX_MB}MB upload limit (${(entry.video.size / 1024 / 1024).toFixed(0)}MB)`
          : null,
        streamUid: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    if (newItems.length === 0) return 0;

    state.items = [...state.items, ...newItems];
    await this._persist();
    notify();
    return newItems.length;
  },

  /** Remove an item from the queue (any status). Cannot remove while uploading. */
  async removeItem(itemId: string): Promise<boolean> {
    const idx = state.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return false;
    if (state.currentIndex === idx) return false; // can't remove currently uploading item
    state.items = state.items.filter((_, i) => i !== idx);
    if (state.currentIndex > idx) state.currentIndex--;
    await this._persist();
    notify();
    return true;
  },

  /** Update form fields for a queued item */
  async updateItem(itemId: string, updates: Partial<Pick<QueueItem, 'title' | 'body' | 'contentType' | 'accessLevel' | 'genre' | 'durationMin' | 'seasonNo' | 'episodeNo' | 'episodeTitle' | 'releaseYear' | 'thumbnailUri' | 'channelId'>>): Promise<boolean> {
    const idx = state.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return false;
    state.items[idx] = { ...state.items[idx], ...updates, updatedAt: new Date().toISOString() };
    await this._persist();
    notify();
    return true;
  },

  /** Start processing the queue sequentially (one at a time) */
  async startUpload(): Promise<void> {
    if (state.isUploading) return;
    state.isUploading = true;
    notify();
    await this._processNext();
  },

  /** Pause after the current upload finishes */
  async pauseUpload(): Promise<void> {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    state.isUploading = false;
    notify();
  },

  /** Resume paused queue */
  async resumeUpload(): Promise<void> {
    if (state.isUploading) return;
    state.isUploading = true;
    notify();
    await this._processNext();
  },

  /** Retry a failed item (re-queues it and starts upload if idle) */
  async retryItem(itemId: string): Promise<boolean> {
    const idx = state.items.findIndex((i) => i.id === itemId);
    if (idx === -1 || state.items[idx].status !== 'failed') return false;
    state.items[idx] = {
      ...state.items[idx],
      status: 'queued',
      progress: 0,
      error: null,
      updatedAt: new Date().toISOString(),
    };
    await this._persist();
    notify();
    if (!state.isUploading) {
      state.isUploading = true;
      notify();
      await this._processNext();
    }
    return true;
  },

  /** Remove all completed/failed items */
  async clearCompleted(): Promise<void> {
    state.items = state.items.filter(
      (i) => i.status !== 'done' && i.status !== 'failed' && i.status !== 'over_limit'
    );
    // Recalculate currentIndex
    const currentId = state.currentIndex >= 0 && state.currentIndex < state.items.length
      ? state.items[state.currentIndex]?.id : null;
    state.currentIndex = currentId ? state.items.findIndex((i) => i.id === currentId) : -1;
    await this._persist();
    notify();
  },

  /** Wipe the entire queue (used on signOut) */
  async destroy(): Promise<void> {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    state = { items: [], isUploading: false, currentIndex: -1 };
    await clearPersistedQueue();
    notify();
  },

  // ── Internal ──────────────────────────────────────────────

  async _persist(): Promise<void> {
    await saveQueue(state);
  },

  async _processNext(): Promise<void> {
    if (!state.isUploading) return;

    const nextIdx = state.items.findIndex((i) => i.status === 'queued');
    if (nextIdx === -1) {
      state.isUploading = false;
      state.currentIndex = -1;
      notify();
      return;
    }

    state.currentIndex = nextIdx;
    const item = state.items[nextIdx];

    // Skip over-limit items (can only be removed, not uploaded)
    if (item.status === 'over_limit') {
      state.items[nextIdx] = { ...item, updatedAt: new Date().toISOString() };
      await this._persist();
      notify();
      // Find next uploadable item
      state.currentIndex = -1;
      await this._processNext();
      return;
    }

    state.items[nextIdx] = { ...item, status: 'uploading', progress: 0, error: null, updatedAt: new Date().toISOString() };
    await this._persist();
    notify();

    try {
      abortController = new AbortController();

      const streamUid = await StreamService.uploadVideo(
        item.video,
        (pct) => {
          state.items[nextIdx] = { ...state.items[nextIdx], progress: pct };
          notify();
        },
        item.channelId || undefined,
        abortController!.signal,
      );

      // Upload succeeded — create the channel_posts row using item.userId
      const post = await PostService.createPost(
        item.channelId,
        item.userId,
        item.body || '',
        {
          title: item.title || item.video.name,
          contentType: (item.contentType as any) || 'movie',
          accessLevel: item.accessLevel,
          genre: item.genre || undefined,
          durationMin: item.durationMin ? parseInt(item.durationMin) : undefined,
          seasonNumber: item.seasonNo ? parseInt(item.seasonNo) : undefined,
          episodeNumber: item.episodeNo ? parseInt(item.episodeNo) : undefined,
          episodeTitle: item.episodeTitle || undefined,
          releaseYear: item.releaseYear ? parseInt(item.releaseYear) : undefined,
          thumbnailUri: item.thumbnailUri ?? undefined,
          streamVideoUid: streamUid,
          seriesId: item.seriesId ?? undefined,
        },
      );

      state.items[nextIdx] = {
        ...state.items[nextIdx],
        status: 'done',
        progress: 1,
        streamUid,
        updatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      state.items[nextIdx] = {
        ...state.items[nextIdx],
        status: 'failed',
        error: err.message ?? 'Upload failed',
        updatedAt: new Date().toISOString(),
      };
    }

    abortController = null;
    state.currentIndex = -1;
    await this._persist();
    notify();

    // Continue to next item
    if (state.isUploading) {
      await this._processNext();
    }
  },
};
