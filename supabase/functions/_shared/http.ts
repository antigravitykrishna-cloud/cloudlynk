// HTTP plumbing shared by the edge functions: CORS, JSON responses, errors that are safe to show
// the caller, and `servePost`, the wrapper every app-facing function is served with.

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

/** CORS headers for an endpoint any origin may call. The app authenticates with a bearer token. */
export function corsHeaders(): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  });
}

// Our own websites, for the functions a browser calls: Google Play requires a web page for
// account deletion, and it lives on the marketing site. Defaulted in code so that
// compliance-critical path cannot break on an unset variable; ALLOWED_ORIGINS (comma-separated)
// and APP_ORIGIN add staging and preview origins.
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '';
const SITE_ORIGINS = [
  'https://thecloudlynk.com',
  'https://www.thecloudlynk.com',
  APP_ORIGIN,
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(origin => origin.trim()),
].filter(Boolean);

/** CORS headers that let our own websites call the function from a browser. */
export function siteCorsHeaders(req: Request): Headers {
  const origin = req.headers.get('Origin') ?? '';
  return new Headers({
    'Access-Control-Allow-Origin': SITE_ORIGINS.includes(origin) ? origin : APP_ORIGIN || '*',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Content-Type': 'application/json',
  });
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Headers = corsHeaders(),
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** A failure with an HTTP status and a message that is safe to show the caller. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** The request's JSON body as an object, or {} when it is missing or not an object. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/** A string field of a JSON body, trimmed; '' when absent or not a string. */
export function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Sends a JSON response with this request's CORS headers. */
export type Respond = (body: unknown, status?: number) => Response;

type ServeOptions = {
  /** Let our own websites call it from a browser (siteCorsHeaders), not just the app. */
  allowSites?: boolean;
  /** Sent with a 500 for anything thrown that is not an HttpError; internals never reach the caller. */
  fallbackError?: string;
};

/**
 * Serves an app-facing function: answers the CORS preflight, refuses anything but POST, and turns
 * a thrown HttpError into its JSON response. Anything else thrown is logged under `name` and
 * answered with `fallbackError`.
 */
export function servePost(
  name: string,
  handler: (req: Request, respond: Respond) => Promise<Response>,
  {
    allowSites = false,
    fallbackError = 'Something went wrong. Please try again.',
  }: ServeOptions = {},
): void {
  Deno.serve(async req => {
    const headers = allowSites ? siteCorsHeaders(req) : corsHeaders();
    const respond: Respond = (body, status = 200) => jsonResponse(body, status, headers);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

    try {
      return await handler(req, respond);
    } catch (err) {
      if (err instanceof HttpError) return respond({ error: err.message }, err.status);
      console.error(`${name}:`, err instanceof Error ? err.message : err);
      return respond({ error: fallbackError }, 500);
    }
  });
}
