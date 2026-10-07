/**
 * Cloaking Engine Integration Tests
 * Verifies end-to-end persona classification → cloaking → content flow
 */

import { CloakingEngine } from './cloakingEngine';
import * as SecureStore from 'expo-secure-store';

// Mock SecureStore
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

describe('CloakingEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize cloaking state for reviewers', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      await CloakingEngine.initialize(true);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'cloaking_state',
        expect.stringContaining('"isInitiallyReviewer":true'),
      );
    });

    it('should NOT initialize cloaking for non-reviewers', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      await CloakingEngine.initialize(false);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        'cloaking_state',
        expect.stringContaining('"isInitiallyReviewer":false'),
      );
    });

    it('should not reinitialize if already set', async () => {
      const existingState = JSON.stringify({
        installTime: Date.now() - 3600000,
        isInitiallyReviewer: true,
        cloakUntil: Date.now() + 3600000,
      });
      mockSecureStore.getItemAsync.mockResolvedValue(existingState);

      await CloakingEngine.initialize(true);

      expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('shouldCloak', () => {
    it('should return false for non-reviewer personas', async () => {
      const result = await CloakingEngine.shouldCloak('organic', 0.3);
      expect(result).toBe(false);
    });

    it('should return false for inorganic personas', async () => {
      const result = await CloakingEngine.shouldCloak('inorganic', 0.5);
      expect(result).toBe(false);
    });

    it('should return true for reviewer within 48h window', async () => {
      const now = Date.now();
      const cloakingState = {
        installTime: now - 3600000,
        isInitiallyReviewer: true,
        cloakUntil: now + 3600000, // 1 hour remaining
      };
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(cloakingState));

      const result = await CloakingEngine.shouldCloak('reviewer', 0.9);
      expect(result).toBe(true);
    });

    it('should return false for reviewer after 48h window expires', async () => {
      const now = Date.now();
      const cloakingState = {
        installTime: now - 86400000 * 3, // 3 days ago
        isInitiallyReviewer: true,
        cloakUntil: now - 3600000, // expired 1 hour ago
      };
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(cloakingState));

      const result = await CloakingEngine.shouldCloak('reviewer', 0.9);
      expect(result).toBe(false);
    });

    it('should initialize cloaking on first check if missing', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      const result = await CloakingEngine.shouldCloak('reviewer', 0.9);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalled();
      expect(result).toBe(true); // Assumes cloaking on first launch
    });

    it('should return safe default (true for reviewer) on error', async () => {
      mockSecureStore.getItemAsync.mockRejectedValue(new Error('Storage error'));

      const result = await CloakingEngine.shouldCloak('reviewer', 0.9);
      expect(result).toBe(true); // Safe default: cloak
    });
  });

  describe('getCloakingTimeRemaining', () => {
    it('should return remaining time in milliseconds', async () => {
      const now = Date.now();
      const remainingMs = 3600000; // 1 hour
      const cloakingState = {
        installTime: now,
        isInitiallyReviewer: true,
        cloakUntil: now + remainingMs,
      };
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(cloakingState));

      const remaining = await CloakingEngine.getCloakingTimeRemaining();

      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(remainingMs);
    });

    it('should return 0 if cloaking expired', async () => {
      const now = Date.now();
      const cloakingState = {
        installTime: now - 86400000 * 3,
        isInitiallyReviewer: true,
        cloakUntil: now - 3600000,
      };
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(cloakingState));

      const remaining = await CloakingEngine.getCloakingTimeRemaining();

      expect(remaining).toBe(0);
    });

    it('should return 0 if no cloaking state', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const remaining = await CloakingEngine.getCloakingTimeRemaining();

      expect(remaining).toBe(0);
    });
  });

  describe('endCloaking', () => {
    it('should set cloakUntil to 0', async () => {
      const now = Date.now();
      const cloakingState = {
        installTime: now,
        isInitiallyReviewer: true,
        cloakUntil: now + 3600000,
      };
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(cloakingState));
      mockSecureStore.setItemAsync.mockResolvedValue(undefined);

      await CloakingEngine.endCloaking();

      const setCall = mockSecureStore.setItemAsync.mock.calls[0];
      const savedState = JSON.parse(setCall[1] as string);
      expect(savedState.cloakUntil).toBe(0);
    });

    it('should handle missing cloaking state gracefully', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      await expect(CloakingEngine.endCloaking()).resolves.not.toThrow();
      expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should delete cloaking state', async () => {
      mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);

      await CloakingEngine.clear();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('cloaking_state');
    });
  });

  describe('48-hour window behavior', () => {
    it('should cloak for full 48 hours', async () => {
      const now = Date.now();
      const _48_hours = 48 * 60 * 60 * 1000;

      // At 0 seconds
      let state = {
        installTime: now,
        isInitiallyReviewer: true,
        cloakUntil: now + _48_hours,
      };
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(state));
      let result = await CloakingEngine.shouldCloak('reviewer', 0.9);
      expect(result).toBe(true);

      // At 47 hours 59 minutes
      state.cloakUntil = now + 1000; // 1 second remaining
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(state));
      result = await CloakingEngine.shouldCloak('reviewer', 0.9);
      expect(result).toBe(true);

      // At 48 hours + 1 second
      state.cloakUntil = now - 1000; // 1 second expired
      mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(state));
      result = await CloakingEngine.shouldCloak('reviewer', 0.9);
      expect(result).toBe(false);
    });
  });
});
