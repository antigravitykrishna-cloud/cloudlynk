import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_STORAGE_KEY = 'cloudlynk-query-cache';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

/** Persists the query cache to AsyncStorage so data shows offline and on the next launch. */
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: CACHE_STORAGE_KEY,
  throttleTime: 1000,
});

/** Forgets every cached query, in memory and on disk. Called on sign-out. */
export async function clearQueryCache(): Promise<void> {
  queryClient.clear();
  try {
    await AsyncStorage.removeItem(CACHE_STORAGE_KEY);
  } catch {
    // Non-fatal: the in-memory cache is already gone.
  }
}
