import { formatBytes, formatClock, formatDate, formatMinutes, formatTimeAgo } from '@/utils/format';

describe('formatMinutes', () => {
  it('shows minutes under an hour', () => {
    expect(formatMinutes(45)).toBe('45m');
  });

  it('shows hours, and minutes when there are any', () => {
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(135)).toBe('2h 15m');
  });
});

describe('formatClock', () => {
  it('pads seconds and omits hours under an hour', () => {
    expect(formatClock(95)).toBe('1:35');
    expect(formatClock(5)).toBe('0:05');
  });

  it('adds hours with padded minutes', () => {
    expect(formatClock(3700)).toBe('1:01:40');
  });

  it('never shows a negative time', () => {
    expect(formatClock(-12)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  it('picks the largest whole unit and drops a trailing .0', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(15 * 1024 ** 3)).toBe('15 GB');
  });
});

describe('formatTimeAgo', () => {
  const now = Date.parse('2026-03-10T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('counts up through minutes, hours and days', () => {
    expect(formatTimeAgo(ago(20_000), now)).toBe('just now');
    expect(formatTimeAgo(ago(5 * 60_000), now)).toBe('5m ago');
    expect(formatTimeAgo(ago(3 * 3_600_000), now)).toBe('3h ago');
    expect(formatTimeAgo(ago(2 * 86_400_000), now)).toBe('2d ago');
  });

  it('switches to a date after a week', () => {
    expect(formatTimeAgo(ago(10 * 86_400_000), now)).not.toMatch(/ago/);
  });
});

describe('formatDate', () => {
  it('uses the fallback when there is no date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined, 'Never')).toBe('Never');
  });

  it('includes the year', () => {
    expect(formatDate('2026-03-05T10:00:00Z')).toMatch(/2026/);
  });
});
