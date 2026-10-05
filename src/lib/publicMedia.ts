import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { decodeBase64 } from '@/utils/base64';

// The public `channel-media` bucket: post thumbnails and profile pictures. Anything here is
// readable by URL, so nothing private goes in it (private files use the `user-files` bucket).

const BUCKET = 'channel-media';

export const publicMedia = {
  /** Uploads a local image or video; resolves with its storage path (save that, not the URL). */
  async upload(userId: string, uri: string, kind: 'image' | 'video'): Promise<string> {
    if (typeof document !== 'undefined') {
      throw new Error('File upload is only supported on Android and iOS.');
    }
    const path = `${userId}/${Date.now()}.${kind === 'video' ? 'mp4' : 'jpg'}`;
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { error } = await supabase.storage.from(BUCKET).upload(path, decodeBase64(base64), {
      contentType: kind === 'video' ? 'video/mp4' : 'image/jpeg',
    });
    if (error) throw error;
    return path;
  },

  /** The public URL for a stored path. Older rows hold a full URL already; those pass through. */
  url(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  },
};
