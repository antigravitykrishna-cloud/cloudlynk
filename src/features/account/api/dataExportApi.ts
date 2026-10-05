import { supabase } from '@/lib/supabase';

export type DataExport = Record<string, unknown>;

export const dataExportApi = {
  /** Everything stored about the signed-in person, as one JSON document (GDPR-style export). */
  async exportMine(): Promise<DataExport> {
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('No data returned');
    return data as DataExport;
  },
};
