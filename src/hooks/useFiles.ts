import { useState, useCallback } from 'react';
import { StorageService, UploadProgress } from '../lib/storage';
import { Database } from '../lib/supabase';

type FileRow = Database['public']['Tables']['files']['Row'];

type ActiveTransfer = {
  id: string;
  fileName: string;
  fileSize: number;
  progress: UploadProgress;
  status: 'uploading' | 'completed' | 'failed';
};

export function useFiles(userId: string | undefined) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTransfers, setActiveTransfers] = useState<ActiveTransfer[]>([]);

  const loadFiles = useCallback(async (category?: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await StorageService.listFiles(userId, category);
      setFiles(data as FileRow[]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const uploadImage = useCallback(async (channelId?: string) => {
    if (!userId) return;

    const asset = await StorageService.pickImage();
    if (!asset) return;

    const transferId = `transfer_${Date.now()}`;
    const fileName = asset.fileName ?? `photo_${Date.now()}.jpg`;
    const fileSize = asset.fileSize ?? 0;
    const mimeType = asset.mimeType ?? 'image/jpeg';

    setActiveTransfers(prev => [...prev, {
      id: transferId,
      fileName,
      fileSize,
      progress: { loaded: 0, total: fileSize, percentage: 0 },
      status: 'uploading',
    }]);

    try {
      await StorageService.uploadFile(
        userId, asset.uri, fileName, mimeType, fileSize, channelId,
        (progress) => {
          setActiveTransfers(prev => prev.map(t =>
            t.id === transferId ? { ...t, progress } : t
          ));
        }
      );

      setActiveTransfers(prev => prev.map(t =>
        t.id === transferId ? { ...t, status: 'completed' } : t
      ));

      setTimeout(() => {
        setActiveTransfers(prev => prev.filter(t => t.id !== transferId));
      }, 2000);

      await loadFiles();
    } catch {
      setActiveTransfers(prev => prev.map(t =>
        t.id === transferId ? { ...t, status: 'failed' } : t
      ));
    }
  }, [userId, loadFiles]);

  const uploadDocument = useCallback(async (channelId?: string) => {
    if (!userId) return;

    const doc = await StorageService.pickDocument();
    if (!doc) return;

    const transferId = `transfer_${Date.now()}`;
    const fileSize = doc.size ?? 0;

    setActiveTransfers(prev => [...prev, {
      id: transferId,
      fileName: doc.name,
      fileSize,
      progress: { loaded: 0, total: fileSize, percentage: 0 },
      status: 'uploading',
    }]);

    try {
      await StorageService.uploadFile(
        userId, doc.uri, doc.name, doc.mimeType ?? 'application/octet-stream',
        fileSize, channelId,
        (progress) => {
          setActiveTransfers(prev => prev.map(t =>
            t.id === transferId ? { ...t, progress } : t
          ));
        }
      );

      setActiveTransfers(prev => prev.map(t =>
        t.id === transferId ? { ...t, status: 'completed' } : t
      ));

      setTimeout(() => {
        setActiveTransfers(prev => prev.filter(t => t.id !== transferId));
      }, 2000);

      await loadFiles();
    } catch {
      setActiveTransfers(prev => prev.map(t =>
        t.id === transferId ? { ...t, status: 'failed' } : t
      ));
    }
  }, [userId, loadFiles]);

  const deleteFile = useCallback(async (fileId: string, storagePath: string, fileSize: number) => {
    if (!userId) return;
    await StorageService.deleteFile(fileId, storagePath, userId, fileSize);
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, [userId]);

  const getSignedUrl = useCallback(async (storagePath: string) => {
    return StorageService.getSignedUrl(storagePath);
  }, []);

  const createShareableLink = useCallback(async (storagePath: string) => {
    return StorageService.createShareableLink(storagePath);
  }, []);

  return {
    files,
    loading,
    activeTransfers,
    loadFiles,
    uploadImage,
    uploadDocument,
    deleteFile,
    getSignedUrl,
    createShareableLink,
  };
}
