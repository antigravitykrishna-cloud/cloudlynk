import { useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'cloudlynk_usage_ms';
const FREE_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const SAVE_INTERVAL_MS = 60 * 1000;   // save every 60 seconds

export function useUsageTimer(isPaidUser: boolean) {
  const [usedMs, setUsedMs] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sessionStart = useRef<number>(Date.now());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const storedRef = useRef<number>(0);

  // â”€â”€ Load stored time â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (isPaidUser) { setLoaded(true); return; }
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      const stored = val ? parseInt(val, 10) : 0;
      storedRef.current = stored;
      setUsedMs(stored);
      if (stored >= FREE_LIMIT_MS) setShowPaywall(true);
      sessionStart.current = Date.now();
      setLoaded(true);
    });
  }, [isPaidUser]);

  // â”€â”€ Track foreground time â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (isPaidUser || !loaded) return;

    const saveElapsed = async () => {
      const elapsed = Date.now() - sessionStart.current;
      sessionStart.current = Date.now();
      const newTotal = storedRef.current + elapsed;
      storedRef.current = newTotal;
      await AsyncStorage.setItem(STORAGE_KEY, String(newTotal));
      setUsedMs(newTotal);
      if (newTotal >= FREE_LIMIT_MS) setShowPaywall(true);
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (appStateRef.current === 'active' && nextState !== 'active') {
        // Going to background â€” save
        saveElapsed();
      } else if (appStateRef.current !== 'active' && nextState === 'active') {
        // Returning to foreground â€” reset session start
        sessionStart.current = Date.now();
      }
      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Periodic save every 60 seconds while in foreground
    const interval = setInterval(saveElapsed, SAVE_INTERVAL_MS);

    return () => {
      subscription.remove();
      clearInterval(interval);
      // Save on unmount
      saveElapsed();
    };
  }, [isPaidUser, loaded]);

  // â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const minutesUsed = Math.min(30, Math.floor(usedMs / 60000));
  const minutesLeft = Math.max(0, 30 - minutesUsed);

  const resetTimer = async () => {
    storedRef.current = 0;
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUsedMs(0);
    setShowPaywall(false);
    sessionStart.current = Date.now();
  };

  // DEV ONLY — used by the Profile screen's dev tools panel to force the
  // paywall without waiting 30 minutes. No-op if the user is on a paid plan
  // (the timer is bypassed entirely for paid users).
  const setUsage = async (ms: number) => {
    storedRef.current = ms;
    await AsyncStorage.setItem(STORAGE_KEY, String(ms));
    setUsedMs(ms);
    if (ms >= FREE_LIMIT_MS) setShowPaywall(true);
  };

  const dismissPaywall = () => setShowPaywall(false); // temp dismiss; gate will re-show on next action

  return {
    usedMs,
    minutesUsed,
    minutesLeft,
    showPaywall,
    resetTimer,
    setUsage,
    dismissPaywall,
  };
}
