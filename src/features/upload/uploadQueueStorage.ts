import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueueState } from '@/features/upload/uploadQueue';

// The upload queue saved on the device (AsyncStorage), so a list of picked videos survives an app
// restart. Only the items are kept: nothing is mid-upload after a restart.

const STORAGE_KEY = 'upload_queue';

export async function loadQueue(): Promise<QueueState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as QueueState) : null;
    return parsed && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveQueue(state: QueueState): Promise<void> {
  try {
    const idle: QueueState = { items: state.items, isUploading: false, currentIndex: -1 };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(idle));
  } catch (err) {
    if (__DEV__) console.error('[uploadQueueStorage] save failed:', err);
  }
}

export async function clearQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    if (__DEV__) console.error('[uploadQueueStorage] clear failed:', err);
  }
}
