/**
 * The text to show for a caught error: its own message when it has one, else `fallback`.
 * Supabase errors are plain objects with a `message`, not `Error` instances, so both are read, and
 * so is a bare string thrown by a native module.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string') return err.trim() ? err : fallback;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

/** The `code` of a caught error (Postgres / PostgREST, native modules), if it has one. */
export function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}
