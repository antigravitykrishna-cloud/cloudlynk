import { withTimeout } from '@/lib/async';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves with the value when it settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'slow')).resolves.toBe(42);
  });

  it('passes the original rejection through', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'slow')).rejects.toThrow(
      'boom',
    );
  });

  it('rejects with the message when time runs out', async () => {
    const pending = withTimeout(new Promise(() => {}), 1000, 'Timed out.');
    jest.advanceTimersByTime(1000);
    await expect(pending).rejects.toThrow('Timed out.');
  });
});
