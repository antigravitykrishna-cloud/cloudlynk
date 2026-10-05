/**
 * The text to show for a caught error: its own message when it has one, else `fallback`.
 * Supabase errors are plain objects with a `message`, not `Error` instances, so both are read.
 */
export function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
