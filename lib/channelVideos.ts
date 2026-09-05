import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const BUCKET = 'channel-videos';

export interface VideoPickResult {
  uri: string;
  fileName: string;
  duration: number | null;
  fileSize: number;
  mimeType: string;
}

export interface ChannelVideo {
  id: string;
  channel_id: string;
  uploaded_by: string;
  storage_path: string;
  thumbnail_path: string | null;
  title: string | null;
  description: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function pickVideo(): Promise<VideoPickResult | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permission to access media library was denied. Please enable it in Settings.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
    quality: 1,
    videoMaxDuration: 300,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const uri = asset.uri;

  let fileSize = asset.fileSize ?? 0;
  if (!fileSize) {
    const info = await FileSystem.getInfoAsync(uri);
    fileSize = info.exists ? (info.size ?? 0) : 0;
  }

  const fileName = asset.fileName ?? uri.split('/').pop() ?? 'video.mp4';
  const mimeType = asset.mimeType ?? 'video/mp4';
  const duration = asset.duration ? Math.round(asset.duration / 1000) : null;

  return { uri, fileName, duration, fileSize, mimeType };
}

export function isOverSizeLimit(fileSize: number): boolean {
  return fileSize > MAX_FILE_SIZE_BYTES;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  const delays = [1000, 3000];
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }
    }
  }
  throw lastError;
}

/**
 * Uploads via fetch(uri).arrayBuffer() → Uint8Array.
 *
 * Why not Blob? supabase-js storage.upload() in React Native rejects Blob/ArrayBufferView
 * with: "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported".
 * Uint8Array (a typed array) IS accepted because supabase-js handles it as raw bytes.
 *
 * Memory: ~2x file size peak (ArrayBuffer + Uint8Array view). For 25MB video = ~50MB.
 * This is better than the old Base64 path (91MB) and the only path that works in RN.
 */
export async function uploadChannelVideo(
  channelId: string,
  uploadedBy: string,
  video: VideoPickResult,
): Promise<{ storagePath: string }> {
  const ext = video.mimeType.includes('quicktime') ? 'mov' : 'mp4';
  const storagePath = `${uploadedBy}/${channelId}/${generateId()}.${ext}`;

  const response = await fetch(video.uri);
  if (!response.ok) {
    throw new Error(`Could not read video file: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  await withRetry(async () => {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, uint8Array, {
        contentType: video.mimeType,
        upsert: false,
      });

    if (error) {
      if (__DEV__) console.error('[channelVideos] Storage upload error:', error);
      throw new Error(`Video upload failed: ${error.message}`);
    }
  });

  return { storagePath };
}

export async function attachVideoToChannel(
  channelId: string,
  uploadedBy: string,
  storagePath: string,
  video: VideoPickResult,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('channel_videos')
    .insert({
      channel_id: channelId,
      uploaded_by: uploadedBy,
      storage_path: storagePath,
      title: video.fileName,
      duration_seconds: video.duration,
      file_size_bytes: video.fileSize,
      mime_type: video.mimeType,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    if (__DEV__) console.error('[channelVideos] Insert channel_videos error:', error);
    throw new Error(`Failed to save video record: ${error.message}`);
  }
  return { id: data.id };
}

export async function getChannelVideos(channelId: string): Promise<ChannelVideo[]> {
  const { data, error } = await supabase
    .from('channel_videos')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ChannelVideo[];
}

export async function getMyPendingVideos(uploadedBy: string): Promise<ChannelVideo[]> {
  const { data, error } = await supabase
    .from('channel_videos')
    .select('*')
    .eq('uploaded_by', uploadedBy)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ChannelVideo[];
}
