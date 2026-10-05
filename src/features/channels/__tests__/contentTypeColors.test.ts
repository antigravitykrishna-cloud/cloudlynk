import { getTypeColor } from '@/features/channels/components/contentTypeColors';

describe('getTypeColor', () => {
  it('gives every content type its own colour', () => {
    const colours = (['movie', 'series', 'short', 'post'] as const).map(getTypeColor);
    expect(new Set(colours).size).toBe(4);
  });
});
