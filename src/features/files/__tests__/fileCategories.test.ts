import { categoryOf } from '@/features/files/fileCategories';

describe('categoryOf', () => {
  it('reads the category from the MIME type', () => {
    expect(categoryOf('image/jpeg')).toBe('photo');
    expect(categoryOf('video/mp4')).toBe('video');
    expect(categoryOf('audio/mpeg')).toBe('audio');
  });

  it('treats PDFs, office documents and text as documents', () => {
    expect(categoryOf('application/pdf')).toBe('document');
    expect(
      categoryOf('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe('document');
    expect(categoryOf('application/vnd.ms-excel.spreadsheet')).toBe('document');
    expect(categoryOf('text/plain')).toBe('document');
  });

  it('puts anything else under other', () => {
    expect(categoryOf('application/zip')).toBe('other');
    expect(categoryOf('application/octet-stream')).toBe('other');
  });
});
