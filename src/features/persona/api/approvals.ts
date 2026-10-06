import { supabase } from '@/lib/supabase';

export interface PendingUser {
  user_id: string;
  persona: string;
  risk_score: number | null;
  created_at: string | null;
  needs_admin_approval: boolean | null;
  admin_approved_at: string | null;
}

export async function fetchPendingApprovals(): Promise<PendingUser[]> {
  const { data, error } = await supabase
    .from('user_personas')
    .select('user_id, persona, risk_score, created_at, needs_admin_approval, admin_approved_at')
    .eq('persona', 'organic')
    .eq('needs_admin_approval', true)
    .is('admin_approved_at', null)
    .is('rejected_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function currentAdminId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('Not signed in');
  return data.user.id;
}

export async function approveUser(userId: string): Promise<void> {
  const adminId = await currentAdminId();
  const { error } = await supabase
    .from('user_personas')
    .update({
      needs_admin_approval: false,
      admin_approved_at: new Date().toISOString(),
      admin_approved_by: adminId,
      rejected_at: null,
      rejected_by: null,
    })
    .eq('user_id', userId);

  if (error) throw error;
}

export async function rejectUser(userId: string): Promise<void> {
  const adminId = await currentAdminId();
  const { error } = await supabase
    .from('user_personas')
    .update({
      needs_admin_approval: false,
      rejected_at: new Date().toISOString(),
      rejected_by: adminId,
      admin_approved_at: null,
      admin_approved_by: null,
    })
    .eq('user_id', userId);

  if (error) throw error;
}
