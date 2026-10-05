import { showAlert } from '@/components/ui/Feedback';
import { guestTappedTitle, promptSaveAccount } from '@/lib/auth/guest';
import { peekPostLoginRoute, setPostLoginRoute } from '@/lib/auth/postLogin';

jest.mock('@/components/ui/Feedback', () => ({ showAlert: jest.fn() }));

const router = { push: jest.fn() } as unknown as Parameters<typeof guestTappedTitle>[0];

beforeEach(() => jest.clearAllMocks());

describe('guestTappedTitle', () => {
  it('sends a guest without a plan to the plans', () => {
    guestTappedTitle(router, false);
    expect(router.push).toHaveBeenCalledWith('/premium');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('asks a guest who already has a plan to save the account instead', () => {
    guestTappedTitle(router, true);
    expect(router.push).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith(
      'Save your account to watch',
      expect.any(String),
      expect.any(Array),
    );
  });
});

describe('promptSaveAccount', () => {
  it('names the blocked action and offers the save screen', () => {
    promptSaveAccount(router, 'join channels');
    const [title, message, buttons] = (showAlert as jest.Mock).mock.calls[0];
    expect(title).toBe('Save your account first');
    expect(message).toContain('join channels');

    buttons.find((b: { text: string }) => b.text === 'Save account').onPress();
    expect(router.push).toHaveBeenCalledWith('/save-account');
  });
});

describe('post-login route', () => {
  afterEach(() => setPostLoginRoute(null));

  it('remembers the destination until it is cleared', () => {
    expect(peekPostLoginRoute()).toBeNull();
    setPostLoginRoute('/premium');
    expect(peekPostLoginRoute()).toBe('/premium');
    expect(peekPostLoginRoute()).toBe('/premium'); // peeking does not consume it
    setPostLoginRoute(null);
    expect(peekPostLoginRoute()).toBeNull();
  });
});
