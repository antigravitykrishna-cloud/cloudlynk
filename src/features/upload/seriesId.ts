/**
 * A stable id for a series, made from the channel and the series name as typed. Episodes uploaded
 * at different times with the same name land in the same series without the uploader having to
 * pick an existing one. Case, spacing and punctuation in the name do not matter.
 */
export function seriesIdFor(channelId: string, seriesName: string): string {
  const slug = seriesName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // djb2-xor: short, deterministic and good enough to tell series names apart.
  let hash = 5381;
  for (const char of `${channelId}:${slug}`) {
    hash = (((hash << 5) + hash) ^ char.charCodeAt(0)) >>> 0;
  }
  return `local-${channelId.slice(0, 8)}-${hash.toString(16).padStart(8, '0')}`;
}
