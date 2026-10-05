import { useCallback, useState } from 'react';
import { pickDocument, pickPhotosAndVideos, type PickedFile } from '@/lib/mediaPicker';
import { filesApi, type StoredFile } from '@/features/files/api/filesApi';

/** A file on its way up, shown in the "uploads in progress" banner. */
export type Transfer = {
  id: string;
  fileName: string;
  /** 0..1 */
  progress: number;
  status: 'uploading' | 'completed' | 'failed';
};

/** How long a finished upload stays in the banner. */
const COMPLETED_VISIBLE_MS = 2000;

/** The Cloud tab's files, and uploading and deleting them. */
export function useFiles(userId: string | undefined) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setFiles(await filesApi.list(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const updateTransfer = (id: string, patch: Partial<Transfer>) =>
    setTransfers(current => current.map(t => (t.id === id ? { ...t, ...patch } : t)));

  const upload = useCallback(
    async (file: PickedFile) => {
      if (!userId) return;
      const id = `transfer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setTransfers(current => [
        ...current,
        { id, fileName: file.name, progress: 0, status: 'uploading' },
      ]);
      try {
        await filesApi.upload(userId, file, progress => updateTransfer(id, { progress }));
        updateTransfer(id, { status: 'completed' });
        setTimeout(
          () => setTransfers(current => current.filter(t => t.id !== id)),
          COMPLETED_VISIBLE_MS,
        );
        await load();
      } catch {
        updateTransfer(id, { status: 'failed' });
      }
    },
    [userId, load],
  );

  /** Photos and videos from the gallery; every one picked is uploaded, one after another. */
  const uploadFromGallery = useCallback(async () => {
    for (const file of await pickPhotosAndVideos()) await upload(file);
  }, [upload]);

  const uploadDocument = useCallback(async () => {
    const file = await pickDocument();
    if (file) await upload(file);
  }, [upload]);

  const remove = useCallback(
    async (file: StoredFile) => {
      if (!userId) return;
      await filesApi.remove(userId, file);
      setFiles(current => current.filter(f => f.id !== file.id));
    },
    [userId],
  );

  return { files, loading, transfers, load, uploadFromGallery, uploadDocument, remove };
}
