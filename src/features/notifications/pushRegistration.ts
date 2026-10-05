import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Colors } from '@/theme';
import { profileApi } from '@/features/auth/api/profileApi';

/**
 * Asks for permission to send push notifications and returns this phone's Expo push token, or null
 * when permission is refused, on a simulator, or when the token cannot be fetched.
 */
async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: Colors.brandBlue,
    });
  }
  if (!Device.isDevice) return null;

  const current = await Notifications.getPermissionsAsync();
  const status =
    current.status === 'granted'
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (err) {
    if (__DEV__) console.warn('Failed to get push token:', (err as Error)?.message);
    return null;
  }
}

/** Saves this phone's push token on the person's profile so the server can reach them. */
export async function registerForPushNotifications(userId: string): Promise<void> {
  try {
    const token = await getPushToken();
    if (token) await profileApi.update(userId, { fcm_token: token });
  } catch (err) {
    if (__DEV__) console.warn('Failed to register for push notifications', err);
  }
}
