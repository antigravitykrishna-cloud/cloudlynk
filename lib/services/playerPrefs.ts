/**
 * v0.7.0 Player preferences CRUD.
 * Reads/writes user_preferences table (quality, speed, subtitle language, auto-play).
 */

import { supabase } from '../supabase';

export type PlayerPrefs = {
  user_id: string;
  default_quality: string;
  default_speed: number;
  default_subtitle_language: string;
  auto_play_next_episode: boolean;
};

export const PlayerPrefsService = {
  async get(userId: string): Promise<PlayerPrefs | null> {
    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data as PlayerPrefs | null;
  },

  async upsert(userId: string, prefs: Partial<Omit<PlayerPrefs, 'user_id'>>): Promise<void> {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' });
    if (error && __DEV__) console.error('[playerPrefs] upsert error:', error.message);
  },
};
