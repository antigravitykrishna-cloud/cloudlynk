import { supabase, supabaseUrl } from '@/lib/supabase';

type Options = {
  signal?: AbortSignal;
  /** Thrown when there is no signed-in session. */
  signedOutMessage?: string;
  /** Thrown when the request never reaches the server (offline, DNS, TLS). */
  unreachableMessage?: string;
};

export type EdgeFunctionResponse<T> = {
  ok: boolean;
  status: number;
  /** The parsed JSON body, or null when the body was empty or not JSON. */
  data: T | null;
};

/**
 * POSTs JSON to one of our Supabase Edge Functions (supabase/functions/<name>) as the signed-in
 * user. Returns the status and body rather than throwing on a non-2xx answer, because each caller
 * words its own error from the server's `error` field.
 */
export async function callEdgeFunction<T = Record<string, unknown>>(
  name: string,
  body: object,
  {
    signal,
    signedOutMessage = 'Please sign in again.',
    unreachableMessage = 'Could not reach the server. Check your connection and try again.',
  }: Options = {},
): Promise<EdgeFunctionResponse<T & { error?: string }>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error(signedOutMessage);

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // An abort is the caller's own decision; let it surface as-is.
    if (signal?.aborted) throw err;
    throw new Error(unreachableMessage);
  }

  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}
