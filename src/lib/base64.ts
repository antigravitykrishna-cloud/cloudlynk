const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

/** Decodes standard (padded) base64 to bytes. React Native has no Buffer, and atob gives a string. */
export function decodeBase64(base64: string): Uint8Array {
  const len = base64.length;
  let bufferLength = Math.floor(len * 0.75);
  if (base64[len - 1] === '=') bufferLength--;
  if (base64[len - 2] === '=') bufferLength--;
  const buffer = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = LOOKUP[base64.charCodeAt(i)];
    const e2 = LOOKUP[base64.charCodeAt(i + 1)];
    const e3 = LOOKUP[base64.charCodeAt(i + 2)];
    const e4 = LOOKUP[base64.charCodeAt(i + 3)];
    buffer[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufferLength) buffer[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufferLength) buffer[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return buffer;
}
