import type { DataExport } from '@/features/account/api/dataExportApi';

/** The lists in an export, each counted as one record per entry. */
const RECORD_LISTS = [
  'channel_memberships',
  'channels_owned',
  'channel_posts_authored',
  'subscription_requests',
  'uploaded_videos',
];

/** How many records an export holds: the profile, plus every entry in each list. */
export function countExportedRecords(data: DataExport): number {
  const profile = data.profile ? 1 : 0;
  return RECORD_LISTS.reduce((count, key) => {
    const list = data[key];
    return count + (Array.isArray(list) ? list.length : 0);
  }, profile);
}

export function exportFileName(now: number = Date.now()): string {
  return `cloudlynk-data-export-${now}.json`;
}
