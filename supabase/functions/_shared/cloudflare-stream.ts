// Cloudflare Stream's API for this account.
// Secrets: CLOUDFLARE_STREAM_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN.

import { HttpError } from './http.ts';

function credentials() {
  const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID');
  const apiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
  return accountId && apiToken ? { accountId, apiToken } : null;
}

export function streamConfigured(): boolean {
  return credentials() !== null;
}

/** Calls `accounts/<id>/stream/<path>`. Throws a 500 HttpError when the secrets are not set. */
export function streamApi(path: string, init: RequestInit = {}): Promise<Response> {
  const creds = credentials();
  if (!creds) {
    console.error('Cloudflare Stream secrets are not set');
    throw new HttpError(500, 'Video service is not configured.');
  }
  return fetch(`https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/stream/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

/**
 * Makes a video playable only through a signed token (requireSignedURLs). Idempotent. Every video
 * is locked like this; stream-playback-token hands out the tokens.
 */
export function lockVideo(uid: string): Promise<Response> {
  return streamApi(uid, {
    method: 'POST',
    body: JSON.stringify({ uid, requireSignedURLs: true }),
  });
}
