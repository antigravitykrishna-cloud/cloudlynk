import { profileApi, type Profile } from '@/features/auth/api/profileApi';

// The signed-in person's profile, shared by every useAuth() caller. It lives at module scope so one
// fetch updates every mounted screen; with per-hook state a screen could keep routing on a stale
// copy. React reads it through useSyncExternalStore.

let profile: Profile | null = null;
/** Whether the current session's profile has been fetched at least once. */
let checked = false;
const listeners = new Set<() => void>();

// Deduplicates the burst of identical fetches when many mounted screens react to one auth event.
let inFlightUserId: string | null = null;
let inFlight: Promise<void> | null = null;

function emit() {
  listeners.forEach(listener => listener());
}

async function fetchProfile(userId: string): Promise<void> {
  try {
    profile = await profileApi.get(userId);
  } catch {
    // Keep the previous value: a network blip must not look like "profile missing" to the root
    // redirect. `checked` still flips so nothing waits forever.
  }
  checked = true;
  emit();
}

export const profileStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getProfile: (): Profile | null => profile,
  isChecked: (): boolean => checked,

  /**
   * Loads the profile for `userId`. `force` skips the dedupe: anything that has just written to the
   * profile (accepting the terms, a purchase) must not attach to a read that started before the
   * write landed, or it would get the old data back.
   */
  load(userId: string, { force = false }: { force?: boolean } = {}): Promise<void> {
    if (!force && inFlight && inFlightUserId === userId) return inFlight;
    inFlightUserId = userId;
    inFlight = fetchProfile(userId).finally(() => {
      inFlight = null;
      inFlightUserId = null;
    });
    return inFlight;
  },

  clear(): void {
    profile = null;
    checked = false;
    inFlight = null;
    inFlightUserId = null;
    emit();
  },
};
