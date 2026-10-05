import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { Colors } from '@/theme';

/**
 * Pull-to-refresh for a ScrollView or FlatList: pass the result as its `refreshControl`. The
 * spinner shows until `refresh` settles, whether it succeeds or fails.
 */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandBlue} />
  );
}
