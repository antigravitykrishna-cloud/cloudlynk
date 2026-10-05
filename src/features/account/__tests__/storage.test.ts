import { storagePercent } from '@/features/account/storage';

describe('storagePercent', () => {
  it('is the share of the limit in use', () => {
    expect(storagePercent(5, 20)).toBe(25);
  });

  it('never goes past 100, even over quota', () => {
    expect(storagePercent(30, 20)).toBe(100);
  });

  it('reads as empty when there is no limit', () => {
    expect(storagePercent(30, 0)).toBe(0);
  });
});
