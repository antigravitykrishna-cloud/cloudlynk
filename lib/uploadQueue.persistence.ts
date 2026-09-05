/**
 * AsyncStorage persistence for the upload queue.
 * Key: 'upload_queue' — mirrors the pattern in queryClient.ts.
 * Serializes QueueState as JSON. On load, filters out items with
 * stale content:// URIs (device file no longer accessible).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueueState } from './uploadQueue';

const QUEUE_KEY = 'upload_queue';

export async function loadQueue(): Promise<QueueState | null> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QueueState;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveQueue(state: QueueState): Promise<void> {
  try {
    const serializable = {
      items: state.items,
      isUploading: false, // never persist active upload state
      currentIndex: -1,
    };
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(serializable));
  } catch (err) {
    if (__DEV__) console.error('[uploadQueue.persistence] Failed to save queue:', err);
  }
}

export async function clearQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch (err) {
    if (__DEV__) console.error('[uploadQueue.persistence] Failed to clear queue:', err);
  }
}
