import { validateSignup, type SignupForm } from '@/features/auth/signupValidation';

const YEAR = 2026;
const valid: SignupForm = {
  fullName: 'Asha Rao',
  email: 'asha@example.com',
  password: 'correct-horse',
  confirmPassword: 'correct-horse',
  birthYear: '1998',
  agreedToPolicies: true,
};

const problem = (patch: Partial<SignupForm>) => validateSignup({ ...valid, ...patch }, YEAR)?.title;

describe('validateSignup', () => {
  it('accepts a complete, valid form', () => {
    expect(validateSignup(valid, YEAR)).toBeNull();
  });

  it('requires every field', () => {
    expect(problem({ fullName: '  ' })).toBe('Missing fields');
    expect(problem({ birthYear: '' })).toBe('Missing fields');
  });

  it('checks the passwords match and are long enough', () => {
    expect(problem({ confirmPassword: 'something-else' })).toBe('Password mismatch');
    expect(problem({ password: 'short', confirmPassword: 'short' })).toBe('Weak password');
  });

  it('rejects an impossible birth year', () => {
    expect(problem({ birthYear: '98' })).toBe('Invalid birth year');
    expect(problem({ birthYear: '2030' })).toBe('Invalid birth year');
    expect(problem({ birthYear: 'abcd' })).toBe('Invalid birth year');
  });

  it('turns away anyone under 18', () => {
    expect(problem({ birthYear: '2009' })).toBe('Age restriction');
    expect(problem({ birthYear: '2008' })).toBeUndefined();
  });

  it('requires the policies to be accepted last', () => {
    expect(problem({ agreedToPolicies: false })).toBe('Agreement required');
  });
});
