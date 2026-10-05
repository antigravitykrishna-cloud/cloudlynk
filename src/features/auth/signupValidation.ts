export type SignupForm = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  birthYear: string;
  agreedToPolicies: boolean;
};

export type FormProblem = { title: string; message: string };

export const MIN_PASSWORD_LENGTH = 8;
const MINIMUM_AGE = 18;

/** The first problem with the signup form, or null when it can be submitted. */
export function validateSignup(
  form: SignupForm,
  currentYear: number = new Date().getFullYear(),
): FormProblem | null {
  if (!form.fullName.trim() || !form.email.trim() || !form.password || !form.birthYear.trim()) {
    return { title: 'Missing fields', message: 'Please fill in all fields.' };
  }
  if (form.password !== form.confirmPassword) {
    return { title: 'Password mismatch', message: 'Passwords do not match.' };
  }
  if (form.password.length < MIN_PASSWORD_LENGTH) {
    return {
      title: 'Weak password',
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const birthYear = Number(form.birthYear.trim());
  if (!Number.isInteger(birthYear) || birthYear < currentYear - 120 || birthYear > currentYear) {
    return {
      title: 'Invalid birth year',
      message: 'Please enter a valid 4-digit birth year (e.g. 1998).',
    };
  }
  if (currentYear - birthYear < MINIMUM_AGE) {
    return {
      title: 'Age restriction',
      message: `You must be at least ${MINIMUM_AGE} years old to create a Cloudlynk account.`,
    };
  }
  if (!form.agreedToPolicies) {
    return {
      title: 'Agreement required',
      message:
        'Please agree to the Terms of Service, Community Guidelines, and Privacy Policy to continue.',
    };
  }
  return null;
}
