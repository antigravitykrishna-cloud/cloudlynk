import { errorMessage } from '@/utils/errors';

describe('errorMessage', () => {
  it("uses an Error's own message", () => {
    expect(errorMessage(new Error('Disk full'), 'Upload failed')).toBe('Disk full');
  });

  it('reads the message of a plain error object, as Supabase returns them', () => {
    expect(errorMessage({ message: 'duplicate key', code: '23505' }, 'Save failed')).toBe(
      'duplicate key',
    );
  });

  it('falls back when there is no usable message', () => {
    expect(errorMessage(null, 'Try again')).toBe('Try again');
    expect(errorMessage('boom', 'Try again')).toBe('Try again');
    expect(errorMessage(new Error(''), 'Try again')).toBe('Try again');
    expect(errorMessage({ message: 42 }, 'Try again')).toBe('Try again');
  });
});
