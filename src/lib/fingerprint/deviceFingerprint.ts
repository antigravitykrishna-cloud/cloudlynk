/**
 * Device Fingerprinting Module
 * Detects: Emulators, rooted devices, debug builds, suspicious behavior
 * Used to classify users as "organic" (App Store) vs "inorganic" (ads/redirects)
 */

import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

export interface DeviceFingerprint {
  deviceId: string;
  isEmulator: boolean;
  isDebugBuild: boolean;
  isRooted: boolean;
  platform: string;
  osVersion: string;
  manufacturer: string;
  model: string;
  installSource: 'playstore' | 'ads' | 'unknown';
  timestamp: number;
}

export class DeviceFingerprintManager {
  private static readonly FINGERPRINT_KEY = 'device_fingerprint';

  /**
   * Get or create device fingerprint
   * Returns cached fingerprint if available, otherwise generates new one
   */
  static async getFingerprint(): Promise<DeviceFingerprint> {
    try {
      // Try to get cached fingerprint
      const cached = await SecureStore.getItemAsync(this.FINGERPRINT_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Failed to retrieve cached fingerprint:', e);
    }

    // Generate new fingerprint
    const fingerprint: DeviceFingerprint = {
      deviceId: await this.getDeviceId(),
      isEmulator: this.detectEmulator(),
      isDebugBuild: Device.isDevice === false,
      isRooted: await this.detectRoot(),
      platform: Device.osName || 'unknown',
      osVersion: Device.osVersion || 'unknown',
      manufacturer: Device.manufacturer || 'unknown',
      model: Device.modelName || 'unknown',
      installSource: this.detectInstallSource(),
      timestamp: Date.now(),
    };

    // Cache the fingerprint
    try {
      await SecureStore.setItemAsync(this.FINGERPRINT_KEY, JSON.stringify(fingerprint));
    } catch (e) {
      console.warn('Failed to cache fingerprint:', e);
    }

    return fingerprint;
  }

  /**
   * Get unique device identifier
   */
  private static async getDeviceId(): Promise<string> {
    try {
      // Try to get from secure storage first
      let deviceId = await SecureStore.getItemAsync('device_id');

      if (!deviceId) {
        // Generate new device ID
        deviceId = `${Device.deviceYearClass}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await SecureStore.setItemAsync('device_id', deviceId);
      }

      return deviceId;
    } catch (e) {
      return `${Device.deviceYearClass || 'unknown'}-${Date.now()}`;
    }
  }

  /**
   * Detect if running on emulator/simulator
   */
  private static detectEmulator(): boolean {
    // Expo Device API detects emulator/simulator
    if (!Device.isDevice) return true;

    // Additional checks for physical device
    const model = Device.modelName?.toLowerCase() || '';
    const brand = Device.manufacturer?.toLowerCase() || '';

    // Known emulator brands
    if (
      model.includes('emulator') ||
      model.includes('simulator') ||
      model.includes('generic') ||
      brand.includes('genymotion') ||
      brand.includes('virtual')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Detect if device is rooted (Android) / jailbroken (iOS)
   * Note: This is a simplified check - comprehensive checks require native modules
   */
  private static async detectRoot(): Promise<boolean> {
    // For production, use native modules:
    // Android: com.scottyab:rootbeer-lib
    // iOS: Custom checks in native code

    // Placeholder: In production, call native module via bridge
    // For now, we assume device is legitimate if not detected as emulator
    return false;
  }

  /**
   * Detect install source
   * Returns where the user installed the app from
   */
  private static detectInstallSource(): 'playstore' | 'ads' | 'unknown' {
    // In production, you would:
    // 1. Check Play Store referrer (Android)
    // 2. Check UTM parameters from deep link
    // 3. Check attribution data from AdMob/Facebook

    // For now, return 'unknown' - this should be set via referral tracking
    return 'unknown';
  }

  /**
   * Clear cached fingerprint (for testing/logout)
   */
  static async clearFingerprint(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.FINGERPRINT_KEY);
    } catch (e) {
      console.warn('Failed to clear fingerprint:', e);
    }
  }
}
