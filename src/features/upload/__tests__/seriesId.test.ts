import { seriesIdFor } from '@/features/upload/seriesId';

const CHANNEL = '3f2b9c1e-0000-4000-8000-000000000000';

describe('seriesIdFor', () => {
  it('is the same for the same series, however the name is typed', () => {
    expect(seriesIdFor(CHANNEL, 'Breaking Bad')).toBe(seriesIdFor(CHANNEL, '  breaking   bad '));
    expect(seriesIdFor(CHANNEL, 'Breaking Bad')).toBe(seriesIdFor(CHANNEL, 'Breaking Bad!'));
  });

  it('differs between series and between channels', () => {
    expect(seriesIdFor(CHANNEL, 'Breaking Bad')).not.toBe(seriesIdFor(CHANNEL, 'Better Call Saul'));
    expect(seriesIdFor(CHANNEL, 'Breaking Bad')).not.toBe(
      seriesIdFor('99999999-0000-4000-8000-000000000000', 'Breaking Bad'),
    );
  });

  it('keeps the format the database already stores', () => {
    expect(seriesIdFor(CHANNEL, 'Breaking Bad')).toMatch(/^local-3f2b9c1e-[0-9a-f]{8}$/);
  });

  it('matches ids created before this module existed', () => {
    // Reference value from the previous implementation, so existing series stay grouped.
    expect(seriesIdFor(CHANNEL, 'Breaking Bad')).toBe(legacySeriesId(CHANNEL, 'Breaking Bad'));
  });
});

function legacySeriesId(channelId: string, seriesName: string): string {
  const slug = seriesName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  let hash = 5381;
  const str = `${channelId}:${slug}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return `local-${channelId.slice(0, 8)}-${hash.toString(16).padStart(8, '0')}`;
}
