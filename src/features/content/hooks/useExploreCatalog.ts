import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useOnAccountChange } from '@/features/auth/hooks/useOnAccountChange';
import { postsApi, type ExploreSort } from '@/features/content/api/postsApi';
import type { ChannelPost } from '@/features/content/model';
import { groupIntoShelves, sortShelves } from '@/features/content/shelves';

/** Explore's shelves for the chosen sort. Signed-out visitors browse the guest catalogue. */
export function useExploreCatalog(sort: ExploreSort) {
  const { user } = useAuth();
  const userId = user?.id;
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  // "Nothing to watch" and "could not find out" are different things to tell someone.
  const [loadFailed, setLoadFailed] = useState(false);

  useOnAccountChange(() => {
    setPosts([]);
    setLoading(true);
  });

  const load = useCallback(async () => {
    try {
      const catalogue = userId
        ? await postsApi.listExplore(userId, sort)
        : await postsApi.listExploreForGuest(sort);
      setPosts(catalogue as ChannelPost[]);
      setLoadFailed(false);
    } catch (err) {
      if (__DEV__) console.error(err);
      // Keep what is on screen: a stale catalogue that plays beats a blank one.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const shelves = useMemo(() => sortShelves(groupIntoShelves(posts), sort), [posts, sort]);

  return { shelves, loading, loadFailed, reload: load };
}
