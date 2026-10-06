/**
 * Device Fingerprinting Module
 * Detects: Emulators, rooted devices, debug builds, suspicious behavior
 * Used to classify users as "organic" (App Store) vs "inorganic" (ads/redirects)
 */

import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import { NativeModules, Platform } from 'react-native';

const { Fingerprint: FingerprintModule } = NativeModules;

// Store referrer info globally so detectInstallSource can access it
let installSourceOverride: 'playstore' | 'ads' | undefined;

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
   * Initialize install source detection from deep linking
   * Call this early in app startup (e.g., in root _layout.tsx)
   * to capture UTM parameters and referrer info
   */
  static async initializeInstallSource(): Promise<void> {
    try {
      // Get the initial URL if the app was opened via deep link
      const url = await Linking.getInitialURL();
      if (!url) return;

      // Parse the URL to extract query parameters
      const parsed = Linking.parse(url);
      const queryParams = parsed.queryParams || {};

      // Check for UTM parameters (used by ad networks)
      if (
        queryParams.utm_source ||
        queryParams.utm_medium ||
        queryParams.utm_campaign ||
        queryParams.utm_content
      ) {
        // User came from an ad link
        installSourceOverride = 'ads';
      }
      // Note: Play Store referrer detection requires the Play Install Referrer API,
      // which needs native setup. For now, 'unknown' stays unknown unless UTMs are present.
    } catch (err) {
      if (__DEV__) console.warn('Failed to initialize install source:', err);
    }
  }

  /**
   * Get or create device fingerprint
   * Returns cached fingerprint if available, otherwise generates new one
   */
  static async getFingerprint(): Promise<DeviceFingerprint> {
    // TEMP-PERSONA-TEST-START (remove before release)
    const testScenario = process.env.EXPO_PUBLIC_PERSONA_TEST;
    if (__DEV__ && (testScenario === 'organic' || testScenario === 'inorganic')) {
      return {
        deviceId: await this.getDeviceId(),
        isEmulator: false,
        isDebugBuild: false,
        isRooted: false,
        platform: Device.osName || 'unknown',
        osVersion: Device.osVersion || 'unknown',
        manufacturer: Device.manufacturer || 'unknown',
        model: Device.modelName || 'unknown',
        installSource: testScenario === 'organic' ? 'playstore' : 'ads',
        timestamp: Date.now(),
      };
    }
    // TEMP-PERSONA-TEST-END

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
      installSource: await this.detectInstallSource(),
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
   * Uses native Play Integrity API on Android
   */
  private static async detectRoot(): Promise<boolean> {
    try {
      if (Platform.OS === 'android' && FingerprintModule?.detectRoot) {
        return await FingerprintModule.detectRoot();
      }
      // iOS: Simplified check for jailbreak indicators
      if (Platform.OS === 'ios') {
        return this.detectIOSJailbreak();
      }
      return false;
    } catch (e) {
      if (__DEV__) console.warn('Failed to detect root:', e);
      return false;
    }
  }

  private static detectIOSJailbreak(): boolean {
    // Simplified iOS jailbreak detection (full version requires native code)
    // This is a stub—production requires native module
    return false;
  }

  /**
   * Detect install source
   * Returns where the user installed the app from (Play Store, ads, referral, or unknown)
   */
  private static async detectInstallSource(): Promise<'playstore' | 'ads' | 'unknown'> {
    // Return override if set during app initialization via deep link
    if (installSourceOverride) {
      return installSourceOverride;
    }

    // Android: Use Play Install Referrer API
    if (Platform.OS === 'android' && FingerprintModule?.getPlayInstallReferrer) {
      try {
        const referrer = await FingerprintModule.getPlayInstallReferrer();
        if (referrer?.referrer) {
          // Parse referrer string for source detection
          if (referrer.referrer.includes('utm_source=ads')) {
            return 'ads';
          }
          // If referrer exists but source not ads, assume Play Store
          return 'playstore';
        }
      } catch (e) {
        if (__DEV__) console.warn('Failed to get install referrer:', e);
      }
    }

    // Fallback to Play Store if no referrer found
    return 'playstore';
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
