/** The human-readable message of anything thrown, or `fallback` when there is none. */
export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const { message } = err as { message: unknown };
    if (typeof message === 'string' && message) return message;
  }
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/** The `code` of a thrown error (Supabase/PostgREST, native modules), if it has one. */
export function errorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const { code } = err as { code: unknown };
    if (typeof code === 'string' || typeof code === 'number') return String(code);
  }
  return undefined;
}
