import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';

export type UploadProgress = {
  loaded: number;
  total: number;
  percentage: number;
};

export type FileCategory = 'photo' | 'video' | 'document' | 'audio' | 'other';

export function getMimeCategory(mimeType: string): FileCategory {
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('text')
  )
    return 'document';
  return 'other';
}

export const StorageService = {
  async pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
    // System photo picker: no media permission needed.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.9,
      exif: false,
    });

    if (result.canceled) return null;
    return result.assets[0];
  },

  async pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    return result.assets[0];
  },

  async uploadFile(
    userId: string,
    uri: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
    channelId?: string,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<{ storagePath: string; category: FileCategory }> {
    if (typeof document !== 'undefined') {
      throw new Error('File upload is only supported on Android and iOS.');
    }
    const storagePath = `${userId}/${Date.now()}_${fileName.replace(/\s/g, '_')}`;
    const category = getMimeCategory(mimeType);

    // Obtain a short-lived signed upload URL from Supabase Storage
    const { data: uploadData, error: urlError } = await supabase.storage
      .from('user-files')
      .createSignedUploadUrl(storagePath);
    if (urlError || !uploadData?.signedUrl) throw urlError ?? new Error('Failed to get upload URL');

    // Upload via XHR PUT with raw binary body — React Native reads the file URI directly.
    // Do NOT use FormData: it forces multipart/form-data Content-Type which overrides
    // the explicit header and breaks the Supabase Storage signed-upload endpoint.
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', event => {
        if (event.lengthComputable && event.total > 0) {
          const pct = Math.floor((event.loaded / event.total) * 100);
          onProgress?.({
            loaded: event.loaded,
            total: event.total,
            percentage: pct,
          });
        }
      });

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.({ loaded: fileSize, total: fileSize, percentage: 100 });
          resolve();
        } else {
          reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));

      xhr.open('PUT', uploadData.signedUrl);
      xhr.setRequestHeader('Content-Type', mimeType);
      // React Native XHR accepts { uri, type, name } — streams file as raw binary,
      // preserving the Content-Type set above.
      xhr.send({ uri, type: mimeType, name: fileName } as any);
    });

    const { error: dbError } = await supabase.from('files').insert({
      user_id: userId,
      name: fileName,
      size: fileSize,
      mime_type: mimeType,
      storage_path: storagePath,
      category,
      channel_id: channelId ?? null,
      is_public: false,
    });
    if (dbError) throw dbError;

    await supabase.rpc('increment_storage_used', {
      p_user_id: userId,
      p_bytes: fileSize,
    });

    return { storagePath, category };
  },

  async getSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('user-files')
      .createSignedUrl(storagePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  },

  async createShareableLink(storagePath: string, expiresInDays = 7): Promise<string> {
    const { data, error } = await supabase.storage
      .from('user-files')
      .createSignedUrl(storagePath, expiresInDays * 24 * 60 * 60);
    if (error) throw error;
    return data.signedUrl;
  },

  async deleteFile(fileId: string, storagePath: string, userId: string, fileSize: number) {
    const { error: storageError } = await supabase.storage.from('user-files').remove([storagePath]);
    if (storageError) throw storageError;

    const { error: dbError } = await supabase.from('files').delete().eq('id', fileId);
    if (dbError) throw dbError;

    await supabase.rpc('decrement_storage_used', {
      p_user_id: userId,
      p_bytes: fileSize,
    });
  },

  async listFiles(userId: string, category?: string) {
    let query = supabase
      .from('files')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    // Bounded: the Cloud tab shows the newest files; a very large library
    // should not be pulled into memory in one request.
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return data ?? [];
  },
};

// Re-export category helpers for convenience
export { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_DIM } from '@/theme';
