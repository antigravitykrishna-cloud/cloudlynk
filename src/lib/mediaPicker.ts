import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

// Every system file / photo picker the app opens. All of them are the system pickers, which need
// no storage or media permission.

/** A file chosen in a picker. `uri` is a local file:// or content:// URI. */
export type PickedFile = { uri: string; name: string; size: number; mimeType: string };

function fileName(uri: string, fallback: string): string {
  return uri.split('/').pop() || fallback;
}

/** One image, with the crop step: thumbnails and avatars. Returns its URI. */
export async function pickImage(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: true,
  });
  return result.canceled ? null : result.assets[0].uri;
}

/**
 * A square-cropped profile picture. Lower quality than other images: avatars show at 96 px at most,
 * and a full-size original would cost data and storage for nothing.
 */
export async function pickAvatar(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  return result.canceled ? null : result.assets[0].uri;
}

/** Photos and videos from the gallery, several at once: the Cloud tab's upload. */
export async function pickPhotosAndVideos(): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    quality: 0.9,
    exif: false,
  });
  if (result.canceled) return [];
  return result.assets.map(asset => {
    const isVideo = asset.type === 'video';
    return {
      uri: asset.uri,
      name:
        asset.fileName ?? `${isVideo ? 'video' : 'photo'}_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
      size: asset.fileSize ?? 0,
      mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
    };
  });
}

/** Any one document, copied to the cache so it can be read after the picker closes. */
export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    size: asset.size ?? 0,
    mimeType: asset.mimeType ?? 'application/octet-stream',
  };
}

/**
 * Video files for upload to Cloudflare Stream.
 *
 * The document picker rather than the photo picker: Android's photo picker crashes building
 * thumbnails for videos longer than ~10 s. `copyToCacheDirectory: false` streams straight from the
 * content:// URI instead of copying a multi-GB file first, which hung or ran out of memory.
 */
export async function pickVideoFiles({ multiple }: { multiple: boolean }): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'video/*',
    copyToCacheDirectory: false,
    multiple,
  });
  if (result.canceled || !result.assets) return [];
  return result.assets.map(asset => ({
    uri: asset.uri,
    name: asset.name ?? fileName(asset.uri, 'video.mp4'),
    size: asset.size ?? 0,
    mimeType: asset.mimeType ?? 'video/mp4',
  }));
}
