import { formatDuration, getTypeColor } from '@/components/channel/shared';

describe('formatDuration', () => {
  it('shows minutes under an hour', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('shows hours, and minutes when there are any', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(135)).toBe('2h 15m');
  });
});

describe('getTypeColor', () => {
  it('gives every content type its own colour', () => {
    const colours = (['movie', 'series', 'short', 'post'] as const).map(getTypeColor);
    expect(new Set(colours).size).toBe(4);
  });
});
