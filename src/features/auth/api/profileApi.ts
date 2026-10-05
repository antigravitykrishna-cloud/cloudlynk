import { supabase } from '@/lib/supabase';
import type { Tables, TablesUpdate } from '@/lib/database.types';

/** The signed-in person's row in `profiles`: plan, approval, flags and settings. */
export type Profile = Tables<'profiles'>;
export type ProfileUpdate = TablesUpdate<'profiles'>;

export const profileApi = {
  async get(userId: string): Promise<Profile> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    return data;
  },

  /**
   * Updates the caller's own profile. Row-level security limits which columns a member may change;
   * plan and approval fields are written only by the server. Throws the PostgrestError, so callers
   * can tell a taken username (23505) from other failures.
   */
  async update(userId: string, patch: ProfileUpdate): Promise<void> {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (error) throw error;
  },
};
