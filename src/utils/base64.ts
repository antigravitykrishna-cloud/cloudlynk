const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

/**
 * Decodes standard base64 to bytes. Supabase Storage on React Native accepts a typed array but not
 * a Blob, and Hermes has no atob for binary data.
 */
export function decodeBase64(base64: string): Uint8Array {
  const length = base64.length;
  let byteLength = Math.floor(length * 0.75);
  if (base64[length - 1] === '=') byteLength--;
  if (base64[length - 2] === '=') byteLength--;

  const bytes = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i < length; i += 4) {
    const a = LOOKUP[base64.charCodeAt(i)];
    const b = LOOKUP[base64.charCodeAt(i + 1)];
    const c = LOOKUP[base64.charCodeAt(i + 2)];
    const d = LOOKUP[base64.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLength) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < byteLength) bytes[p++] = ((c & 3) << 6) | (d & 63);
  }
  return bytes;
}
