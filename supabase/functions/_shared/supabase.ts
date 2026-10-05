// Supabase clients for the edge functions, and who is calling.
//
// Two kinds of client, deliberately distinct:
//   userClient   acts AS the caller: row level security and the admin checks inside RPCs apply
//                exactly as they would in the app. Use it for anything the caller could do.
//   adminClient  the service role: bypasses row level security. Only for what the caller may
//                not do directly (tables the app never touches, other people's rows).

import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

export type { SupabaseClient, User };

const env = (name: string) => Deno.env.get(name) ?? '';

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function userClient(authorization: string): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** The signed-in caller, with a client acting as them. */
export type Caller = { user: User; db: SupabaseClient };

/** The caller, or null when the request has no valid session. */
export async function getCaller(req: Request): Promise<Caller | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return null;
  const db = userClient(authorization);
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  return error || !user ? null : { user, db };
}

/** The caller; throws a 401 when the request has no valid session. */
export async function requireCaller(
  req: Request,
  message = 'Authentication required',
): Promise<Caller> {
  const caller = await getCaller(req);
  if (!caller) throw new HttpError(401, message);
  return caller;
}

/**
 * Throws a 403 unless the caller is an admin. An early exit with a clear message, not the security
 * boundary: every admin RPC re-checks is_admin in the database.
 */
export async function requireAdmin({ user, db }: Caller): Promise<void> {
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!data?.is_admin) throw new HttpError(403, 'Admin access required');
}
