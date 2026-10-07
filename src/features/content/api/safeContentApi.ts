import { supabase } from '@/lib/supabase';

export interface SafeContent {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  category: string;
}

type ContentSafeResponse = { data: unknown; error: { message: string } | null };

export const safeContentApi = {
  async list(): Promise<SafeContent[]> {
    // Query the content_safe table (not in auto-generated types, so we bypass type checking)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = (await (supabase.from as any)('content_safe')
      .select('id,title,description,thumbnail_url,category')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(20)) as ContentSafeResponse;

    if (response.error) throw new Error(response.error.message);
    return Array.isArray(response.data) ? (response.data as SafeContent[]) : [];
  },
};
