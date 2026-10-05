import { decodeBase64 } from '@/lib/base64';

const bytes = (s: string) => Array.from(Buffer.from(s, 'binary'));

describe('decodeBase64', () => {
  it.each(['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar'])('round-trips %p', text => {
    const encoded = Buffer.from(text, 'binary').toString('base64');
    expect(Array.from(decodeBase64(encoded))).toEqual(bytes(text));
  });

  it('decodes every byte value', () => {
    const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    expect(Array.from(decodeBase64(all.toString('base64')))).toEqual(Array.from(all));
  });
});
