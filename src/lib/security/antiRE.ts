/**
 * Anti-Reverse Engineering Checks
 * Detects common debugging and analysis tools
 * Disables functionality if compromise is detected
 */

import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';

const { AntiRE: AntiREModule } = NativeModules;

/**
 * Check if Frida is running (dynamic code injection tool)
 * Frida is commonly used to hook and modify app behavior at runtime
 */
export function detectFrida(): boolean {
  if (Platform.OS === 'android' && AntiREModule?.detectFrida) {
    try {
      return AntiREModule.detectFrida();
    } catch (e) {
      if (__DEV__) console.warn('Failed to check for Frida:', e);
    }
  }

  return false;
}

/**
 * Check for debugging tools (debugger, logcat, adb)
 */
export function detectDebugger(): boolean {
  if (__DEV__) {
    return false; // Don't block during development
  }

  if (Platform.OS === 'android' && AntiREModule?.detectDebugger) {
    try {
      return AntiREModule.detectDebugger();
    } catch (e) {
      if (__DEV__) console.warn('Failed to check for debugger:', e);
    }
  }

  return false;
}

/**
 * Check for xposed or other hooking frameworks
 */
export function detectHookingFramework(): boolean {
  if (Platform.OS === 'android' && AntiREModule?.detectHookingFramework) {
    try {
      return AntiREModule.detectHookingFramework();
    } catch (e) {
      if (__DEV__) console.warn('Failed to check for hooking framework:', e);
    }
  }

  return false;
}

/**
 * Perform comprehensive anti-RE check
 * Returns true if any compromise detected
 */
export async function checkCompromise(): Promise<boolean> {
  try {
    const fridaDetected = detectFrida();
    const debuggerDetected = detectDebugger();
    const hookingDetected = detectHookingFramework();

    if (fridaDetected || hookingDetected) {
      if (__DEV__) {
        console.warn('Compromise detected: Frida or hooking framework');
      }
      return true;
    }

    return false;
  } catch (e) {
    console.warn('Error during compromise check:', e);
    return false;
  }
}

/**
 * Clear sensitive data immediately if compromise detected
 * This prevents attackers from accessing secrets even after hooking
 */
export async function wipeOnCompromise(): Promise<void> {
  try {
    const compromised = await checkCompromise();
    if (compromised) {
      if (__DEV__) {
        console.warn('⚠️ COMPROMISE DETECTED: Wiping sensitive data');
      }

      // Clear all SecureStore data
      const sensitiveKeys = ['cloaking_state', 'auth_token', 'encryption_key', 'device_id'];

      for (const key of sensitiveKeys) {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch (e) {
          // Best effort
        }
      }

      // Clear app cache
      try {
        // Could clear AsyncStorage or other caches here if available
      } catch (e) {
        // Best effort
      }

      // Log security event to server
      try {
        await supabase.from('security_events').insert({
          event_type: 'compromise_detected',
          reason: 'Frida or hooking framework detected on startup',
          details: {
            frida: detectFrida(),
            debugger: detectDebugger(),
            hooking: detectHookingFramework(),
          },
        });
      } catch (e) {
        if (__DEV__) console.warn('Failed to log security event:', e);
      }

      // In a real app, you might:
      // 1. Force sign-out
      // 2. Delete account
      // 3. Report to security team
      // 4. Block the device
    }
  } catch (e) {
    console.warn('Failed to wipe data on compromise:', e);
  }
}
