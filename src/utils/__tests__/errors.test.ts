import { errorCode, errorMessage } from '@/utils/errors';

describe('errorMessage', () => {
  it("uses an Error's own message", () => {
    expect(errorMessage(new Error('Disk full'), 'Upload failed')).toBe('Disk full');
  });

  it('reads the message of a plain error object, as Supabase returns them', () => {
    expect(errorMessage({ message: 'duplicate key', code: '23505' }, 'Save failed')).toBe(
      'duplicate key',
    );
  });

  it('uses a thrown string as the message', () => {
    expect(errorMessage('Network down', 'Try again')).toBe('Network down');
  });

  it('falls back when there is no usable message', () => {
    expect(errorMessage(null, 'Try again')).toBe('Try again');
    expect(errorMessage('  ', 'Try again')).toBe('Try again');
    expect(errorMessage(new Error(''), 'Try again')).toBe('Try again');
    expect(errorMessage({ message: 42 }, 'Try again')).toBe('Try again');
  });
});

describe('errorCode', () => {
  it('reads string and numeric codes', () => {
    expect(errorCode({ code: '23505', message: 'duplicate key' })).toBe('23505');
    expect(errorCode({ code: 12501 })).toBe('12501');
  });

  it('is undefined without a code', () => {
    expect(errorCode(new Error('x'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode({ code: { nested: true } })).toBeUndefined();
  });
});
