import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';
import type { PickedFile } from '@/lib/mediaPicker';
import { categoryOf, type FileCategory } from '@/features/files/fileCategories';
import { nativeFile } from '@/lib/nativeFile';

// The person's private cloud drive: files in the `user-files` bucket, one row each in `files`, and
// the storage counter on their profile. Only the owner can read a file.

const BUCKET = 'user-files';
/** The Cloud tab shows the newest files; a very large library is not pulled in one request. */
const LIST_LIMIT = 500;

export type StoredFile = Tables<'files'>;

export const filesApi = {
  async list(userId: string, category?: FileCategory | 'all'): Promise<StoredFile[]> {
    let query = supabase
      .from('files')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (category && category !== 'all') query = query.eq('category', category);

    const { data, error } = await query.limit(LIST_LIMIT);
    if (error) throw error;
    return data ?? [];
  },

  /** Uploads a picked file and records it. `onProgress` gets 0..1. */
  async upload(
    userId: string,
    file: PickedFile,
    onProgress?: (fraction: number) => void,
  ): Promise<void> {
    if (typeof document !== 'undefined') {
      throw new Error('File upload is only supported on Android and iOS.');
    }
    const storagePath = `${userId}/${Date.now()}_${file.name.replace(/\s/g, '_')}`;

    const { data: target, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (urlError || !target?.signedUrl) throw urlError ?? new Error('Failed to get upload URL');

    await putFile(target.signedUrl, file, onProgress);

    const { error: insertError } = await supabase.from('files').insert({
      user_id: userId,
      name: file.name,
      size: file.size,
      mime_type: file.mimeType,
      storage_path: storagePath,
      category: categoryOf(file.mimeType),
      channel_id: null,
      is_public: false,
    });
    if (insertError) throw insertError;

    // Keeps profiles.storage_used in step for the storage meter. The file is already saved, so a
    // failure here is not worth failing the upload over.
    await supabase.rpc('increment_storage_used', { p_user_id: userId, p_bytes: file.size });
  },

  async remove(userId: string, file: StoredFile): Promise<void> {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.storage_path]);
    if (storageError) throw storageError;

    const { error: rowError } = await supabase.from('files').delete().eq('id', file.id);
    if (rowError) throw rowError;

    await supabase.rpc('decrement_storage_used', { p_user_id: userId, p_bytes: file.size });
  },
};

/**
 * PUTs the raw file to a signed upload URL with XMLHttpRequest, which reports progress. React
 * Native streams the { uri, type, name } object from disk. Not FormData: that forces a
 * multipart/form-data content type, which the signed-upload endpoint rejects.
 */
function putFile(
  url: string,
  file: PickedFile,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.mimeType);
    xhr.send(nativeFile({ uri: file.uri, type: file.mimeType, name: file.name }));
  });
}
