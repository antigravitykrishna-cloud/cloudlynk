import { supabase } from '@/lib/supabase';

/** A viewer's saved player settings (`user_preferences`). */
export type PlayerPrefs = {
  user_id: string;
  default_quality: string;
  default_speed: number;
  default_subtitle_language: string;
  auto_play_next_episode: boolean;
};

export const playerPrefsApi = {
  async get(userId: string): Promise<PlayerPrefs | null> {
    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data as PlayerPrefs | null;
  },

  async save(userId: string, prefs: Partial<Omit<PlayerPrefs, 'user_id'>>): Promise<void> {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });
    if (error && __DEV__) console.error('[playerPrefs] save error:', error.message);
  },
};
