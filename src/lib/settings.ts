import { supabase } from './supabase';

export async function getAppSetting(key: string): Promise<any> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single();
  if (error) return null;
  return data?.value;
}
