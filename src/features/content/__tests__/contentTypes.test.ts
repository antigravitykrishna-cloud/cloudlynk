import { contentTypeColor, contentTypeIcon } from '@/features/content/contentTypes';

const TYPES = ['movie', 'series', 'short', 'post'] as const;

describe('contentTypeColor', () => {
  it('gives every content type its own colour', () => {
    expect(new Set(TYPES.map(contentTypeColor)).size).toBe(TYPES.length);
  });
});

describe('contentTypeIcon', () => {
  it('gives every content type its own icon', () => {
    expect(new Set(TYPES.map(contentTypeIcon)).size).toBe(TYPES.length);
  });

  it('falls back to a document for unknown or missing types', () => {
    expect(contentTypeIcon(undefined)).toBe('document');
    expect(contentTypeIcon('podcast')).toBe('document');
  });
});
