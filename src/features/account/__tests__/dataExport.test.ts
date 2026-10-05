import { countExportedRecords, exportFileName } from '@/features/account/dataExport';

describe('countExportedRecords', () => {
  it('counts the profile plus every entry in each list', () => {
    expect(
      countExportedRecords({
        profile: { id: 'u1' },
        channel_memberships: [{}, {}],
        channels_owned: [{}],
        channel_posts_authored: [],
        subscription_requests: [{}],
        uploaded_videos: [{}, {}, {}],
      }),
    ).toBe(8);
  });

  it('ignores missing lists and fields that are not lists', () => {
    expect(countExportedRecords({ channels_owned: null, uploaded_videos: 'n/a' })).toBe(0);
  });
});

describe('exportFileName', () => {
  it('stamps the file with the export time', () => {
    expect(exportFileName(1700000000000)).toBe('cloudlynk-data-export-1700000000000.json');
  });
});
