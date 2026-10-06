import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { DeviceFingerprintManager } from '@/lib/fingerprint/deviceFingerprint';

/** Records this device for the signed-in user so admins can see it on the approvals screen. */
export async function recordCurrentDevice(): Promise<void> {
  const fingerprint = await DeviceFingerprintManager.getFingerprint();
  const { error } = await supabase.rpc('record_device', {
    p_device_id: fingerprint.deviceId,
    p_platform: fingerprint.platform,
    p_model: fingerprint.model,
    p_app_version: Constants.expoConfig?.version,
  });
  if (error) throw error;
}
