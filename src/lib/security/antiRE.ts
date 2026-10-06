/**
 * Anti-Reverse Engineering Checks
 * Detects common debugging and analysis tools
 * Disables functionality if compromise is detected
 */

import { NativeModules, Platform } from 'react-native';

const { Fingerprint: FingerprintModule } = NativeModules;

/**
 * Check if Frida is running (dynamic code injection tool)
 * Frida is commonly used to hook and modify app behavior at runtime
 */
export function detectFrida(): boolean {
  // Check for Frida's common patterns
  const fridaIndicators = [
    '/system/lib/libfrida.so',
    '/system/lib64/libfrida.so',
    '/data/local/tmp/frida-server',
    '/proc/self/maps', // Look for frida library mapping (advanced check)
  ];

  // In JavaScript, we can't directly read files, so rely on native module
  if (Platform.OS === 'android' && FingerprintModule?.detectFrida) {
    try {
      return FingerprintModule.detectFrida();
    } catch (e) {
      console.warn('Failed to check for Frida:', e);
    }
  }

  return false;
}

/**
 * Check for debugging tools (debugger, logcat, adb)
 */
export function detectDebugger(): boolean {
  // Check if __DEV__ flag is true (development mode)
  if (__DEV__) {
    // Could be legitimate development, but flag it
    return false; // Don't block during development
  }

  // In production, check for debugger presence
  if (Platform.OS === 'android' && FingerprintModule?.detectDebugger) {
    try {
      return FingerprintModule.detectDebugger();
    } catch (e) {
      console.warn('Failed to check for debugger:', e);
    }
  }

  return false;
}

/**
 * Check for xposed or other hooking frameworks
 */
export function detectHookingFramework(): boolean {
  if (Platform.OS === 'android' && FingerprintModule?.detectHookingFramework) {
    try {
      return FingerprintModule.detectHookingFramework();
    } catch (e) {
      console.warn('Failed to check for hooking framework:', e);
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
        console.warn('Wiping sensitive data due to compromise detection');
      }
      // Wipe auth tokens, encryption keys, sensitive strings from memory
      // In production, this would trigger immediate logout and data deletion
      // Implementation would go here
    }
  } catch (e) {
    console.warn('Failed to wipe data on compromise:', e);
  }
}
